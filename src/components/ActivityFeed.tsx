import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertTriangle, Clock, CheckSquare, ClipboardCheck, FileText,
  Filter, RefreshCw, Trash2, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FormType = 'Issue Report' | 'Hourly Agreement' | 'Sign Off' | 'Quality Report' | 'Invoice';

interface FeedItem {
  id: string;
  form_type: FormType;
  submitted_by: string;
  site_id: string | null;
  site_name: string | null;
  plot_name: string | null;
  created_at: string;
  status: string | null;
  source_table: string;
}

interface Site {
  id: string;
  name: string;
  developer_id: string;
}

interface Developer {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatCurrency(value: number | null) {
  if (value == null) return '—';
  return `£${Number(value).toFixed(2)}`;
}

const FORM_TYPE_CONFIG: Record<FormType, { icon: React.ElementType; colour: string }> = {
  'Issue Report':      { icon: AlertTriangle,  colour: 'text-red-400' },
  'Hourly Agreement':  { icon: Clock,          colour: 'text-amber-400' },
  'Sign Off':          { icon: CheckSquare,    colour: 'text-green-400' },
  'Quality Report':    { icon: ClipboardCheck, colour: 'text-blue-400' },
  'Invoice':           { icon: FileText,       colour: 'text-purple-400' },
};

function statusBadge(status: string | null) {
  if (!status) return null;
  const lower = status.toLowerCase();
  let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
  let className = '';
  if (lower === 'pending' || lower === 'submitted') {
    variant = 'outline';
    className = 'border-amber-500/50 text-amber-400';
  } else if (lower === 'approved' || lower === 'completed' || lower === 'paid') {
    variant = 'outline';
    className = 'border-green-500/50 text-green-400';
  } else if (lower === 'flagged' || lower === 'rejected') {
    variant = 'destructive';
  }
  return (
    <Badge variant={variant} className={className}>
      {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail field renderer                                              */
/* ------------------------------------------------------------------ */

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-sm mt-0.5">{value}</dd>
    </div>
  );
}

function renderSignOffDetail(record: any, submittedBy: string) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Task type" value={record.task_type} />
      <DetailField label="Manager" value={record.manager_name} />
      <DetailField label="Manager email" value={record.manager_email} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {record.notes && (
        <div className="col-span-2">
          <DetailField label="Notes" value={record.notes} />
        </div>
      )}
      {record.manager_signature && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Manager Signature</dt>
          <dd className="mt-1">
            <img src={record.manager_signature} alt="Manager signature" className="h-20 rounded border border-border bg-white p-1" />
          </dd>
        </div>
      )}
    </dl>
  );
}

function renderHourlyAgreementDetail(record: any, submittedBy: string) {
  const descriptions = record.descriptions as string[] | null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Hours" value={record.hours} />
      <DetailField label="Rate" value={formatCurrency(record.rate)} />
      <DetailField label="Total" value={record.hours && record.rate ? formatCurrency(record.hours * record.rate) : '—'} />
      <DetailField label="Invoiced" value={record.invoiced ? 'Yes' : 'No'} />
      <DetailField label="Manager email" value={record.manager_email} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {descriptions && descriptions.length > 0 && (
        <div className="col-span-2">
          <DetailField label="Descriptions" value={
            <ul className="list-disc list-inside space-y-0.5">
              {descriptions.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          } />
        </div>
      )}
      {record.other_description && (
        <div className="col-span-2">
          <DetailField label="Other description" value={record.other_description} />
        </div>
      )}
      {record.photo_urls && record.photo_urls.length > 0 && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Photos</dt>
          <dd className="flex gap-2 mt-1 flex-wrap">
            {(record.photo_urls as string[]).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover rounded border border-border" />
              </a>
            ))}
          </dd>
        </div>
      )}
      {record.signature_data && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Signature</dt>
          <dd className="mt-1">
            <img src={record.signature_data} alt="Signature" className="h-20 rounded border border-border bg-white p-1" />
          </dd>
        </div>
      )}
    </dl>
  );
}

