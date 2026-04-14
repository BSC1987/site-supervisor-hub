import { supabase } from '@/lib/supabase';
import type { Developer, FeedItem, FormType, Site } from '@/components/activity-feed/types';

interface RawRow {
  id: string;
  user_id?: string;
  submitted_by?: string;
  site_id?: string | null;
  site_name?: string | null;
  plot_name?: string | null;
  site?: { name: string } | null;
  plot?: { plot_name: string } | null;
  status?: string | null;
  created_at: string;
}

const TABLE_CONFIG: { table: string; formType: FormType; select: string; hasStatus: boolean; hasSite: boolean; userIdField: string }[] = [
  { table: 'sign_offs',                  formType: 'Sign Off',         select: 'id, user_id, site_id, site_name, plot_name, created_at',         hasStatus: false, hasSite: true,  userIdField: 'user_id' },
  { table: 'hourly_agreements',          formType: 'Hourly Agreement', select: 'id, user_id, site_id, site_name, plot_name, created_at',         hasStatus: false, hasSite: true,  userIdField: 'user_id' },
  { table: 'invoices',                   formType: 'Invoice',          select: 'id, user_id, status, created_at',                                hasStatus: true,  hasSite: false, userIdField: 'user_id' },
  { table: 'issue_report_submissions',   formType: 'Issue Report',     select: 'id, submitted_by, site_id, site:sites(name), plot:plots(plot_name), created_at', hasStatus: false, hasSite: true,  userIdField: 'submitted_by' },
  { table: 'quality_report_submissions', formType: 'Quality Report',   select: 'id, submitted_by, site_id, site_name, plot_name, created_at',   hasStatus: false, hasSite: true,  userIdField: 'submitted_by' },
];

const ACTIVITY_TABLES = TABLE_CONFIG.map(c => c.table);

export async function fetchFeed(filters: {
  formType: string;
  siteId: string;
}): Promise<FeedItem[]> {
  const tables = filters.formType === 'all'
    ? TABLE_CONFIG
    : TABLE_CONFIG.filter(t => t.formType === filters.formType);

  const results = await Promise.allSettled(
    tables.map(async (cfg) => {
      let query = supabase
        .from(cfg.table)
        .select(cfg.select)
        .order('created_at', { ascending: false });

      if (filters.siteId !== 'all' && cfg.hasSite) {
        query = query.eq('site_id', filters.siteId);
      }

      const { data, error } = await query;
      if (error) throw new Error(`${cfg.table}: ${error.message}`);
      return { cfg, rows: (data || []) as RawRow[] };
    }),
  );

  const rawItems: { cfg: typeof TABLE_CONFIG[number]; row: RawRow }[] = [];
  const userIds = new Set<string>();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const row of result.value.rows) {
      rawItems.push({ cfg: result.value.cfg, row });
      const uid = row[result.value.cfg.userIdField as keyof RawRow] as string | undefined;
      if (uid) userIds.add(uid);
    }
  }

  const nameMap = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', [...userIds]);
    for (const p of (profiles || []) as { user_id: string; first_name: string | null; last_name: string | null }[]) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
      nameMap.set(p.user_id, name || 'Unknown');
    }
  }

  const items: FeedItem[] = rawItems.map(({ cfg, row }) => {
    const uid = row[cfg.userIdField as keyof RawRow] as string | undefined;
    const siteName = row.site_name || (row.site as any)?.name || null;
    const plotName = row.plot_name || (row.plot as any)?.plot_name || null;
    return {
      id: row.id,
      form_type: cfg.formType,
      submitted_by: uid ? (nameMap.get(uid) || 'Unknown') : 'Unknown',
      site_id: row.site_id || null,
      site_name: siteName,
      plot_name: plotName,
      created_at: row.created_at,
      status: cfg.hasStatus ? (row.status || null) : null,
      source_table: cfg.table,
    };
  });

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return items;
}

export async function fetchDetail(sourceTable: string, id: string): Promise<any> {
  if (sourceTable === 'issue_report_submissions') {
    const { data, error } = await supabase
      .from(sourceTable)
      .select('*, site:sites(name), plot:plots(plot_name)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return { ...data, site_name: data.site?.name ?? null, plot_name: data.plot?.plot_name ?? null };
  }
  if (sourceTable === 'invoices') {
    const [invRes, plotRes, haRes, miscRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', id).single(),
      supabase.from('invoice_plot_items').select('*').eq('invoice_id', id).order('created_at'),
      supabase.from('invoice_hourly_agreements').select('*, hourly_agreement:hourly_agreements(site_name, plot_name, hours, rate, descriptions, created_at)').eq('invoice_id', id),
      supabase.from('invoice_misc_items').select('*').eq('invoice_id', id).order('created_at'),
    ]);
    if (invRes.error) throw invRes.error;
    return { ...invRes.data, plot_items: plotRes.data || [], hourly_items: haRes.data || [], misc_items: miscRes.data || [] };
  }
  const { data, error } = await supabase
    .from(sourceTable)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export interface ActivityFilterOptions {
  sites: Site[];
  developers: Developer[];
}

/**
 * Load the dropdown options for the activity-feed filters: active sites and
 * non-archived developers. Errors fall back to empty lists (matching prior
 * inline behaviour, which silently ignored failures).
 */
export async function fetchActivityFilterOptions(): Promise<ActivityFilterOptions> {
  const [siteRes, devRes] = await Promise.all([
    supabase.from('sites').select('id, name, developer_id').eq('status', 'active').order('name'),
    supabase.from('developers').select('id, name').eq('is_archived', false).order('name'),
  ]);
  return {
    sites: (siteRes.data ?? []) as Site[],
    developers: (devRes.data ?? []) as Developer[],
  };
}

/**
 * Delete an activity-feed row by source table + id. Throws the raw Supabase
 * error so callers can inspect `.code` (e.g. '23503' = invoice FK violation).
 */
export async function deleteActivityItem(sourceTable: string, id: string): Promise<void> {
  const { error } = await supabase.from(sourceTable).delete().eq('id', id);
  if (error) throw error;
}

/**
 * Subscribe to INSERT/UPDATE postgres-changes events on every activity
 * source table. Returns the unsubscribe function.
 */
export function subscribeToActivityChanges(onChange: () => void): () => void {
  const channel = supabase.channel('activity-feed');
  for (const table of ACTIVITY_TABLES) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table }, onChange);
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, onChange);
  }
  channel.subscribe();
  return () => { supabase.removeChannel(channel); };
}
