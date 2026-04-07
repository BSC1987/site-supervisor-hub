import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface PlotTask {
  id: string;
  plot_id: string;
  task_template_id: string | null;
  name: string;
  type: 'internal' | 'external';
  status: 'pending' | 'in_progress' | 'complete';
  assigned_to: string | null;
  notes: string | null;
  sort_order: number;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
];

const GROUPS: Array<{ type: 'internal' | 'external'; label: string }> = [
  { type: 'internal', label: 'Internal' },
  { type: 'external', label: 'External' },
];

export function PlotTasks({ plotId }: { plotId: string }) {
  const [tasks, setTasks] = useState<PlotTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'internal' | 'external'>('internal');

  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('plot_tasks')
      .select('*')
      .eq('plot_id', plotId)
      .order('type', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) toast.error('Failed to load tasks: ' + error.message);
    else setTasks((data || []) as PlotTask[]);
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, [plotId]);

  const persist = async (id: string, patch: Partial<PlotTask>) => {
    const { error } = await supabase.from('plot_tasks').update(patch).eq('id', id);
    if (error) {
      toast.error('Save failed: ' + error.message);
      fetchTasks();
    }
  };

  // Optimistic local update + remote save
  const updateTask = async (id: string, patch: Partial<PlotTask>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
    await persist(id, patch);
  };

  // Local-only update (used during typing in text inputs)
  const setLocal = (id: string, patch: Partial<PlotTask>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from('plot_tasks').delete().eq('id', id);
    if (error) toast.error('Delete failed: ' + error.message);
    else { toast.success('Task deleted'); fetchTasks(); }
  };

  const addCustomTask = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    const sameType = tasks.filter(t => t.type === newType);
    const nextOrder = sameType.length > 0 ? Math.max(...sameType.map(t => t.sort_order)) + 1 : 1;
    const { error } = await supabase.from('plot_tasks').insert({
      plot_id: plotId,
      task_template_id: null,
      name,
      type: newType,
      sort_order: nextOrder,
    });
    if (error) {
      toast.error('Add failed: ' + error.message);
      return;
    }
    toast.success('Task added');
    setNewName('');
    setNewType('internal');
    setAddOpen(false);
    fetchTasks();
  };

  const move = async (task: PlotTask, dir: -1 | 1) => {
    const group = tasks
      .filter(t => t.type === task.type)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = group.findIndex(t => t.id === task.id);
    const swap = group[idx + dir];
    if (!swap) return;
    const a = task.sort_order;
    const b = swap.sort_order;
    setTasks(prev =>
      prev.map(t => {
        if (t.id === task.id) return { ...t, sort_order: b };
        if (t.id === swap.id) return { ...t, sort_order: a };
        return t;
      })
    );
    const [r1, r2] = await Promise.all([
      supabase.from('plot_tasks').update({ sort_order: b }).eq('id', task.id),
      supabase.from('plot_tasks').update({ sort_order: a }).eq('id', swap.id),
    ]);
    if (r1.error || r2.error) {
      toast.error('Reorder failed');
      fetchTasks();
    }
  };

  const renderGroup = (groupType: 'internal' | 'external', label: string) => {
    const group = tasks
      .filter(t => t.type === groupType)
      .sort((a, b) => a.sort_order - b.sort_order);
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
        {group.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No {label.toLowerCase()} tasks</p>
        ) : (
          <div className="space-y-2">
            {group.map((task, idx) => (
              <div key={task.id} className="border rounded-lg p-3 space-y-3 bg-card">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === 0}
                      onClick={() => move(task, -1)}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === group.length - 1}
                      onClick={() => move(task, 1)}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="font-medium flex-1">{task.name}</div>
                  <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select
                      value={task.status}
                      onValueChange={v => updateTask(task.id, { status: v as PlotTask['status'] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Assigned to</Label>
                    <Input
                      placeholder="Decorator name"
                      value={task.assigned_to ?? ''}
                      onChange={e => setLocal(task.id, { assigned_to: e.target.value })}
                      onBlur={e => persist(task.id, { assigned_to: e.target.value || null })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea
                    rows={2}
                    value={task.notes ?? ''}
                    onChange={e => setLocal(task.id, { notes: e.target.value })}
                    onBlur={e => persist(task.id, { notes: e.target.value || null })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="text-muted-foreground">Loading tasks…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tasks</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />Add custom task
        </Button>
      </div>

      {GROUPS.map(g => renderGroup(g.type, g.label))}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add custom task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={newType} onValueChange={v => setNewType(v as 'internal' | 'external')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addCustomTask}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
