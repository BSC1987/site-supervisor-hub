import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, X, Pencil, Archive as ArchiveIcon, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SUPABASE_URL, developerFields, type DeveloperRow } from './types';

/**
 * Level 1 list. Custom layout: each row is just the developer name with Edit and
 * Archive actions. Archived developers are soft-deleted via the `is_archived`
 * column and shown in a collapsible section below the active list.
 */
export function DevelopersList({
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
    const [devsRes, statsRes] = await Promise.all([
      supabase.from('developers').select('*').order('name', { ascending: true }),
      supabase.rpc('get_developer_stats'),
    ]);
    if (devsRes.error) {
      toast.error('Load failed: ' + devsRes.error.message);
      setLoading(false);
      return;
    }
    const statsMap = new Map<string, { site_count: number; unit_count: number }>();
    for (const s of (statsRes.data || []) as any[]) {
      statsMap.set(s.developer_id, { site_count: Number(s.site_count), unit_count: Number(s.unit_count) });
    }
    setDevelopers((devsRes.data || []).map((d: any) => ({
      ...d,
      site_count: statsMap.get(d.id)?.site_count ?? 0,
      unit_count: statsMap.get(d.id)?.unit_count ?? 0,
    })) as DeveloperRow[]);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Developers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Developers: {active.length} active &middot; {archived.length} archived &middot; {developers.length} total
          </p>
          <p className="text-sm text-muted-foreground">
            Sites: {active.reduce((s, d) => s + d.site_count, 0)}
          </p>
          <p className="text-sm text-muted-foreground">
            Units: {active.reduce((s, d) => s + d.unit_count, 0)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archived.length > 0 && (
            <Button
              variant={showArchived ? 'default' : 'outline'}
              onClick={() => setShowArchived(s => !s)}
            >
              <ArchiveIcon className="mr-2 h-4 w-4" />
              Archived ({archived.length})
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />Add Developer
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : showArchived ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Archived Developers</h3>
          {archived.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No archived developers</p>
          ) : (
            <div className="border rounded-lg bg-card">
              <Table className="table-fixed">
                <colgroup>
                  <col className="w-[60%]" />
                  <col className="w-[40%]" />
                </colgroup>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-center">Name</TableHead>
                    <TableHead className="h-9 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archived.map(dev => (
                    <TableRow key={dev.id} className="[&:nth-child(even)]:bg-transparent">
                      <TableCell className="py-2 text-center text-muted-foreground">{dev.name}</TableCell>
                      <TableCell className="py-2 text-center">
                        <Button variant="outline" size="sm" onClick={() => setArchived(dev.id, false)}>
                          Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No developers yet. Click "Add Developer" to create one.</p>
      ) : (
        <div className="border rounded-lg bg-card">
          <Table className="table-fixed">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[20%]" />
              <col className="w-[40%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-center">Name</TableHead>
                <TableHead className="h-9 text-center">Sites</TableHead>
                <TableHead className="h-9 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map(dev => (
                <TableRow
                  key={dev.id}
                  className="cursor-pointer hover:bg-muted/50 [&:nth-child(even)]:bg-transparent"
                  onClick={() => onOpen({ id: dev.id, name: dev.name })}
                >
                  <TableCell className="py-2 text-center font-medium">{dev.name}</TableCell>
                  <TableCell className="py-2 text-center">{dev.site_count}</TableCell>
                  <TableCell className="py-2 text-center" onClick={e => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(dev)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setArchived(dev.id, true)}>
                        <ArchiveIcon className="h-3.5 w-3.5 mr-1.5" />Archive
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
