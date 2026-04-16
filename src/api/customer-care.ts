import { supabase } from '@/lib/supabase';

export type SourceFormat =
  | 'persimmon_warranty'
  | 'clixifix'
  | 'coastline_order'
  | 'wain_tasksheet'
  | 'other';

export type JobStatus = 'new' | 'scheduled' | 'completed';

export type JobPriority = 'urgent' | '7_day' | '14_day' | '21_day' | 'routine';

export type DefectCategory = 'paint' | 'sealant' | 'making_good' | 'other';

export interface CustomerCareDefect {
  id?: string;
  job_id?: string;
  location: string | null;
  category: DefectCategory | null;
  description: string | null;
  issue_number: string | null;
  created_at?: string;
}

export interface CustomerCareJob {
  id: string;
  developer_id: string | null;
  site_id: string | null;
  unit_reference: string | null;
  address: string | null;
  house_type: string | null;
  homeowner_name: string | null;
  homeowner_phone: string | null;
  homeowner_email: string | null;
  contact_notes: string | null;
  external_ref: string | null;
  source_format: SourceFormat | null;
  date_received: string | null;
  sla_date: string | null;
  priority: JobPriority | null;
  status: JobStatus;
  raised_by: string | null;
  assigned_decorator_id: string | null;
  appointment_date: string | null;
  date_completed: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerCareJobRow extends CustomerCareJob {
  developer_name: string | null;
  site_name: string | null;
  defect_count: number;
}

export interface ExtractedJob {
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
  source_format: SourceFormat;
  date_received: string | null;
  sla_date: string | null;
  priority: JobPriority | null;
  raised_by: string | null;
  defects: Array<{
    location: string | null;
    category: DefectCategory | null;
    description: string | null;
    issue_number: string | null;
  }>;
  suggested_developer_id: string | null;
  suggested_site_id: string | null;
}

const BUCKET = 'customer-care';

export async function uploadCustomerCarePdf(file: File): Promise<string> {
  const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: 'application/pdf',
  });
  if (error) throw error;
  return path;
}

export async function getCustomerCarePdfSignedUrl(
  path: string,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function extractCustomerCarePdf(path: string): Promise<ExtractedJob> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const { data, error } = await supabase.functions.invoke('extract-customer-care-pdf', {
    body: { path },
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (error) {
    let detail = '';
    try {
      const ctx = (error as { context?: unknown }).context;
      if (ctx instanceof Response) {
        detail = ` — ${(await ctx.text()).slice(0, 500)}`;
      } else if (ctx) {
        detail = ` — ${JSON.stringify(ctx).slice(0, 500)}`;
      }
    } catch {
      // ignore
    }
    throw new Error(`${(error as Error).message}${detail}`);
  }
  return data as ExtractedJob;
}

export async function fetchCustomerCareJobs(filters: {
  status?: JobStatus | null;
  developerId?: string | null;
} = {}): Promise<CustomerCareJobRow[]> {
  let query = supabase
    .from('customer_care_jobs')
    .select(
      `*,
       developer:developers(id, name),
       site:sites(id, name),
       customer_care_defects(id)`,
    )
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.developerId) query = query.eq('developer_id', filters.developerId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    developer_name: row.developer?.name ?? null,
    site_name: row.site?.name ?? null,
    defect_count: Array.isArray(row.customer_care_defects)
      ? row.customer_care_defects.length
      : 0,
  })) as CustomerCareJobRow[];
}

export async function fetchCustomerCareJob(
  id: string,
): Promise<{ job: CustomerCareJob; defects: CustomerCareDefect[] }> {
  const { data, error } = await supabase
    .from('customer_care_jobs')
    .select('*, customer_care_defects(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  const { customer_care_defects, ...job } = data as any;
  return {
    job: job as CustomerCareJob,
    defects: (customer_care_defects ?? []) as CustomerCareDefect[],
  };
}

export interface CreateCustomerCareJobInput {
  job: Omit<CustomerCareJob, 'id' | 'created_at' | 'updated_at' | 'status'> & {
    status?: JobStatus;
  };
  defects: Array<Omit<CustomerCareDefect, 'id' | 'job_id' | 'created_at'>>;
}

export async function createCustomerCareJob(
  input: CreateCustomerCareJobInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('customer_care_jobs')
    .insert(input.job)
    .select('id')
    .single();
  if (error) throw error;
  const jobId = (data as { id: string }).id;

  if (input.defects.length > 0) {
    const rows = input.defects.map((d) => ({ ...d, job_id: jobId }));
    const { error: defectError } = await supabase.from('customer_care_defects').insert(rows);
    if (defectError) throw defectError;
  }
  return { id: jobId };
}

export async function updateCustomerCareJob(
  id: string,
  patch: Partial<CustomerCareJob>,
): Promise<void> {
  const { error } = await supabase
    .from('customer_care_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCustomerCareJob(id: string): Promise<void> {
  const { error } = await supabase.from('customer_care_jobs').delete().eq('id', id);
  if (error) throw error;
}

export async function countOpenCustomerCareJobs(): Promise<number | null> {
  const { count, error } = await supabase
    .from('customer_care_jobs')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'completed');
  if (error || count == null) return null;
  return count;
}

export function subscribeToCustomerCareJobChanges(onChange: () => void): () => void {
  const channel = supabase
    .channel('customer-care-jobs')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'customer_care_jobs' },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchDeveloperOptions(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from('developers')
    .select('id, name')
    .eq('is_archived', false)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function fetchSiteOptionsForDeveloper(
  developerId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from('sites')
    .select('id, name')
    .eq('developer_id', developerId)
    .eq('is_archived', false)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function fetchDecoratorOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  const [profilesRes, rolesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, user_id, first_name, last_name')
      .or('status.eq.approved,status.is.null'),
    supabase.from('user_roles').select('user_id, role').eq('role', 'decorator'),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (rolesRes.error) throw rolesRes.error;

  const decoratorUserIds = new Set(
    (rolesRes.data ?? []).map((r: any) => r.user_id as string),
  );
  return (profilesRes.data ?? [])
    .filter((p: any) => decoratorUserIds.has(p.user_id))
    .map((p: any) => ({
      id: p.id as string,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
