import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface TaskTemplate {
  id: string;
  name: string;
  type: 'internal' | 'external';
  sort_order: number;
  is_default: boolean;
}

const GROUPS: Array<{ type: 'internal' | 'external'; label: string }> = [
  { type: 'internal', label: 'Internal' },
  { type: 'external', label: 'External' },
];

export default function TaskTemplates() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [form, setForm] = useState<{ name: string; type: 'internal' | 'external'; is_default: boolean }>({
    name: '',
    type: 'internal',
    is_default: true,
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('task_templates')
      .select('*')
      .order('type', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) toast.error('Failed to load: ' + error.message);
    else setTemplates((data || []) as TaskTemplate[]);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', type: 'internal', is_default: true });
    setDialogOpen(true);
  };

  const openEdit = (t: TaskTemplate) => {
    setEditing(t);
    setForm({ name: t.name, type: t.type, is_default: t.is_default });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) { toast.error('Name is required'); return; }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from('task_templates')
        .update({ name, type: form.type, is_default: form.is_default })
        .eq('id', editing.id);
      if (error) toast.error('Update failed: ' + error.message);
      else { toast.success('Updated'); setDialogOpen(false); fetchTemplates(); }
    } else {
      const sameType = templates.filter(t => t.type === form.type);
      const nextOrder = sameType.length > 0 ? Math.max(...sameType.map(t => t.sort_order)) + 1 : 1;
      const { error } = await supabase
        .from('task_templates')
        .insert({ name, type: form.type, is_default: form.is_default, sort_order: nextOrder });
      if (error) toast.error('Create failed: ' + error.message);
      else { toast.success('Created'); setDialogOpen(false); fetchTemplates(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('task_templates').delete().eq('id', deleteId);
    if (error) toast.error('Delete failed: ' + error.message);
    else { toast.success('Deleted'); fetchTemplates(); }
    setDeleteId(null);
  };

  const move = async (template: TaskTemplate, dir: -1 | 1) => {
    const group = templates
      .filter(t => t.type === template.type)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = group.findIndex(t => t.id === template.id);
    const swap = group[idx + dir];
    if (!swap) return;
    const a = template.sort_order;
    const b = swap.sort_order;
    setTemplates(prev =>
      prev.map(t => {
        if (t.id === template.id) return { ...t, sort_order: b };
        if (t.id === swap.id) return { ...t, sort_order: a };
        return t;
      })
    );
    const [r1, r2] = await Promise.all([
      supabase.from('task_templates').update({ sort_order: b }).eq('id', template.id),
      supabase.from('task_templates').update({ sort_order: a }).eq('id', swap.id),
    ]);
    if (r1.error || r2.error) {
      toast.error('Reorder failed');
      fetchTemplates();
    }
  };

  const renderGroup = (groupType: 'internal' | 'external', label: string) => {
    const group = templates
      .filter(t => t.type === groupType)
      .sort((a, b) => a.sort_order - b.sort_order);
    return (
      <div key={groupType} className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
        {group.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No {label.toLowerCase()} templates</p>
        ) : (
          <div className="space-y-2">
            {group.map((t, idx) => (
              <div key={t.id} className="border rounded-lg p-3 flex items-center gap-3 bg-card">
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    disabled={idx === 0}
                    onClick={() => move(t, -1)}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    disabled={idx === group.length - 1}
                    onClick={() => move(t, 1)}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex-1">
                  <div className="font-medium">{t.name}</div>
                  {!t.is_default && (
                    <div className="text-xs text-muted-foreground">Not auto-added to new plots</div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Task Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Default tasks copied onto every new plot. Changes only affect plots created after this point.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />Add template
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        GROUPS.map(g => renderGroup(g.type, g.label))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit template' : 'Add template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as 'internal' | 'external' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_default"
                checked={form.is_default}
                onCheckedChange={v => setForm(f => ({ ...f, is_default: v === true }))}
              />
              <Label htmlFor="is_default" className="cursor-pointer">
                Auto-add to new plots
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} />
    </div>
  );
}