function renderIssueReportDetail(record: any, submittedBy: string) {
  const issues = record.issues as string[] | null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Task" value={record.task_name} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {issues && issues.length > 0 && (
        <div className="col-span-2">
          <DetailField label="Issues" value={
            <ul className="list-disc list-inside space-y-0.5">
              {issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          } />
        </div>
      )}
      {record.photo_urls && record.photo_urls.length > 0 && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Photos</dt>
          <dd className="flex gap-2 mt-1 flex-wrap">
            {(record.photo_urls as string[]).map((url: string, i: number) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover rounded border border-border" />
              </a>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}

function renderQualityReportDetail(record: any, submittedBy: string) {
  const photos = record.photos as any[] | null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {photos && photos.length > 0 && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Photos</dt>
          <dd className="flex gap-2 mt-1 flex-wrap">
            {photos.map((photo: any, i: number) => {
              const url = typeof photo === 'string' ? photo : photo?.url || photo?.path;
              if (!url) return null;
              return (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover rounded border border-border" />
                </a>
              );
            })}
          </dd>
        </div>
      )}
    </dl>
  );
}

function renderInvoiceDetail(record: any, submittedBy: string) {
  const plotItems = (record.plot_items || []) as any[];
  const hourlyItems = (record.hourly_items || []) as any[];
  const miscItems = (record.misc_items || []) as any[];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <DetailField label="Reference" value={record.reference_number} />
        <DetailField label="Invoice #" value={record.invoice_number} />
        <DetailField label="Submitted by" value={submittedBy} />
        <DetailField label="Status" value={statusBadge(record.status)} />
        <DetailField label="Total amount" value={formatCurrency(record.total_amount)} />
        <DetailField label="Submitted at" value={formatDateTime(record.submitted_at)} />
        <DetailField label="Created" value={formatDateTime(record.created_at)} />
        {record.notes && (
          <div className="col-span-2">
            <DetailField label="Notes" value={record.notes} />
          </div>
        )}
      </dl>

      {plotItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Plot Items</h4>
          <div className="border rounded text-sm divide-y divide-border">
            {plotItems.map((item: any, i: number) => (
              <div key={i} className="px-3 py-2 grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <span className="font-medium">{item.site_name}</span>
                  <span className="text-muted-foreground"> / Plot {item.plot_name}</span>
                  <span className="text-muted-foreground"> / {item.task_type}</span>
                  {item.price_type && <span className="text-muted-foreground"> ({item.price_type})</span>}
                  {item.note && <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>}
                </div>
                <div className="text-right whitespace-nowrap">
                  {item.percentage != null && item.percentage < 100 && (
                    <span className="text-muted-foreground text-xs mr-1">{item.percentage}% of {formatCurrency(item.full_price)}</span>
                  )}
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hourlyItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Hourly Agreements</h4>
          <div className="border rounded text-sm divide-y divide-border">
            {hourlyItems.map((item: any, i: number) => {
              const ha = item.hourly_agreement;
              return (
                <div key={i} className="px-3 py-2 grid grid-cols-[1fr_auto] gap-2">
                  <div>
                    <span className="font-medium">{ha?.site_name || '—'}</span>
                    <span className="text-muted-foreground"> / Plot {ha?.plot_name || '—'}</span>
                    <span className="text-muted-foreground"> / {ha?.hours}h @ {formatCurrency(ha?.rate)}</span>
                  </div>
                  <div className="text-right font-medium">
                    {ha?.hours && ha?.rate ? formatCurrency(ha.hours * ha.rate) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {miscItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Misc Items</h4>
          <div className="border rounded text-sm divide-y divide-border">
            {miscItems.map((item: any, i: number) => (
              <div key={i} className="px-3 py-2 grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <span className="font-medium">{item.description || 'Misc item'}</span>
                  {item.hours && <span className="text-muted-foreground"> / {item.hours}h @ {formatCurrency(item.rate)}</span>}
                  {item.note && <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>}
                </div>
                <div className="text-right font-medium">{formatCurrency(item.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {record.document_urls && record.document_urls.length > 0 && (
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Documents</dt>
          <dd className="flex flex-col gap-1">
            {(record.document_urls as string[]).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:underline inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                Document {i + 1}
              </a>
            ))}
          </dd>
        </div>
      )}
    </div>
  );
}

function renderGenericDetail(record: any, submittedBy: string) {
  // Fallback for issue_reports / quality_reports when those tables exist
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Status" value={statusBadge(record.status)} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {record.notes && (
        <div className="col-span-2">
          <DetailField label="Notes" value={record.notes} />
        </div>
      )}
      {record.description && (
        <div className="col-span-2">
          <DetailField label="Description" value={record.description} />
        </div>
      )}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/*  Data fetching                                                      */
/* ------------------------------------------------------------------ */

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

async function fetchFeed(filters: {
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

async function fetchDetail(sourceTable: string, id: string): Promise<any> {
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formTypeFilter, setFormTypeFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');
  const [developerFilter, setDeveloperFilter] = useState('all');
  const [submitterFilter, setSubmitterFilter] = useState('all');
  const [sites, setSites] = useState<Site[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [page, setPage] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const PAGE_SIZE = 100;

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState<FeedItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Detail state
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [detailRecord, setDetailRecord] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Load filter options
  useEffect(() => {
    (async () => {
      const [siteRes, devRes] = await Promise.all([
        supabase.from('sites').select('id, name, developer_id').eq('status', 'active').order('name'),
        supabase.from('developers').select('id, name').eq('is_archived', false).order('name'),
      ]);
      if (siteRes.data) setSites(siteRes.data as Site[]);
      if (devRes.data) setDevelopers(devRes.data as Developer[]);
    })();
  }, []);

  // Filtered sites based on developer selection
  const filteredSites = developerFilter === 'all'
    ? sites
    : sites.filter(s => s.developer_id === developerFilter);

  // Reset site filter when developer changes and selected site isn't in new list
  useEffect(() => {
    if (siteFilter !== 'all' && !filteredSites.find(s => s.id === siteFilter)) {
      setSiteFilter('all');
    }
  }, [developerFilter, filteredSites, siteFilter]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFeed({
        formType: formTypeFilter,
        siteId: siteFilter,
      });
      setItems(data);
    } catch {
      toast.error('Failed to load activity feed');
    }
    setLoading(false);
  }, [formTypeFilter, siteFilter]);

  // Initial load + reload on filter change
  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Unique submitter names for filter dropdown
  const submitters = useMemo(() => {
    const names = [...new Set(items.map(i => i.submitted_by))].filter(n => n !== 'Unknown');
    return names.sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Client-side filtering by developer and submitter
  const filteredItems = useMemo(() => {
    let result = items;
    if (developerFilter !== 'all') {
      const devSiteIds = new Set(sites.filter(s => s.developer_id === developerFilter).map(s => s.id));
      result = result.filter(i => i.site_id && devSiteIds.has(i.site_id));
    }
    if (submitterFilter !== 'all') {
      result = result.filter(i => i.submitted_by === submitterFilter);
    }
    return result;
  }, [items, developerFilter, submitterFilter, sites]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [formTypeFilter, siteFilter, developerFilter, submitterFilter]);

  // Realtime subscriptions
  useEffect(() => {
    const tables = ['sign_offs', 'hourly_agreements', 'invoices', 'issue_report_submissions', 'quality_report_submissions'];
    const channel = supabase.channel('activity-feed');

    for (const table of tables) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table }, () => loadFeed());
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, () => loadFeed());
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => { supabase.removeChannel(channel); };
  }, [loadFeed]);

  // Open detail dialog
  const handleRowClick = async (item: FeedItem) => {
    setSelectedItem(item);
    setDetailRecord(null);
    setLoadingDetail(true);
    try {
      const record = await fetchDetail(item.source_table, item.id);
      setDetailRecord(record);
    } catch {
      toast.error('Failed to load submission details');
      setSelectedItem(null);
    }
    setLoadingDetail(false);
  };

  // Delete handler
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from(confirmDelete.source_table)
      .delete()
      .eq('id', confirmDelete.id);
    setDeleting(false);
    if (error) {
      if (error.code === '23503') {
        toast.error('This submission is linked to an invoice and cannot be deleted');
      } else {
        toast.error('Failed to delete: ' + error.message);
      }
      return;
    }
    toast.success(`${confirmDelete.form_type} deleted`);
    setConfirmDelete(null);
    setItems(prev => prev.filter(i => !(i.source_table === confirmDelete.source_table && i.id === confirmDelete.id)));
  };


  // Render detail content based on form type
  const renderDetail = () => {
    if (!selectedItem || !detailRecord) return null;
    switch (selectedItem.form_type) {
      case 'Sign Off':
        return renderSignOffDetail(detailRecord, selectedItem.submitted_by);
      case 'Hourly Agreement':
        return renderHourlyAgreementDetail(detailRecord, selectedItem.submitted_by);
      case 'Invoice':
        return renderInvoiceDetail(detailRecord, selectedItem.submitted_by);
      case 'Issue Report':
        return renderIssueReportDetail(detailRecord, selectedItem.submitted_by);
      case 'Quality Report':
        return renderQualityReportDetail(detailRecord, selectedItem.submitted_by);
      default:
        return renderGenericDetail(detailRecord, selectedItem.submitted_by);
    }
  };

  return (
    <div className="border rounded-lg bg-card">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border/60 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent Submissions
          </h2>
          {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />

          <Select value={formTypeFilter} onValueChange={setFormTypeFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="Issue Report">Issue Reports</SelectItem>
              <SelectItem value="Hourly Agreement">Hourly Agreements</SelectItem>
              <SelectItem value="Sign Off">Sign Offs</SelectItem>
              <SelectItem value="Quality Report">Quality Reports</SelectItem>
              <SelectItem value="Invoice">Invoices</SelectItem>
            </SelectContent>
          </Select>

          <Select value={developerFilter} onValueChange={setDeveloperFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="All developers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All developers</SelectItem>
              {developers.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="All sites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {filteredSites.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={submitterFilter} onValueChange={setSubmitterFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="All submitters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All submitters</SelectItem>
              {submitters.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Feed table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submitted by</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Developer</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Site</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No submissions found
                </td>
              </tr>
            )}
            {pagedItems.map((item) => {
              const config = FORM_TYPE_CONFIG[item.form_type];
              const Icon = config.icon;
              const isPending = item.status && ['pending', 'submitted'].includes(item.status.toLowerCase());

              // Resolve developer name from site_id
              const site = item.site_id ? sites.find(s => s.id === item.site_id) : null;
              const developer = site ? developers.find(d => d.id === site.developer_id) : null;

              return (
                <tr
                  key={`${item.source_table}-${item.id}`}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                    isPending ? 'border-l-2 border-l-amber-500' : ''
                  }`}
                  onClick={() => handleRowClick(item)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 shrink-0 ${config.colour}`} />
                      <span className="font-medium whitespace-nowrap">{item.form_type}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.submitted_by}</td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{developer?.name || '—'}</td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{item.site_name || '—'}</td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{item.plot_name || '—'}</td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap text-xs">{timeAgo(item.created_at)}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title="Delete submission"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(item);
                        setDeleteConfirmText('');
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between text-sm text-muted-foreground">
          <span>{filteredItems.length} submissions</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <span className="text-xs">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedItem} onOpenChange={open => { if (!open) setSelectedItem(null); }}>
        <DialogContent className="max-w-2xl !grid-rows-[auto_1fr_auto] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedItem && (() => {
                const cfg = FORM_TYPE_CONFIG[selectedItem.form_type];
                const Icon = cfg.icon;
                return <Icon className={`h-5 w-5 ${cfg.colour}`} />;
              })()}
              {selectedItem?.form_type}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto pr-1 -mr-1">
            {loadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              renderDetail()
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedItem(null)}>Close</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedItem) {
                  setSelectedItem(null);
                  setConfirmDelete(selectedItem);
                  setDeleteConfirmText('');
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={open => { if (!open) { setConfirmDelete(null); setDeleteConfirmText(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Permanently delete this <span className="font-medium text-foreground">{confirmDelete?.form_type}</span> from{' '}
              <span className="font-medium text-foreground">{confirmDelete?.submitted_by}</span>
              {confirmDelete?.site_name && <> at <span className="font-medium text-foreground">{confirmDelete.site_name}</span></>}
              ? This cannot be undone.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">
                Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm
              </Label>
              <Input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleting || deleteConfirmText !== 'DELETE'}
              onClick={handleDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
