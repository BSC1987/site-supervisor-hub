// Edge function: extracts structured Customer Care job data from an uploaded PDF.
// Flow:
//   1. Caller uploads a PDF to the `customer-care` storage bucket (path in req body).
//   2. Verify caller is an authenticated admin via user_roles.
//   3. Download PDF server-side (service role), send to Claude as base64 document.
//   4. Parse structured JSON, fuzzy-match developer/site to existing rows, return.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = 'claude-sonnet-4-5-20250929';

// Comma-separated allowlist of browser origins permitted to call this function.
// Example: "https://admin.cordec.co.uk,https://site-supervisor-hub.vercel.app"
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

// Storage paths must be under `uploads/` and contain only safe characters.
// Rejects path traversal (`..`), absolute paths, and unusual characters.
const SAFE_PATH_RE = /^uploads\/[A-Za-z0-9._\-\/]+\.pdf$/i;
function isSafeStoragePath(path: string): boolean {
  if (!SAFE_PATH_RE.test(path)) return false;
  if (path.includes('..')) return false;
  return true;
}

const SYSTEM_PROMPT = `You extract structured data from UK housebuilder customer-care / warranty PDFs for a decorating contractor (Cordec Ltd).

Return ONLY a single JSON object matching this TypeScript type (no prose, no markdown fences):

{
  "developer_name": string | null,     // The contractor / housebuilder client who issued the order to Cordec (e.g. "Persimmon Homes", "Wain Homes", "Gilbert & Goode", "EBC Partnerships"). For Coastline-format orders the developer is "EBC Partnerships" (the contractor named at the top), NOT "Coastline Housing" (the end client).
  "site_name": string | null,          // Development / scheme name (e.g. "Trevithick Manor Park", "Tremena View", "Trevemper")
  "unit_reference": string | null,     // Plot number or property code (e.g. "014", "18", "074", "CHARTWA015")
  "address": string | null,            // Full property address, comma-separated
  "house_type": string | null,         // e.g. "CARBIS" (Wain) — null if absent
  "homeowner_name": string | null,     // Primary homeowner; prefer the most complete name available
  "homeowner_phone": string | null,    // Mobile preferred, else home/work. Digits only with leading 0 (e.g. "07816813331")
  "homeowner_email": string | null,
  "contact_notes": string | null,      // Any access notes, secondary contact, or "correspondence via X not resident" — null if none
  "external_ref": string | null,       // Their reference: Persimmon Ref (e.g. "040980"), Clixifix Defect ID, Coastline Works Order (e.g. "CHX410803"), Wain Call No / Task No
  "source_format": "persimmon_warranty" | "clixifix" | "coastline_order" | "wain_tasksheet" | "other",
  "date_received": string | null,      // ISO date (YYYY-MM-DD). Persimmon "Received", Clixifix "Date Defect Reported", Coastline "Created on", Wain "Date Problem Reported"
  "sla_date": string | null,           // ISO date. Persimmon "SLA/Complete", Clixifix "Deadline", Coastline "Target Date", Wain: derive from priority + date_received
  "priority": "urgent" | "7_day" | "14_day" | "21_day" | "routine" | null,
  "raised_by": string | null,          // Persimmon "Created By", Coastline "Raised By", Wain "CC Operative"
  "defects": [
    {
      "location": string | null,       // Room/area (e.g. "Kitchen", "GFLOOR", "GARE", "Lounge")
      "category": "paint" | "sealant" | "making_good" | "other" | null,
      "description": string | null,    // The actual defect description
      "issue_number": string | null    // Per-defect reference (Persimmon "Issue No", Clixifix "Defect ID", Wain "Issue No")
    }
  ]
}

Format detection hints:
- Header says "WARRANTY" and "Persimmon Homes" → "persimmon_warranty". Defects are in the Location/Category/Issue/Instructions table.
- Header says "NOMINATION INSTRUCTIONS" with Clixifix logo → "clixifix". developer_name comes from "Nominated By:". Defects on following pages with "Defect ID - NNNNNN".
- Header says "Contractor Order" with Coastline branding, "Invoice to: Coastline House" → "coastline_order". developer_name is "EBC Partnerships" (the "Contractor:" field at the top — the entity that issues the order). Coastline Housing is the end client, not the developer. Defects are embedded in "Order Description:" as free text — split them into individual defects when multiple rooms/issues are listed.
- Header says "Customer Care Task Sheet" with "Wain Homes" in footer → "wain_tasksheet". Defects in "Problems Reported" table.

Priority mapping:
- "Target 7" / "7 Days" / "7 Day" → "7_day"
- "Target 14" / "14 Days" → "14_day"
- "Target 21" / "21 Days" / "20 Day Routine" → "21_day"
- "Urgent" / "Emergency" / "24 hour" → "urgent"
- "Routine" / "Low" (Clixifix) / anything longer than 21 days → "routine"

Category mapping for defects (based on description keywords):
- Contains "paint", "repaint", "decoration", "touch up" → "paint"
- Contains "sealant", "silicone", "mastic", "caulk" → "sealant"
- Contains "making good", "make good", "fill", "scratch", "dent", "damage" → "making_good"
- Otherwise → "other"

Dates: convert from DD/MM/YY or DD/MM/YYYY to YYYY-MM-DD. Assume 20YY for two-digit years. If only a date-and-time appears, take the date part.

For Coastline "Order Description" free-text defects, split on room keywords (Kitchen, Lounge, Bedroom, Bathroom, Stairs, Hall, Landing) or bullet structure, creating one defect per location. Example: "Kitchen - Marks on kitchen door & skirting. Lounge – dips in screed by patio doors..." → two defects, location "Kitchen" and "Lounge" respectively.

If a field cannot be determined, return null. Do not invent values. Return at least one defect object (with nulls if you truly cannot find any defect content).`;

