import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Filter, RefreshCw, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FeedItem, Site, Developer } from '@/components/activity-feed/types';
import { timeAgo, FORM_TYPE_CONFIG } from '@/components/activity-feed/utils';
import {
  renderSignOffDetail,
  renderHourlyAgreementDetail,
  renderIssueReportDetail,
  renderQualityReportDetail,
  renderInvoiceDetail,
  renderGenericDetail,
} from '@/components/activity-feed/DetailRenderers';
import { fetchFeed, fetchDetail } from '@/components/activity-feed/fetchFeed';



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
