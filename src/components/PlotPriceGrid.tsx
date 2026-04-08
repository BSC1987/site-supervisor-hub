import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Plot {
  id: string;
  plot_name: string;
  house_type: string | null;
  status: string;
}

interface Template {
  id: string;
  name: string;
  type: 'internal' | 'external';
  sort_order: number;
}

interface PlotTaskRow {
  id: string;
  plot_id: string;
  task_template_id: string | null;
  name: string;
  type: 'internal' | 'external';
  sort_order: number;
  price: number | null;
}

const cellKey = (plotId: string, templateId: string) => `${plotId}:${templateId}`;

function parsePastedGrid(text: string): string[][] {
  const trimmed = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!trimmed) return [];
  return trimmed.split('\n').map(r => r.split('\t'));
}

interface Props {
  siteId: string;
  onOpenPlot: (plot: { id: string; plot_name: string }) => void;
}

export function PlotPriceGrid({ siteId, onOpenPlot }: Props) {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tasks, setTasks] = useState<PlotTaskRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [taskIds, setTaskIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newPlotName, setNewPlotName] = useState('');
  const [plotToDelete, setPlotToDelete] = useState<Plot | null>(null);

  // Refs that always hold the latest snapshot of the state we read inside async work.
  // Closures captured by handlers see the snapshot from the render they were created in,
  // which causes paste/blur saves to use stale taskIds/tasks. Refs sidestep that.
  const plotsRef = useRef<Plot[]>([]);
  const templatesRef = useRef<Template[]>([]);
  const tasksRef = useRef<PlotTaskRow[]>([]);
  const taskIdsRef = useRef<Record<string, string>>({});
  const valuesRef = useRef<Record<string, string>>({});
  useEffect(() => { plotsRef.current = plots; }, [plots]);
  useEffect(() => { templatesRef.current = templates; }, [templates]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { taskIdsRef.current = taskIds; }, [taskIds]);
  useEffect(() => { valuesRef.current = values; }, [values]);

  // Coordinates of the cell whose input is currently focused. Updated on focus.
  // Used as the paste anchor so paste works even if the focus target is awkward.
  const focusedCellRef = useRef<{ plotIdx: number; tplIdx: number } | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [plotsRes, tplRes] = await Promise.all([
      supabase.from('plots').select('*').eq('site_id', siteId),
      supabase
        .from('task_templates')
        .select('*')
        .order('type', { ascending: true })
        .order('sort_order', { ascending: true }),
    ]);
    if (plotsRes.error) {
      toast.error('Plots load failed: ' + plotsRes.error.message);
      setLoading(false);
      return;
    }
    if (tplRes.error) {
      toast.error('Templates load failed: ' + tplRes.error.message);
      setLoading(false);
      return;
    }
    const plotList = ((plotsRes.data || []) as Plot[]).slice();
    plotList.sort((a, b) =>
      a.plot_name.localeCompare(b.plot_name, undefined, { numeric: true, sensitivity: 'base' })
    );
    setPlots(plotList);
    setTemplates((tplRes.data || []) as Template[]);

    if (plotList.length > 0) {
      const ids = plotList.map(p => p.id);
      const { data: taskData, error: taskErr } = await supabase
        .from('plot_tasks')
        .select('*')
        .in('plot_id', ids);
      if (taskErr) {
        toast.error('Tasks load failed: ' + taskErr.message);
        setLoading(false);
        return;
      }
      const t = (taskData || []) as PlotTaskRow[];
      setTasks(t);
      const v: Record<string, string> = {};
      const idMap: Record<string, string> = {};
      for (const task of t) {
        if (task.task_template_id) {
          const k = cellKey(task.plot_id, task.task_template_id);
          idMap[k] = task.id;
          // £0 has no domain meaning here — treat as unset so the cell shows blank.
          if (task.price != null && Number(task.price) !== 0) v[k] = String(task.price);
        }
      }
      setValues(v);
      setTaskIds(idMap);
    } else {
      setTasks([]);
      setValues({});
      setTaskIds({});
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Persist a single cell. Reads taskIds/tasks from refs so sequential awaits see fresh data
  // (e.g. after a previous insert during the same paste batch).
  const persistCell = async (plotId: string, template: Template, rawValue: string) => {
    const key = cellKey(plotId, template.id);
    const trimmed = rawValue.trim();
    const parsed = trimmed === '' ? null : parseFloat(trimmed);
    if (trimmed !== '' && !Number.isFinite(parsed)) {
      toast.error(`"${trimmed}" is not a valid number`);
      return;
    }
    // Treat £0 as no-value: blank input, blank cell, NULL in DB.
    const numeric = parsed === 0 ? null : parsed;

    const existingId = taskIdsRef.current[key];
    if (existingId) {
      const { error } = await supabase
        .from('plot_tasks')
        .update({ price: numeric })
        .eq('id', existingId);
      if (error) toast.error('Save failed: ' + error.message);
      return;
    }
    const sameType = tasksRef.current.filter(
      t => t.plot_id === plotId && t.type === template.type
    );
    const nextOrder =
      sameType.length > 0
        ? Math.max(...sameType.map(t => t.sort_order)) + 1
        : template.sort_order;
    const { data, error } = await supabase
      .from('plot_tasks')
      .insert({
        plot_id: plotId,
        task_template_id: template.id,
        name: template.name,
        type: template.type,
        sort_order: nextOrder,
        price: numeric,
      })
      .select()
      .single();
    if (error) {
      toast.error('Save failed: ' + error.message);
      return;
    }
    if (data) {
      const row = data as PlotTaskRow;
      // Update refs synchronously so the next sequential persistCell sees the new id.
      taskIdsRef.current = { ...taskIdsRef.current, [key]: row.id };
      tasksRef.current = [...tasksRef.current, row];
      setTaskIds(taskIdsRef.current);
      setTasks(tasksRef.current);
    }
  };

  const handleChange = (plotId: string, templateId: string, val: string) => {
    setValues(prev => ({ ...prev, [cellKey(plotId, templateId)]: val }));
  };

  const handleBlur = (plotId: string, template: Template) => {
    const key = cellKey(plotId, template.id);
    persistCell(plotId, template, valuesRef.current[key] ?? '');
  };

  // Delegated paste handler — fires for any paste inside the table wrapper. Reads the
  // currently focused cell from focusedCellRef so we don't depend on the input being the
  // event target. Always preventDefault when there's clipboard text so the grid is the
  // single source of truth for inserted values.
  const handleTablePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const anchor = focusedCellRef.current;
    if (!anchor) return; // No focused cell — fall through to default
    e.preventDefault();
    e.stopPropagation();

    const grid = parsePastedGrid(text);
    if (grid.length === 0) return;

    let workingPlots = plotsRef.current;
    const currentTemplates = templatesRef.current;

    // ---------- Step 1: ensure enough plots exist in Supabase ----------
    const neededRows = anchor.plotIdx + grid.length;
    const overflow = neededRows - workingPlots.length;
    if (overflow > 0) {
      // Continue numbering from the highest existing numeric plot_name.
      const numericNames = workingPlots
        .map(p => parseInt(p.plot_name, 10))
        .filter(n => Number.isFinite(n));
      const startNum =
        numericNames.length > 0
          ? Math.max(...numericNames) + 1
          : workingPlots.length + 1;
      const newRows = Array.from({ length: overflow }, (_, i) => ({
        site_id: siteId,
        plot_name: String(startNum + i),
        status: 'not_started',
      }));

      // Insert plots into Supabase. Bail out hard on any failure so we never show
      // visual rows that aren't backed by real DB rows.
      const { data: insertedPlots, error: insertErr } = await supabase
        .from('plots')
        .insert(newRows)
        .select();
      if (insertErr) {
        toast.error('Failed to create plots: ' + insertErr.message);
        return;
      }
      if (!insertedPlots || insertedPlots.length === 0) {
        toast.error('Failed to create plots: no rows returned (check RLS policies)');
        return;
      }
      if (insertedPlots.length !== overflow) {
        toast.error(
          `Plot insert mismatch: expected ${overflow}, got ${insertedPlots.length}`
        );
        return;
      }

      // The AFTER INSERT trigger has just created default plot_tasks for each new plot.
      // Pull them so taskIdsRef is populated and the upcoming persistCell calls take
      // the UPDATE branch instead of attempting a duplicate INSERT.
      const newPlotIds = (insertedPlots as Plot[]).map(p => p.id);
      const { data: triggerTaskData, error: tasksErr } = await supabase
        .from('plot_tasks')
        .select('*')
        .in('plot_id', newPlotIds);
      if (tasksErr) {
        toast.error('Failed to load tasks for new plots: ' + tasksErr.message);
        return;
      }
      const triggerTasks = (triggerTaskData ?? []) as PlotTaskRow[];
      if (triggerTasks.length === 0) {
        toast.error(
          'No plot_tasks were created for the new plots — is the auto-generation trigger enabled?'
        );
        return;
      }

      // Merge into local state + refs synchronously so the cell loop sees the new state.
      const mergedPlots = [...workingPlots, ...(insertedPlots as Plot[])];
      mergedPlots.sort((a, b) =>
        a.plot_name.localeCompare(b.plot_name, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      );
      workingPlots = mergedPlots;
      plotsRef.current = mergedPlots;
      setPlots(mergedPlots);

      const mergedTasks = [...tasksRef.current, ...triggerTasks];
      tasksRef.current = mergedTasks;
      setTasks(mergedTasks);

      const mergedTaskIds = { ...taskIdsRef.current };
      for (const t of triggerTasks) {
        if (t.task_template_id) {
          mergedTaskIds[cellKey(t.plot_id, t.task_template_id)] = t.id;
        }
      }
      taskIdsRef.current = mergedTaskIds;
      setTaskIds(mergedTaskIds);

      toast.success(`Created ${overflow} new plot${overflow === 1 ? '' : 's'}`);
    }

    // ---------- Step 2: build the cell update list (no side effects in setState) ----------
    const updates: Array<{ plotId: string; template: Template; raw: string }> = [];
    const nextValues = { ...valuesRef.current };
    for (let r = 0; r < grid.length; r++) {
      const plotIdx = anchor.plotIdx + r;
      if (plotIdx >= workingPlots.length) break;
      const plot = workingPlots[plotIdx];
      for (let c = 0; c < grid[r].length; c++) {
        const tplIdx = anchor.tplIdx + c;
        if (tplIdx >= currentTemplates.length) break;
        const template = currentTemplates[tplIdx];
        const raw = (grid[r][c] ?? '').trim();
        nextValues[cellKey(plot.id, template.id)] = raw;
        updates.push({ plotId: plot.id, template, raw });
      }
    }
    valuesRef.current = nextValues;
    setValues(nextValues);

    // ---------- Step 3: persist sequentially ----------
    // Sequential await so persistCell's synchronous ref updates are visible to the next
    // iteration. Errors surface as toasts inside persistCell — we don't bail.
    for (const u of updates) {
      // eslint-disable-next-line no-await-in-loop
      await persistCell(u.plotId, u.template, u.raw);
    }

    // ---------- Step 4: safety-net refetch ----------
    // Pull everything from Supabase one more time so the visible grid is exactly what's
    // persisted. If any write silently failed above, this surfaces the discrepancy.
    await fetchAll();
  };

  const handleAddPlot = async () => {
    const name = newPlotName.trim();
    if (!name) {
      toast.error('Plot name required');
      return;
    }
    const { error } = await supabase.from('plots').insert({
      site_id: siteId,
      plot_name: name,
      status: 'not_started',
    });
    if (error) {
      toast.error('Add failed: ' + error.message);
      return;
    }
    toast.success('Plot added');
    setNewPlotName('');
    setAddOpen(false);
    fetchAll();
  };

  const handleDeletePlot = async () => {
    if (!plotToDelete) return;
    const target = plotToDelete;
    setPlotToDelete(null);
    // plot_tasks.plot_id has ON DELETE CASCADE so deleting the plot drops all its tasks.
    const { error } = await supabase.from('plots').delete().eq('id', target.id);
    if (error) {
      toast.error('Delete failed: ' + error.message);
      return;
    }
    toast.success(`Plot ${target.plot_name} deleted`);

    // Update local state + refs synchronously so the rows disappear from both tables.
    const remainingPlots = plotsRef.current.filter(p => p.id !== target.id);
    plotsRef.current = remainingPlots;
    setPlots(remainingPlots);

    const remainingTasks = tasksRef.current.filter(t => t.plot_id !== target.id);
    tasksRef.current = remainingTasks;
    setTasks(remainingTasks);

    const remainingTaskIds = { ...taskIdsRef.current };
    const remainingValues = { ...valuesRef.current };
    for (const k of Object.keys(remainingTaskIds)) {
      if (k.startsWith(target.id + ':')) delete remainingTaskIds[k];
    }
    for (const k of Object.keys(remainingValues)) {
      if (k.startsWith(target.id + ':')) delete remainingValues[k];
    }
    taskIdsRef.current = remainingTaskIds;
    valuesRef.current = remainingValues;
    setTaskIds(remainingTaskIds);
    setValues(remainingValues);
  };

  // Renders one table per task type (internal / external) sharing the same plot rows
  // and the same global template index, so paste anchoring stays consistent across both.
  const renderTable = (groupType: 'internal' | 'external', label: string) => {
    const groupTemplates = templates
      .map((tpl, idx) => ({ tpl, idx }))
      .filter(({ tpl }) => tpl.type === groupType);

    if (groupTemplates.length === 0) {
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </h3>
          <div className="text-sm text-muted-foreground italic">
            No {label.toLowerCase()} task templates.
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        <div
          className="border rounded-lg overflow-auto max-h-[70vh]"
          onPaste={handleTablePaste}
        >
          <table className="text-sm border-collapse w-full">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="text-left px-3 py-2 border-b font-medium sticky left-0 bg-muted z-30">
                  Plot
                </th>
                {groupTemplates.map(({ tpl }) => (
                  <th
                    key={tpl.id}
                    className="px-3 py-2 border-b border-l font-medium whitespace-nowrap text-center bg-muted"
                  >
                    {tpl.name}
                  </th>
                ))}
                <th className="px-2 py-2 border-b border-l bg-muted w-[44px]" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {plots.map((plot, plotIdx) => (
                <tr key={plot.id}>
                  <td className="px-3 py-1 border-b sticky left-0 bg-card font-medium z-10 align-middle">
                    <button
                      type="button"
                      className="hover:underline text-left"
                      onClick={() => onOpenPlot({ id: plot.id, plot_name: plot.plot_name })}
                    >
                      {plot.plot_name}
                    </button>
                  </td>
                  {groupTemplates.map(({ tpl, idx: tplIdx }) => {
                    const key = cellKey(plot.id, tpl.id);
                    const raw = values[key] ?? '';
                    return (
                      <td
                        key={tpl.id}
                        className="border-b border-l p-0 min-w-[100px] align-middle"
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          value={raw}
                          data-plot-idx={plotIdx}
                          data-template-idx={tplIdx}
                          onFocus={() => {
                            focusedCellRef.current = { plotIdx, tplIdx };
                          }}
                          onChange={e => handleChange(plot.id, tpl.id, e.target.value)}
                          onBlur={() => handleBlur(plot.id, tpl)}
                          className="w-full bg-transparent px-3 py-2 text-center outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                        />
                      </td>
                    );
                  })}
                  <td className="border-b border-l p-0 align-middle text-center">
                    <button
                      type="button"
                      onClick={() => setPlotToDelete(plot)}
                      aria-label={`Delete plot ${plot.plot_name}`}
                      className="inline-flex items-center justify-center h-8 w-8 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plots – price grid</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />Add plot
        </Button>
      </div>

      {plots.length === 0 ? (
        <div className="text-muted-foreground italic">No plots yet. Add one to get started.</div>
      ) : templates.length === 0 ? (
        <div className="text-muted-foreground italic">
          No task templates exist. Add some on the Task Templates page.
        </div>
      ) : (
        <>
          {renderTable('internal', 'Internal')}
          {renderTable('external', 'External')}
        </>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add plot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Plot name / number</Label>
              <Input
                value={newPlotName}
                onChange={e => setNewPlotName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddPlot();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddPlot}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!plotToDelete}
        onClose={() => setPlotToDelete(null)}
        onConfirm={handleDeletePlot}
        title={plotToDelete ? `Delete plot ${plotToDelete.plot_name}?` : 'Delete plot?'}
        description="This will remove the plot and all its task prices. This cannot be undone."
      />
    </div>
  );
}