interface ExtractedShape {
  developer_name: string | null;
  site_name: string | null;
  unit_reference: string | null;
  address: string | null;
  house_type: string | null;
  homeowner_name: string | null;
  homeowner_phone: string | null;
  homeowner_email: string | null;
  contact_notes: string | null;
  external_ref: string | null;
  source_format: string;
  date_received: string | null;
  sla_date: string | null;
  priority: string | null;
  raised_by: string | null;
  defects: Array<{
    location: string | null;
    category: string | null;
    description: string | null;
    issue_number: string | null;
  }>;
}

function normalise(s: string | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fuzzyMatchDeveloper(
  extractedName: string | null,
  sourceFormat: string,
  developers: Array<{ id: string; name: string }>,
): string | null {
  const hintByFormat: Record<string, string> = {
    persimmon_warranty: 'persimmon',
    clixifix: '',
    coastline_order: 'ebc',
    wain_tasksheet: 'wain',
  };
  const hint = hintByFormat[sourceFormat] ?? '';
  const needle = normalise(extractedName);

  for (const d of developers) {
    const hay = normalise(d.name);
    if (needle && (hay.includes(needle) || needle.includes(hay))) return d.id;
  }
  if (hint) {
    for (const d of developers) {
      if (normalise(d.name).includes(hint)) return d.id;
    }
  }
  return null;
}

function fuzzyMatchSite(
  extractedName: string | null,
  developerId: string | null,
  sites: Array<{ id: string; name: string; developer_id: string | null }>,
): string | null {
  const needle = normalise(extractedName);
  if (!needle) return null;
  const scoped = developerId ? sites.filter((s) => s.developer_id === developerId) : sites;
  for (const s of scoped) {
    const hay = normalise(s.name);
    if (hay.includes(needle) || needle.includes(hay)) return s.id;
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function callClaude(pdfBase64: string): Promise<ExtractedShape> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            {
              type: 'text',
              text: 'Extract the customer-care job data as JSON per the schema. Return only the JSON object.',
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${errorText}`);
  }

  const body = await resp.json();
  const text = body?.content?.[0]?.text;
  if (!text) throw new Error('Anthropic returned no text content');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not parse JSON from model output: ${text.slice(0, 300)}`);
  return JSON.parse(jsonMatch[0]) as ExtractedShape;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const { path } = await req.json();
    if (!path || typeof path !== 'string' || !isSafeStoragePath(path)) {
      return new Response(JSON.stringify({ error: 'Invalid "path" in body' }), {
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const { data: pdfBlob, error: dlError } = await admin.storage
      .from('customer-care')
      .download(path);
    if (dlError || !pdfBlob) {
      return new Response(JSON.stringify({ error: 'PDF not found' }), {
        status: 404,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
    const pdfBase64 = toBase64(pdfBytes);

    const extracted = await callClaude(pdfBase64);

    const [{ data: developers }, { data: sites }] = await Promise.all([
      admin.from('developers').select('id, name'),
      admin.from('sites').select('id, name, developer_id'),
    ]);

    const suggested_developer_id = fuzzyMatchDeveloper(
      extracted.developer_name,
      extracted.source_format,
      (developers ?? []) as Array<{ id: string; name: string }>,
    );
    const suggested_site_id = fuzzyMatchSite(
      extracted.site_name,
      suggested_developer_id,
      (sites ?? []) as Array<{ id: string; name: string; developer_id: string | null }>,
    );

    return new Response(
      JSON.stringify({ ...extracted, suggested_developer_id, suggested_site_id }),
      { headers: { ...cors, 'content-type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('extract-customer-care-pdf error:', message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
});
