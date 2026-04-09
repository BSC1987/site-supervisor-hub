import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, FileText, ChevronDown, Plus, ExternalLink, X,
  Pencil, Archive as ArchiveIcon, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs, FieldConfig } from '@/components/EntityPage';
import { PlotPriceGrid } from '@/components/PlotPriceGrid';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SUPABASE_URL = 'https://xhqornncpcgewlbzutsd.supabase.co';

/**
 * Top-of-page editable site info panel for the admin layout. Loads the site row,
 * lets the supervisor edit name / address / grid reference inline (save on blur)
 * and manage one or more site-plan files. Existing single-URL data is parsed as
 * a one-element list, and the column is round-tripped as newline-separated URLs
 * so we don't need a schema change to support multiple files.
 */
function SiteInfoPanel({
  siteId,
  initialName,
  onNameSaved,
}: {
  siteId: string;
  initialName: string;
  onNameSaved: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState('');
  const [gridRef, setGridRef] = useState('');
  const [plans, setPlans] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('sites')
        .select('name, address, grid_reference, site_plans')
        .eq('id', siteId)
        .single();
      if (cancelled) return;
      if (error) {
        toast.error('Failed to load site: ' + error.message);
        setLoading(false);
        return;
      }
      setName(data?.name ?? '');
      setAddress(data?.address ?? '');
      setGridRef(data?.grid_reference ?? '');
      const raw: string = data?.site_plans ?? '';
      setPlans(raw ? raw.split('\n').filter(Boolean) : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const saveField = async (column: string, value: string) => {
    const { error } = await supabase.from('sites').update({ [column]: value }).eq('id', siteId);
    if (error) {
      toast.error('Save failed: ' + error.message);
      return false;
    }
    return true;
  };

  const handleNameBlur = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) return;
    if (await saveField('name', trimmed)) {
      onNameSaved(trimmed);
      toast.success('Site name updated');
    }
  };

  const handleAddressBlur = () => saveField('address', address.trim());
  const handleGridRefBlur = () => saveField('grid_reference', gridRef.trim());

  const persistPlans = async (next: string[]) => {
    setPlans(next);
    await saveField('site_plans', next.join('\n'));
  };

  const triggerFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => handleUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
    input.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const uploaded: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `sites/${siteId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('site-plans').upload(path, file, { upsert: true });
      if (error) {
        toast.error(`Upload failed for ${file.name}: ${error.message}`);
        continue;
      }
      uploaded.push(`${SUPABASE_URL}/storage/v1/object/public/site-plans/${path}`);
    }
    if (uploaded.length > 0) {
      await persistPlans([...plans, ...uploaded]);
      toast.success(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} uploaded`);
    }
    e.target.value = '';
  };

  const handleRemovePlan = async (url: string) => {
    await persistPlans(plans.filter(p => p !== url));
  };

  if (loading) {
    return <div className="rounded-lg bg-card p-6 text-muted-foreground">Loading site…</div>;
  }

  return (
    <div className="rounded-lg bg-card p-6 space-y-4">
      {/* Uniform bar of site info fields. All four share the same height,
          padding, font size and border treatment so they read as one row. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="site-name" className="text-2xl font-bold uppercase tracking-widest text-foreground">
            Site Name
          </Label>
          <Input
            id="site-name"
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleNameBlur}
            className="h-10 px-3 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="site-address" className="text-2xl font-bold uppercase tracking-widest text-foreground">
            Site Address
          </Label>
          <Input
            id="site-address"
            value={address}
            onChange={e => setAddress(e.target.value)}
            onBlur={handleAddressBlur}
            className="h-10 px-3 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="site-grid-ref" className="text-2xl font-bold uppercase tracking-widest text-foreground">
            Grid Reference
          </Label>
          <Input
            id="site-grid-ref"
            value={gridRef}
            onChange={e => setGridRef(e.target.value)}
            onBlur={handleGridRefBlur}
            className="h-10 px-3 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-2xl font-bold uppercase tracking-widest text-foreground">
            Site Plans
          </Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-10 w-full px-3 text-sm flex items-center gap-2
                           rounded-md border border-input bg-background text-muted-foreground
                           hover:text-foreground hover:border-border transition-colors"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate flex-1 text-left">
                  {plans.length > 0
                    ? `${plans.length} file${plans.length === 1 ? '' : 's'}`
                    : 'No files'}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {plans.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No site plans uploaded
                </div>
              ) : (
                plans.map(url => {
                  const fileName = url.split('/').pop() ?? url;
                  return (
                    <DropdownMenuItem
                      key={url}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{fileName}</span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1 hover:bg-accent"
                        aria-label={`View ${fileName}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemovePlan(url)}
                        className="rounded p-1 hover:bg-destructive hover:text-destructive-foreground"
                        aria-label={`Remove ${fileName}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuItem>
                  );
                })
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => triggerFilePicker()}>
                <Plus className="h-4 w-4 mr-2" />
                Add new
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

const developerFields: FieldConfig[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'reg_number', label: 'Reg Number' },
  { key: 'address_1', label: 'Address', required: true },
  { key: 'city', label: 'City', required: true },
  { key: 'county', label: 'County', required: true },
  { key: 'post_code', label: 'Post Code', required: true },
  { key: 'website', label: 'Website' },
  { key: 'logo_url', label: 'Logo', type: 'image' },
];

const siteFields: FieldConfig[] = [
  { key: 'name', label: 'Site Name', required: true },
  { key: 'developer_id', label: 'Developer', type: 'select', foreignTable: 'developers', foreignLabel: 'name' },
  { key: 'address', label: 'Address', required: true },
  { key: 'grid_reference', label: 'Grid Reference' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'site_plans', label: 'Site Plans', type: 'file', bucket: 'site-plans' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'complete', label: 'Complete' },
  ]},
];

interface DrillState {
  developer?: { id: string; name: string };
  site?: { id: string; name: string };
}

/**
 * Level 1 list. Custom layout: each row is just the developer name with Edit and
 * Archive actions. Archived developers are soft-deleted via the `is_archived`
 * column and shown in a collapsible section below the active list.
 */
interface DeveloperRow {
  id: string;
  name: string;
  is_archived: boolean;
  logo_url?: string | null;
  [key: string]: unknown;
}

function DevelopersList({
  onOpen,
}: {
  onOpen: (dev: { id: string; name: string }) => void;
}) {
  const [developers, setDevelopers] = useState<DeveloperRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeveloperRow | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('developers')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      toast.error('Load failed: ' + error.message);
      setLoading(false);
      return;
    }
    setDevelopers((data || []) as DeveloperRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const active = developers.filter(d => !d.is_archived);
  const archived = developers.filter(d => d.is_archived);

  const openCreate = () => {
    setEditing(null);
    setFormData({});
    setDialogOpen(true);
  };

  const openEdit = (dev: DeveloperRow) => {
    setEditing(dev);
    const fd: Record<string, string> = {};
    developerFields.forEach(f => {
      const v = dev[f.key];
      fd[f.key] = v == null ? '' : String(v);
    });
    setFormData(fd);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from('developers')
        .update(formData)
        .eq('id', editing.id);
      if (error) toast.error('Update failed: ' + error.message);
      else {
        toast.success('Saved');
        setDialogOpen(false);
        await fetchAll();
      }
    } else {
      const { error } = await supabase.from('developers').insert(formData);
      if (error) toast.error('Create failed: ' + error.message);
      else {
        toast.success('Created');
        setDialogOpen(false);
        await fetchAll();
      }
    }
    setSaving(false);
  };

  const setArchived = async (id: string, value: boolean) => {
    const { error } = await supabase
      .from('developers')
      .update({ is_archived: value })
      .eq('id', id);
    if (error) {
      toast.error((value ? 'Archive' : 'Restore') + ' failed: ' + error.message);
      return;
    }
    setDevelopers(prev =>
      prev.map(d => (d.id === id ? { ...d, is_archived: value } : d))
    );
    toast.success(value ? 'Developer archived' : 'Developer restored');
  };

  const handleLogoUpload = async (file: File) => {
    const ext = file.name.split('.').pop();
    const path = `developers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true });
    if (error) {
      toast.error('Upload failed: ' + error.message);
      return;
    }
    const url = `${SUPABASE_URL}/storage/v1/object/public/logos/${path}`;
    setFormData(p => ({ ...p, logo_url: url }));
    toast.success('Logo uploaded');
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Developers</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowArchived(s => !s)}
          >
            <ArchiveIcon className="mr-2 h-4 w-4" />
            Archive ({archived.length})
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />Add Developer
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-muted-foreground">Loading…</div>
        ) : active.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground">
            No developers yet. Click "Add Developer" to create one.
          </div>
        ) : (
          <ul className="divide-y">
            {active.map(dev => (
              <li
                key={dev.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30"
              >
                <button
                  type="button"
                  onClick={() => onOpen({ id: dev.id, name: dev.name })}
                  className="min-w-0 text-left font-medium truncate hover:underline"
                >
                  {dev.name}
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(dev)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setArchived(dev.id, true)}
                  >
                    <ArchiveIcon className="h-3.5 w-3.5 mr-1.5" />
                    Archive
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showArchived && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Archived
          </h2>
          <div className="border rounded-lg overflow-hidden opacity-70">
            {archived.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground italic">
                No archived developers
              </div>
            ) : (
              <ul className="divide-y">
                {archived.map(dev => (
                  <li
                    key={dev.id}
                    className="flex items-center gap-4 px-4 py-3 text-muted-foreground"
                  >
                    <span className="min-w-0 truncate">{dev.name}</span>
                    <div className="ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchived(dev.id, false)}
                      >
                        Restore
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Developer' : 'Create Developer'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {developerFields.map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                {f.type === 'image' ? (
                  <div className="space-y-2">
                    {formData.logo_url && (
                      <div className="relative inline-block">
                        <img
                          src={formData.logo_url}
                          alt=""
                          className="h-16 w-auto rounded border object-contain bg-white p-1"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, logo_url: '' }))}
                          className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground h-5 w-5 flex items-center justify-center"
                          aria-label="Remove logo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground border rounded-md px-3 py-2 w-fit">
                      <Upload className="h-4 w-4" />
                      {formData.logo_url ? 'Change image' : 'Upload image'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoUpload(file);
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <Input
                    value={formData[f.key] || ''}
                    onChange={e =>
                      setFormData(p => ({ ...p, [f.key]: e.target.value }))
                    }
                    required={f.required}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Level 2 list. Sites for one developer. Each row is just the site name with Edit
 * and Archive actions; archived sites are shown in a collapsible section.
 */
interface SiteRow {
  id: string;
  name: string;
  is_archived: boolean;
  status?: string | null;
  [key: string]: unknown;
}

function SitesList({
  developerId,
  onOpen,
}: {
  developerId: string;
  onOpen: (site: { id: string; name: string }) => void;
}) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SiteRow | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .eq('developer_id', developerId)
      .order('name', { ascending: true });
    if (error) {
      toast.error('Load failed: ' + error.message);
      setLoading(false);
      return;
    }
    setSites((data || []) as SiteRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [developerId]);

  const active = sites.filter(s => !s.is_archived);
  const archived = sites.filter(s => s.is_archived);

  // Fields shown in the create/edit dialog. developer_id is set automatically and
  // never appears as an input. site_plans is the only file field — the rest are
  // text or select.
  const editableFields = siteFields.filter(f => f.key !== 'developer_id');

  const openCreate = () => {
    setEditing(null);
    const fd: Record<string, string> = {};
    editableFields.forEach(f => {
      fd[f.key] = '';
    });
    fd.status = 'active';
    setFormData(fd);
    setDialogOpen(true);
  };

  const openEdit = (site: SiteRow) => {
    setEditing(site);
    const fd: Record<string, string> = {};
    editableFields.forEach(f => {
      const v = site[f.key];
      fd[f.key] = v == null ? '' : String(v);
    });
    setFormData(fd);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload: Record<string, unknown> = { ...formData };
    if (editing) {
      const { error } = await supabase
        .from('sites')
        .update(payload)
        .eq('id', editing.id);
      if (error) toast.error('Update failed: ' + error.message);
      else {
        toast.success('Saved');
        setDialogOpen(false);
        await fetchAll();
      }
    } else {
      payload.developer_id = developerId;
      const { error } = await supabase.from('sites').insert(payload);
      if (error) toast.error('Create failed: ' + error.message);
      else {
        toast.success('Created');
        setDialogOpen(false);
        await fetchAll();
      }
    }
    setSaving(false);
  };

  const setArchived = async (id: string, value: boolean) => {
    const { error } = await supabase
      .from('sites')
      .update({ is_archived: value })
      .eq('id', id);
    if (error) {
      toast.error((value ? 'Archive' : 'Restore') + ' failed: ' + error.message);
      return;
    }
    setSites(prev =>
      prev.map(s => (s.id === id ? { ...s, is_archived: value } : s))
    );
    toast.success(value ? 'Site archived' : 'Site restored');
  };

  const handleSitePlanUpload = async (file: File) => {
    const ext = file.name.split('.').pop();
    const path = `sites/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('site-plans')
      .upload(path, file, { upsert: true });
    if (error) {
      toast.error('Upload failed: ' + error.message);
      return;
    }
    const url = `${SUPABASE_URL}/storage/v1/object/public/site-plans/${path}`;
    setFormData(p => ({ ...p, site_plans: url }));
    toast.success('Site plan uploaded');
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sites</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived(s => !s)}
          >
            <ArchiveIcon className="mr-2 h-4 w-4" />
            Archive ({archived.length})
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />Add Site
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-muted-foreground">Loading…</div>
        ) : active.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground">
            No sites yet. Click "Add Site" to create one.
          </div>
        ) : (
          <ul className="divide-y">
            {active.map(site => (
              <li
                key={site.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30"
              >
                <button
                  type="button"
                  onClick={() => onOpen({ id: site.id, name: site.name })}
                  className="min-w-0 text-left font-medium truncate hover:underline"
                >
                  {site.name}
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(site)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setArchived(site.id, true)}
                  >
                    <ArchiveIcon className="h-3.5 w-3.5 mr-1.5" />
                    Archive
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showArchived && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Archived
          </h3>
          <div className="border rounded-lg overflow-hidden opacity-70">
            {archived.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground italic">
                No archived sites
              </div>
            ) : (
              <ul className="divide-y">
                {archived.map(site => (
                  <li
                    key={site.id}
                    className="flex items-center gap-4 px-4 py-3 text-muted-foreground"
                  >
                    <span className="min-w-0 truncate">{site.name}</span>
                    <div className="ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchived(site.id, false)}
                      >
                        Restore
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Site' : 'Create Site'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {editableFields.map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                {f.type === 'select' && f.options ? (
                  <Select
                    value={formData[f.key] || ''}
                    onValueChange={v => setFormData(p => ({ ...p, [f.key]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${f.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options.map(o => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.type === 'file' ? (
                  <div className="space-y-2">
                    {formData.site_plans && (
                      <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 w-fit">
                        <a
                          href={formData.site_plans}
                          target="_blank"
                          rel="noreferrer"
                          className="underline truncate max-w-[260px]"
                        >
                          {formData.site_plans.split('/').pop()}
                        </a>
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, site_plans: '' }))}
                          className="rounded-full bg-destructive text-destructive-foreground h-5 w-5 flex items-center justify-center"
                          aria-label="Remove file"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground border rounded-md px-3 py-2 w-fit">
                      <Upload className="h-4 w-4" />
                      {formData.site_plans ? 'Replace file' : 'Upload file'}
                      <input
                        type="file"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleSitePlanUpload(file);
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <Input
                    value={formData[f.key] || ''}
                    onChange={e =>
                      setFormData(p => ({ ...p, [f.key]: e.target.value }))
                    }
                    required={f.required}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Developers() {
  const [drill, setDrill] = useState<DrillState>({});

  // Level 3: Plots for a site (price grid)
  if (drill.developer && drill.site) {
    const developer = drill.developer;
    const site = drill.site;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setDrill({ developer })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Breadcrumbs items={[
            { label: 'Developers', onClick: () => setDrill({}) },
            { label: developer.name, onClick: () => setDrill({ developer }) },
            { label: site.name },
          ]} />
        </div>
        <SiteInfoPanel
          siteId={site.id}
          initialName={site.name}
          onNameSaved={name => setDrill({ developer, site: { id: site.id, name } })}
        />
        <PlotPriceGrid siteId={site.id} />
      </div>
    );
  }

  // Level 2: Sites for a developer
  if (drill.developer) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setDrill({})}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <Breadcrumbs items={[
              { label: 'Developers', onClick: () => setDrill({}) },
              { label: drill.developer.name },
            ]} />
            <h1 className="text-2xl font-semibold">{drill.developer.name} – Sites</h1>
          </div>
        </div>
        <SitesList
          developerId={drill.developer.id}
          onOpen={(site) =>
            setDrill({
              developer: drill.developer,
              site,
            })
          }
        />
      </div>
    );
  }

  // Level 1: Developers
  return (
    <DevelopersList
      onOpen={(dev) => setDrill({ developer: dev })}
    />
  );
}
