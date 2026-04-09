import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Archive, ArrowUp, ArrowDown, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BackToTop } from '@/components/BackToTop';
import { Checkbox } from '@/components/ui/checkbox';

type TaskType = 'internal' | 'external' | 'variation';

interface Plot {
  id: string;
  plot_name: string;
  house_type: string | null;
  status: string;
  sort_order: number;
  is_archived: boolean;
}

interface ArchivedPlotEntry {
  id: string;
  plot_name: string;
  sections: TaskType[];
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
  type: TaskType;
  sort_order: number;
  price: number | null;
  archived: boolean;
}

// Cell keys for template-backed cells use the template's UUID directly.
// Custom (variation) cells use a "c:" prefix + type + name, which can't
// collide with a UUID.
const cellKey = (plotId: string, templateId: string) => `${plotId}:${templateId}`;
const customKey = (plotId: string, type: TaskType, name: string) =>
  `${plotId}:c:${type}:${name}`;

function parsePastedGrid(text: string): string[][] {
  const trimmed = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!trimmed) return [];
  return trimmed.split('\n').map(r => r.split('\t'));
}

// Strip thousands separators and surrounding currency symbols / whitespace from a
// numeric cell value so "£1,234.56" → "1234.56". Empty input passes through.
function cleanNumericInput(raw: string): string {
  return raw.replace(/[,£$\s]/g, '');
}

interface Props {
  siteId: string;
}

export function PlotPriceGrid({ siteId }: Props) {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tasks, setTasks] = useState<PlotTaskRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [taskIds, setTaskIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newPlotName, setNewPlotName] = useState('');
  const [plotToDelete, setPlotToDelete] = useState<Plot | null>(null);
  const [plotToHardDelete, setPlotToHardDelete] = useState<ArchivedPlotEntry | null>(null);
  const [archivedModalOpen, setArchivedModalOpen] = useState(false);
  const [archivedPlots, setArchivedPlots] = useState<ArchivedPlotEntry[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [variationToDelete, setVariationToDelete] = useState<{ name: string; type: TaskType } | null>(null);
  const [variationOpen, setVariationOpen] = useState(false);
  const [variationName, setVariationName] = useState('');
  const [variationType, setVariationType] = useState<TaskType>('variation');
  const [variationPrice, setVariationPrice] = useState('');
  // 'all' = every plot on the site; otherwise the id of a single plot.
  const [variationApplyTo, setVariationApplyTo] = useState<string>('all');
  // Bulk-selection state for the plot row checkboxes.
  const [selectedPlotIds, setSelectedPlotIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

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
  // The plot_name value captured the moment a plot-name input gained focus, used
  // to detect whether the value actually changed by blur time. Without this we
  // can't compare against the local state because handlePlotNameChange updates
  // plotsRef on every keystroke, so the "before" value is gone.
  const plotNameAtFocusRef = useRef<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [plotsRes, tplRes] = await Promise.all([
      supabase.from('plots').select('*').eq('site_id', siteId).eq('is_archived', false),
      supabase
        .from('task_templates')
        .select('*')
        .eq('archived', false)
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
    // Primary sort by sort_order, then natural plot_name as a tiebreaker.
    plotList.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.plot_name.localeCompare(b.plot_name, undefined, { numeric: true, sensitivity: 'base' });
    });
    setPlots(plotList);
    setTemplates((tplRes.data || []) as Template[]);

    if (plotList.length > 0) {
      const ids = plotList.map(p => p.id);
      const { data: taskData, error: taskErr } = await supabase
        .from('plot_tasks')
        .select('*')
        .in('plot_id', ids)
        .eq('archived', false);
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
        const k = task.task_template_id
          ? cellKey(task.plot_id, task.task_template_id)
          : customKey(task.plot_id, task.type, task.name);
        idMap[k] = task.id;
        // £0 has no domain meaning here — treat as unset so the cell shows blank.
        if (task.price != null && Number(task.price) !== 0) v[k] = String(task.price);
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

  // Insert many plot rows in small batches using upsert + ignoreDuplicates so the
  // unique (site_id, plot_name) constraint never aborts the whole batch. Returns the
  // rows that were actually inserted (skipped duplicates are filtered out by Postgres).
  // Chunking keeps the request payload small and avoids the occasional REST timeout
  // we saw on >40-row pastes.
  const bulkInsertPlotsChunked = async (
    rows: Array<{ site_id: string; plot_name: string; status: string; sort_order: number }>
  ): Promise<{ inserted: Plot[]; error: string | null }> => {
    const BATCH = 20;
    const inserted: Plot[] = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('plots')
        .upsert(slice, { onConflict: 'site_id,plot_name', ignoreDuplicates: true })
        .select();
      if (error) return { inserted, error: error.message };
      if (data) inserted.push(...(data as Plot[]));
    }
    return { inserted, error: null };
  };

  // Persist a single cell. Reads taskIds/tasks from refs so sequential awaits see fresh data
  // (e.g. after a previous insert during the same paste batch).
  const persistCell = async (plotId: string, template: Template, rawValue: string) => {
    const key = cellKey(plotId, template.id);
    const trimmed = cleanNumericInput(rawValue.trim());
    const parsed = trimmed === '' ? null : parseFloat(trimmed);
    if (trimmed !== '' && !Number.isFinite(parsed)) {
      toast.error(`"${rawValue.trim()}" is not a valid number`);
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

  // Custom (variation) cells: templateless plot_tasks rows. Blanking a custom cell
  // deletes the row, so the variation is only attached to plots that still have a
  // price. The column disappears once every plot's row is gone.
  const persistCustomCell = async (
    plotId: string,
    type: TaskType,
    name: string,
    rawValue: string
  ) => {
    const key = customKey(plotId, type, name);
    const trimmed = cleanNumericInput(rawValue.trim());
    const parsed = trimmed === '' ? null : parseFloat(trimmed);
    if (trimmed !== '' && !Number.isFinite(parsed)) {
      toast.error(`"${rawValue.trim()}" is not a valid number`);
      return;
    }
    const numeric = parsed === 0 ? null : parsed;
    const existingId = taskIdsRef.current[key];

    if (numeric == null) {
      if (!existingId) return;
      // Soft delete: keep the row for reporting, hide it from the grid.
      const { error } = await supabase
        .from('plot_tasks')
        .update({ archived: true, price: null })
        .eq('id', existingId);
      if (error) {
        toast.error('Delete failed: ' + error.message);
        return;
      }
      const nextIds = { ...taskIdsRef.current };
      delete nextIds[key];
      taskIdsRef.current = nextIds;
      setTaskIds(nextIds);
      const nextTasks = tasksRef.current.filter(t => t.id !== existingId);
      tasksRef.current = nextTasks;
      setTasks(nextTasks);
      const nextValues = { ...valuesRef.current };
      delete nextValues[key];
      valuesRef.current = nextValues;
      setValues(nextValues);
      return;
    }

    if (existingId) {
      const { error } = await supabase
        .from('plot_tasks')
        .update({ price: numeric })
        .eq('id', existingId);
      if (error) toast.error('Save failed: ' + error.message);
      return;
    }

    // Insert a new row. Inherit sort_order from any sibling in the same group
    // so the column position is stable relative to other variations.
    const siblings = tasksRef.current.filter(
      t => t.type === type && t.task_template_id == null && t.name === name
    );
    const sortOrder =
      siblings.length > 0
        ? siblings[0].sort_order
        : Math.max(
            0,
            ...tasksRef.current
              .filter(t => t.type === type)
              .map(t => t.sort_order)
          ) + 1;
    const { data, error } = await supabase
      .from('plot_tasks')
      .insert({
        plot_id: plotId,
        task_template_id: null,
        name,
        type,
        sort_order: sortOrder,
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
      taskIdsRef.current = { ...taskIdsRef.current, [key]: row.id };
      tasksRef.current = [...tasksRef.current, row];
      setTaskIds(taskIdsRef.current);
      setTasks(tasksRef.current);
    }
  };

  const handleChange = (plotId: string, templateId: string, val: string) => {
    setValues(prev => ({ ...prev, [cellKey(plotId, templateId)]: val }));
  };

  const handleCustomChange = (plotId: string, type: TaskType, name: string, val: string) => {
    setValues(prev => ({ ...prev, [customKey(plotId, type, name)]: val }));
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
    let createdCount = 0;
    let skippedCount = 0;
    if (overflow > 0) {
      // The unique (site_id, plot_name) constraint covers archived rows too. The
      // local `workingPlots` list only contains active plots, so we have to query
      // every plot_name on this site (including archived) to avoid collisions.
      const { data: existingNamesData, error: existingErr } = await supabase
        .from('plots')
        .select('plot_name')
        .eq('site_id', siteId);
      if (existingErr) {
        toast.error('Failed to check existing plots: ' + existingErr.message);
        return;
      }
      const existingNames = new Set(
        (existingNamesData || []).map(r => (r as { plot_name: string }).plot_name)
      );
      const numericNames = [...existingNames]
        .map(n => parseInt(n, 10))
        .filter(n => Number.isFinite(n));
      let nextNum = numericNames.length > 0 ? Math.max(...numericNames) + 1 : 1;
      const generatedNames: string[] = [];
      while (generatedNames.length < overflow) {
        const candidate = String(nextNum);
        if (!existingNames.has(candidate)) {
          generatedNames.push(candidate);
          existingNames.add(candidate);
        }
        nextNum++;
      }

      const baseSort =
        workingPlots.length > 0
          ? Math.max(...workingPlots.map(p => p.sort_order)) + 1
          : 1;
      const newRows = generatedNames.map((plot_name, i) => ({
        site_id: siteId,
        plot_name,
        status: 'not_started',
        sort_order: baseSort + i,
      }));

      // Chunked upsert with onConflict ignore. Chunking keeps the per-request
      // payload small (the previous one-shot insert occasionally failed around
      // 40 rows) and ignoreDuplicates protects against any race where another
      // client created a plot with the same auto-generated name in between.
      const { inserted: insertedPlots, error: insertErr } =
        await bulkInsertPlotsChunked(newRows);
      if (insertErr) {
        toast.error('Failed to create plots: ' + insertErr);
        return;
      }
      createdCount = insertedPlots.length;
      skippedCount = overflow - createdCount;

      if (createdCount > 0) {
        // The AFTER INSERT trigger has just created default plot_tasks for each new plot.
        // Pull them so taskIdsRef is populated and the upcoming persistCell calls take
        // the UPDATE branch instead of attempting a duplicate INSERT.
        const newPlotIds = (insertedPlots as Plot[]).map(p => p.id);
        const { data: triggerTaskData, error: tasksErr } = await supabase
          .from('plot_tasks')
          .select('*')
          .in('plot_id', newPlotIds)
          .eq('archived', false);
        if (tasksErr) {
          toast.error('Failed to load tasks for new plots: ' + tasksErr.message);
          return;
        }
        const triggerTasks = (triggerTaskData ?? []) as PlotTaskRow[];

        // Merge into local state + refs synchronously so the cell loop sees the new state.
        const mergedPlots = [...workingPlots, ...(insertedPlots as Plot[])];
        mergedPlots.sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.plot_name.localeCompare(b.plot_name, undefined, {
            numeric: true,
            sensitivity: 'base',
          });
        });
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
      }

      if (skippedCount > 0) {
        toast.success(
          `Created ${createdCount} new plot${createdCount === 1 ? '' : 's'}, skipped ${skippedCount} duplicate${skippedCount === 1 ? '' : 's'}`
        );
      } else if (createdCount > 0) {
        toast.success(`Created ${createdCount} new plot${createdCount === 1 ? '' : 's'}`);
      }
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
        // Strip thousands separators / currency symbols so "1,234.56" parses cleanly.
        const raw = cleanNumericInput((grid[r][c] ?? '').trim());
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

  const handleAddVariation = async () => {
    const name = variationName.trim();
    if (!name) {
      toast.error('Task name required');
      return;
    }
    if (plotsRef.current.length === 0) {
      toast.error('No plots on this site yet');
      return;
    }
    const priceRaw = variationPrice.trim();
    let priceNum: number | null = null;
    if (priceRaw !== '') {
      const parsed = parseFloat(priceRaw);
      if (!Number.isFinite(parsed)) {
        toast.error(`"${priceRaw}" is not a valid price`);
        return;
      }
      priceNum = parsed === 0 ? null : parsed;
    }

    // Resolve target plots from the "Apply to" selection.
    const targetPlots =
      variationApplyTo === 'all'
        ? plotsRef.current
        : plotsRef.current.filter(p => p.id === variationApplyTo);
    if (targetPlots.length === 0) {
      toast.error('Selected plot not found');
      return;
    }

    // Reject duplicates so we don't end up with two indistinguishable rows.
    // For "all plots" we reject if any plot already has (type, name). For a
    // single plot we only reject if THAT plot already has it — other plots
    // may legitimately carry the same variation.
    const existingRows = tasksRef.current.filter(
      t => t.type === variationType && t.task_template_id == null && t.name === name
    );
    if (variationApplyTo === 'all') {
      if (existingRows.length > 0) {
        toast.error(`A ${variationType} variation called "${name}" already exists`);
        return;
      }
    } else {
      if (existingRows.some(t => t.plot_id === variationApplyTo)) {
        toast.error(`This plot already has a ${variationType} variation called "${name}"`);
        return;
      }
    }

    // Reuse the existing column's sort_order if the variation already exists on
    // other plots (single-plot add), otherwise append a new column.
    const sortOrder =
      existingRows.length > 0
        ? existingRows[0].sort_order
        : (() => {
            const sameType = tasksRef.current.filter(t => t.type === variationType);
            return sameType.length > 0
              ? Math.max(...sameType.map(t => t.sort_order)) + 1
              : 1;
          })();

    const rows = targetPlots.map(p => ({
      plot_id: p.id,
      task_template_id: null,
      name,
      type: variationType,
      sort_order: sortOrder,
      price: priceNum,
    }));

    const { error } = await supabase.from('plot_tasks').insert(rows);
    if (error) {
      toast.error('Failed to add variation: ' + error.message);
      return;
    }
    toast.success(
      variationApplyTo === 'all'
        ? `Added "${name}" to ${targetPlots.length} plot${targetPlots.length === 1 ? '' : 's'}`
        : `Added "${name}" to plot ${targetPlots[0].plot_name}`
    );
    setVariationOpen(false);
    setVariationName('');
    setVariationType('variation');
    setVariationPrice('');
    setVariationApplyTo('all');
    fetchAll();
  };

  const handleAddPlot = async () => {
    const name = newPlotName.trim();
    if (!name) {
      toast.error('Plot name required');
      return;
    }
    const nextSort =
      plotsRef.current.length > 0
        ? Math.max(...plotsRef.current.map(p => p.sort_order)) + 1
        : 1;
    const { error } = await supabase.from('plots').insert({
      site_id: siteId,
      plot_name: name,
      status: 'not_started',
      sort_order: nextSort,
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
    // Soft delete: keep the plot row and its plot_tasks intact so restoring brings
    // everything back exactly as it was. Hidden from the grid via is_archived filter.
    const { error } = await supabase
      .from('plots')
      .update({ is_archived: true })
      .eq('id', target.id);
    if (error) {
      toast.error('Delete failed: ' + error.message);
      return;
    }
    toast.success(`Plot ${target.plot_name} archived`);

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

  const fetchArchivedPlots = async () => {
    setArchivedLoading(true);
    const { data: plotData, error: plotErr } = await supabase
      .from('plots')
      .select('id, plot_name, sort_order')
      .eq('site_id', siteId)
      .eq('is_archived', true);
    if (plotErr) {
      toast.error('Failed to load archived plots: ' + plotErr.message);
      setArchivedLoading(false);
      return;
    }
    const rows = (plotData || []) as Array<{ id: string; plot_name: string; sort_order: number }>;
    if (rows.length === 0) {
      setArchivedPlots([]);
      setArchivedLoading(false);
      return;
    }
    // For each archived plot, list the sections (task types) it has any tasks in.
    // We include both active and archived plot_tasks so a plot retains its history.
    const ids = rows.map(r => r.id);
    const { data: taskData, error: taskErr } = await supabase
      .from('plot_tasks')
      .select('plot_id, type')
      .in('plot_id', ids);
    if (taskErr) {
      toast.error('Failed to load task sections: ' + taskErr.message);
      setArchivedLoading(false);
      return;
    }
    const sectionsByPlot = new Map<string, Set<TaskType>>();
    for (const t of (taskData || []) as Array<{ plot_id: string; type: TaskType }>) {
      const set = sectionsByPlot.get(t.plot_id) ?? new Set<TaskType>();
      set.add(t.type);
      sectionsByPlot.set(t.plot_id, set);
    }
    const orderedTypes: TaskType[] = ['internal', 'external', 'variation'];
    const entries: ArchivedPlotEntry[] = rows
      .slice()
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.plot_name.localeCompare(b.plot_name, undefined, { numeric: true, sensitivity: 'base' });
      })
      .map(r => ({
        id: r.id,
        plot_name: r.plot_name,
        sections: orderedTypes.filter(t => sectionsByPlot.get(r.id)?.has(t)),
      }));
    setArchivedPlots(entries);
    setArchivedLoading(false);
  };

  const openArchivedModal = async () => {
    setArchivedModalOpen(true);
    await fetchArchivedPlots();
  };

  const restorePlot = async (plotId: string) => {
    const { error } = await supabase
      .from('plots')
      .update({ is_archived: false })
      .eq('id', plotId);
    if (error) {
      toast.error('Restore failed: ' + error.message);
      return;
    }
    toast.success('Plot restored');
    // Refresh both: the modal list and the main grid.
    await Promise.all([fetchArchivedPlots(), fetchAll()]);
  };

  // Persist a single plot name from the inline editor. Compares against the value
  // captured on focus (not the live local state, which the keystroke handler has
  // already updated) so we can tell whether anything actually changed.
  const persistPlotName = async (plotId: string, raw: string) => {
    const name = raw.trim();
    const original = plotNameAtFocusRef.current;
    plotNameAtFocusRef.current = null;
    if (name === '') {
      // Reject blank — revert local state to the value from focus time.
      toast.error('Plot name required');
      if (original != null) {
        const reverted = plotsRef.current.map(p =>
          p.id === plotId ? { ...p, plot_name: original } : p
        );
        plotsRef.current = reverted;
        setPlots(reverted);
      }
      return;
    }
    if (original != null && name === original) return;
    const { error } = await supabase
      .from('plots')
      .update({ plot_name: name })
      .eq('id', plotId);
    if (error) {
      toast.error('Rename failed: ' + error.message);
      return;
    }
    const updated = plotsRef.current.map(p =>
      p.id === plotId ? { ...p, plot_name: name } : p
    );
    plotsRef.current = updated;
    setPlots(updated);
  };

  // Local edit handler — only updates state, persistence happens on blur/paste.
  const handlePlotNameChange = (plotId: string, val: string) => {
    const next = plotsRef.current.map(p =>
      p.id === plotId ? { ...p, plot_name: val } : p
    );
    plotsRef.current = next;
    setPlots(next);
  };

  // Multi-row paste anchored on the plot-name column. First column of the paste is
  // used as plot names; existing plots are renamed in place, missing rows are inserted.
  const handlePlotNamePaste = async (
    e: React.ClipboardEvent<HTMLInputElement>,
    anchorPlotIdx: number
  ) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const grid = parsePastedGrid(text);
    if (grid.length <= 1 && (grid[0]?.length ?? 0) <= 1) {
      // Single value — let the input handle it natively.
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const names = grid.map(row => (row[0] ?? '').trim()).filter(n => n !== '');
    if (names.length === 0) return;

    let workingPlots = plotsRef.current;
    const neededRows = anchorPlotIdx + names.length;
    const overflow = neededRows - workingPlots.length;

    if (overflow > 0) {
      const baseSort =
        workingPlots.length > 0
          ? Math.max(...workingPlots.map(p => p.sort_order)) + 1
          : 1;
      const newRows = Array.from({ length: overflow }, (_, i) => ({
        site_id: siteId,
        plot_name: names[names.length - overflow + i],
        status: 'not_started',
        sort_order: baseSort + i,
      }));
      // Chunked upsert: ignoreDuplicates means any pasted plot_name that already
      // exists for this site (active or archived) is silently skipped instead of
      // aborting the whole batch with a unique-constraint violation.
      const { inserted: insertedPlots, error: insertErr } =
        await bulkInsertPlotsChunked(newRows);
      if (insertErr) {
        toast.error('Failed to create plots: ' + insertErr);
        return;
      }
      const skipped = overflow - insertedPlots.length;
      if (skipped > 0) {
        toast.success(
          `Created ${insertedPlots.length} new plot${insertedPlots.length === 1 ? '' : 's'}, skipped ${skipped} (already exist)`
        );
      } else if (insertedPlots.length > 0) {
        toast.success(`Created ${insertedPlots.length} new plot${insertedPlots.length === 1 ? '' : 's'}`);
      }
      const merged = [...workingPlots, ...insertedPlots];
      merged.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.plot_name.localeCompare(b.plot_name, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });
      workingPlots = merged;
      plotsRef.current = merged;
      setPlots(merged);
    }

    // Rename existing plots covered by the paste range. New rows already carry their
    // pasted name from the insert above.
    const renames: Promise<unknown>[] = [];
    const renamedExisting = workingPlots.map(p => ({ ...p }));
    for (let r = 0; r < names.length; r++) {
      const idx = anchorPlotIdx + r;
      if (idx >= renamedExisting.length) break;
      const target = renamedExisting[idx];
      if (target.plot_name === names[r]) continue;
      // Skip plots that were just inserted with the same name.
      const wasInserted = overflow > 0 && idx >= workingPlots.length - overflow;
      if (wasInserted) continue;
      target.plot_name = names[r];
      renames.push(
        Promise.resolve(
          supabase.from('plots').update({ plot_name: names[r] }).eq('id', target.id)
        )
      );
    }
    if (renames.length > 0) {
      const results = await Promise.all(renames);
      const failed = results.filter(res => (res as { error?: unknown })?.error).length;
      if (failed > 0) toast.error(`${failed} plot rename${failed === 1 ? '' : 's'} failed`);
    }

    plotsRef.current = renamedExisting;
    setPlots(renamedExisting);
    await fetchAll();
  };

  // Soft-delete every plot_task row for a variation column across all plots on this site.
  const handleDeleteVariation = async () => {
    if (!variationToDelete) return;
    const { name, type } = variationToDelete;
    setVariationToDelete(null);
    const plotIds = plotsRef.current.map(p => p.id);
    if (plotIds.length === 0) return;
    const ids = tasksRef.current
      .filter(
        t =>
          t.task_template_id == null &&
          t.type === type &&
          t.name === name &&
          plotIds.includes(t.plot_id)
      )
      .map(t => t.id);
    if (ids.length === 0) {
      toast.error('No rows to delete');
      return;
    }
    const { error } = await supabase
      .from('plot_tasks')
      .update({ archived: true, price: null })
      .in('id', ids);
    if (error) {
      toast.error('Delete failed: ' + error.message);
      return;
    }
    toast.success(`Removed variation "${name}"`);
    const remainingTasks = tasksRef.current.filter(t => !ids.includes(t.id));
    tasksRef.current = remainingTasks;
    setTasks(remainingTasks);
    const nextIds = { ...taskIdsRef.current };
    const nextValues = { ...valuesRef.current };
    for (const k of Object.keys(nextIds)) {
      if (k.includes(`:c:${type}:${name}`)) delete nextIds[k];
    }
    for (const k of Object.keys(nextValues)) {
      if (k.includes(`:c:${type}:${name}`)) delete nextValues[k];
    }
    taskIdsRef.current = nextIds;
    valuesRef.current = nextValues;
    setTaskIds(nextIds);
    setValues(nextValues);
  };

  // Permanently delete an archived plot and all of its plot_tasks.
  const handleHardDeletePlot = async () => {
    if (!plotToHardDelete) return;
    const target = plotToHardDelete;
    setPlotToHardDelete(null);
    // Delete child tasks first so we don't depend on FK cascade behaviour.
    const { error: tasksErr } = await supabase
      .from('plot_tasks')
      .delete()
      .eq('plot_id', target.id);
    if (tasksErr) {
      toast.error('Failed to delete tasks: ' + tasksErr.message);
      return;
    }
    const { error } = await supabase.from('plots').delete().eq('id', target.id);
    if (error) {
      toast.error('Delete failed: ' + error.message);
      return;
    }
    toast.success(`Plot ${target.plot_name} deleted`);
    setArchivedPlots(prev => prev.filter(p => p.id !== target.id));
  };

  // ---------- Bulk selection ----------
  const togglePlotSelection = (id: string) => {
    setSelectedPlotIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedPlotIds(prev =>
      prev.size === plots.length ? new Set() : new Set(plots.map(p => p.id))
    );
  };

  const clearSelection = () => setSelectedPlotIds(new Set());

  const handleBulkArchive = async () => {
    const ids = Array.from(selectedPlotIds);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('plots')
      .update({ is_archived: true })
      .in('id', ids);
    if (error) {
      toast.error('Bulk archive failed: ' + error.message);
      return;
    }
    toast.success(`Archived ${ids.length} plot${ids.length === 1 ? '' : 's'}`);
    clearSelection();
    await fetchAll();
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedPlotIds);
    setBulkDeleteOpen(false);
    if (ids.length === 0) return;
    // Delete child tasks first so we don't depend on FK cascade behaviour.
    const { error: tasksErr } = await supabase
      .from('plot_tasks')
      .delete()
      .in('plot_id', ids);
    if (tasksErr) {
      toast.error('Failed to delete tasks: ' + tasksErr.message);
      return;
    }
    const { error } = await supabase.from('plots').delete().in('id', ids);
    if (error) {
      toast.error('Bulk delete failed: ' + error.message);
      return;
    }
    toast.success(`Deleted ${ids.length} plot${ids.length === 1 ? '' : 's'}`);
    clearSelection();
    await fetchAll();
  };

  // Swap sort_order with the adjacent plot in the rendered (sorted) list.
  const movePlot = async (plot: Plot, dir: -1 | 1) => {
    const sorted = [...plotsRef.current].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.plot_name.localeCompare(b.plot_name, undefined, { numeric: true, sensitivity: 'base' });
    });
    const idx = sorted.findIndex(p => p.id === plot.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    const a = plot.sort_order;
    const b = swap.sort_order;
    // Optimistic local update.
    const next = plotsRef.current.map(p => {
      if (p.id === plot.id) return { ...p, sort_order: b };
      if (p.id === swap.id) return { ...p, sort_order: a };
      return p;
    });
    next.sort((x, y) => {
      if (x.sort_order !== y.sort_order) return x.sort_order - y.sort_order;
      return x.plot_name.localeCompare(y.plot_name, undefined, { numeric: true, sensitivity: 'base' });
    });
    plotsRef.current = next;
    setPlots(next);
    const [r1, r2] = await Promise.all([
      supabase.from('plots').update({ sort_order: b }).eq('id', plot.id),
      supabase.from('plots').update({ sort_order: a }).eq('id', swap.id),
    ]);
    if (r1.error || r2.error) {
      toast.error('Reorder failed');
      fetchAll();
    }
  };

  // Renders one table per task type (internal / external / variation) sharing the same
  // plot rows and the same global template index, so paste anchoring stays consistent
  // across both template-based groups. Variation-type rows are templateless and render
  // as "custom" columns trailing any template columns for that group.
  const renderTable = (groupType: TaskType, label: string) => {
    const groupTemplates = templates
      .map((tpl, idx) => ({ tpl, idx }))
      .filter(({ tpl }) => tpl.type === groupType);

    // Distinct custom-column names for this group, ordered by sort_order then name.
    const customCols: { name: string; sortOrder: number }[] = [];
    const seen = new Set<string>();
    for (const t of tasks) {
      if (t.type !== groupType || t.task_template_id != null) continue;
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      customCols.push({ name: t.name, sortOrder: t.sort_order });
    }
    customCols.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );

    if (groupTemplates.length === 0 && customCols.length === 0) {
      if (groupType === 'variation') return null;
      return (
        <div id={`section-${groupType}`} className="space-y-2 scroll-mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </h3>
          <div className="text-sm text-muted-foreground italic">
            No {label.toLowerCase()} task templates.
          </div>
        </div>
      );
    }

    const totalDataCols = groupTemplates.length + customCols.length;
    // Equal-width price columns. Actions + plot-name columns are fixed.
    const dataColWidth = totalDataCols > 0 ? `${100 / totalDataCols}%` : undefined;

    return (
      <section id={`section-${groupType}`} className="space-y-3 scroll-mt-4">
        <div className="flex items-center gap-3">
          <h3 className="text-2xl font-bold uppercase tracking-widest text-foreground">
            {label}
          </h3>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div
          className="border rounded-lg shadow-sm overflow-hidden"
          onPaste={handleTablePaste}
        >
          <table className="text-sm border-collapse w-full table-fixed">
            <colgroup>
              <col style={{ width: '128px' }} />
              <col style={{ width: '120px' }} />
              {groupTemplates.map(({ tpl }) => (
                <col key={tpl.id} style={{ width: dataColWidth }} />
              ))}
              {customCols.map(col => (
                <col key={`c:${col.name}`} style={{ width: dataColWidth }} />
              ))}
            </colgroup>
            <thead
              className="sticky top-0 z-10"
              style={{ backgroundColor: '#383B3D' }}
            >
              <tr>
                <th
                  className="px-1 py-3 border-b border-border bg-card text-[#C2C9CC] text-[12px] font-semibold uppercase tracking-wider"
                >
                  <div className="relative flex items-center pl-1">
                    <Checkbox
                      checked={
                        plots.length > 0 && selectedPlotIds.size === plots.length
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all plots"
                      className="h-4 w-4"
                    />
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      Actions
                    </span>
                  </div>
                </th>
                <th className="px-3 py-3 border-b border-border bg-card text-[#C2C9CC] text-[12px] font-semibold uppercase tracking-wider text-center">
                  Plot
                </th>
                {groupTemplates.map(({ tpl }) => (
                  <th
                    key={tpl.id}
                    className="px-3 py-3 border-b border-border bg-card text-[#C2C9CC] text-[12px] font-semibold uppercase tracking-wider text-center whitespace-nowrap"
                  >
                    {tpl.name}
                  </th>
                ))}
                {customCols.map(col => (
                  <th
                    key={`custom:${col.name}`}
                    className="px-3 py-3 border-b border-border bg-card text-[#C2C9CC] text-[12px] font-semibold uppercase tracking-wider text-center whitespace-nowrap italic"
                    title="Variation column — blank a cell to remove from that plot"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>{col.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setVariationToDelete({ name: col.name, type: groupType })
                        }
                        aria-label={`Delete variation ${col.name}`}
                        title="Delete this variation from all plots"
                        className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plots.map((plot, plotIdx) => (
                <tr key={plot.id} className="even:bg-[#191B1C] hover:bg-[#595F61]/60">
                  {/* Action buttons pinned to the LEFT of every row */}
                  <td className="px-1 py-1 border-b border-r border-[#383B3D] align-middle">
                    <div className="flex items-center justify-start gap-1 pl-1">
                      <Checkbox
                        checked={selectedPlotIds.has(plot.id)}
                        onCheckedChange={() => togglePlotSelection(plot.id)}
                        aria-label={`Select plot ${plot.plot_name}`}
                        className="h-4 w-4"
                      />
                      <button
                        type="button"
                        disabled={plotIdx === 0}
                        onClick={() => movePlot(plot, -1)}
                        aria-label={`Move plot ${plot.plot_name} up`}
                        title="Move up"
                        className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={plotIdx === plots.length - 1}
                        onClick={() => movePlot(plot, 1)}
                        aria-label={`Move plot ${plot.plot_name} down`}
                        title="Move down"
                        className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlotToDelete(plot)}
                        aria-label={`Archive plot ${plot.plot_name}`}
                        title="Archive plot"
                        className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="border-b border-r border-[#383B3D] p-0 font-semibold align-middle text-[#EDEFF0]">
                    <input
                      type="text"
                      value={plot.plot_name}
                      onFocus={() => {
                        focusedCellRef.current = null;
                        plotNameAtFocusRef.current = plot.plot_name;
                      }}
                      onBlur={() => {
                        persistPlotName(plot.id, plot.plot_name);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      onChange={e => handlePlotNameChange(plot.id, e.target.value)}
                      onPaste={e => handlePlotNamePaste(e, plotIdx)}
                      className="w-full h-full bg-transparent px-3 py-2 text-center font-semibold text-[#EDEFF0] outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                    />
                  </td>
                  {groupTemplates.map(({ tpl, idx: tplIdx }) => {
                    const key = cellKey(plot.id, tpl.id);
                    const raw = values[key] ?? '';
                    return (
                      <td
                        key={tpl.id}
                        className="border-b border-l border-[#383B3D] p-0 align-middle"
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
                          className="w-full h-full bg-transparent px-3 py-2 text-center tabular-nums text-[#EDEFF0] outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                        />
                      </td>
                    );
                  })}
                  {customCols.map(col => {
                    const key = customKey(plot.id, groupType, col.name);
                    const raw = values[key] ?? '';
                    return (
                      <td
                        key={`custom:${col.name}`}
                        className="border-b border-l border-[#383B3D] p-0 align-middle"
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          value={raw}
                          onFocus={() => {
                            // Custom columns are not a valid paste anchor — paste expects
                            // a template index, which variation columns don't have.
                            focusedCellRef.current = null;
                          }}
                          onChange={e =>
                            handleCustomChange(plot.id, groupType, col.name, e.target.value)
                          }
                          onBlur={() =>
                            persistCustomCell(
                              plot.id,
                              groupType,
                              col.name,
                              valuesRef.current[key] ?? ''
                            )
                          }
                          className="w-full h-full bg-transparent px-3 py-2 text-center tabular-nums text-[#EDEFF0] outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  const scrollToSection = (groupType: TaskType) => {
    const el = document.getElementById(`section-${groupType}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => scrollToSection('internal')}>
            Internal
          </Button>
          <Button size="sm" variant="outline" onClick={() => scrollToSection('external')}>
            External
          </Button>
          <Button size="sm" variant="outline" onClick={() => scrollToSection('variation')}>
            Variations
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={openArchivedModal}
            title="View and restore archived plots"
          >
            Show archived
          </Button>
          <Button size="sm" variant="outline" onClick={() => setVariationOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Add variation
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Add plot
          </Button>
        </div>
      </div>

      {selectedPlotIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2 shadow-sm">
          <div className="text-sm">
            <span className="font-semibold">{selectedPlotIds.size}</span>{' '}
            plot{selectedPlotIds.size === 1 ? '' : 's'} selected
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkArchive}>
              <Archive className="mr-2 h-4 w-4" />
              Archive selected
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete selected
            </Button>
          </div>
        </div>
      )}

      {plots.length === 0 ? (
        <div className="text-muted-foreground italic">No plots yet. Add one to get started.</div>
      ) : templates.length === 0 && !tasks.some(t => t.task_template_id == null) ? (
        <div className="text-muted-foreground italic">
          No task templates exist. Add some on the Task Templates page.
        </div>
      ) : (
        <div className="space-y-6">
          {renderTable('internal', 'Internal')}
          {renderTable('external', 'External')}
          {renderTable('variation', 'Variations')}
        </div>
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

      <Dialog open={variationOpen} onOpenChange={setVariationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add variation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Task name</Label>
              <Input
                value={variationName}
                onChange={e => setVariationName(e.target.value)}
                placeholder="e.g. Feature wall"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Price type</Label>
              <Select
                value={variationType}
                onValueChange={v => setVariationType(v as TaskType)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                  <SelectItem value="variation">Variation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Price (optional)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={variationPrice}
                onChange={e => setVariationPrice(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddVariation();
                }}
                placeholder="Leave blank to fill in per plot"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Apply to</Label>
              <Select value={variationApplyTo} onValueChange={setVariationApplyTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All plots</SelectItem>
                  {plots.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      Plot {p.plot_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {variationApplyTo === 'all'
                ? "Adds this task to every plot on the site. Blank a cell in the grid to remove it from plots that don't need it."
                : 'Adds this task to the selected plot only. You can add it to other plots later by typing a price into an empty cell in the grid.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariationOpen(false)}>Cancel</Button>
            <Button onClick={handleAddVariation}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!plotToDelete}
        onClose={() => setPlotToDelete(null)}
        onConfirm={handleDeletePlot}
        title={plotToDelete ? `Archive plot ${plotToDelete.plot_name}?` : 'Archive plot?'}
        description="The plot is hidden from the grid but its task prices are kept. You can restore it from Show archived."
      />

      <Dialog open={archivedModalOpen} onOpenChange={setArchivedModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archived plots</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {archivedLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : archivedPlots.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">No archived plots</div>
            ) : (
              <ul className="divide-y border rounded-md">
                {archivedPlots.map(p => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">Plot {p.plot_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sections.length === 0
                          ? 'No tasks'
                          : p.sections
                              .map(s => s.charAt(0).toUpperCase() + s.slice(1) + (s === 'variation' ? 's' : ''))
                              .join(', ')}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => restorePlot(p.id)}>
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setPlotToHardDelete(p)}
                      title="Permanently delete this plot and all its data"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchivedModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!variationToDelete}
        onClose={() => setVariationToDelete(null)}
        onConfirm={handleDeleteVariation}
        title={
          variationToDelete
            ? `Delete variation "${variationToDelete.name}"?`
            : 'Delete variation?'
        }
        description="This removes the variation column from every plot on this site."
      />

      <ConfirmDialog
        open={!!plotToHardDelete}
        onClose={() => setPlotToHardDelete(null)}
        onConfirm={handleHardDeletePlot}
        title={
          plotToHardDelete
            ? `Permanently delete plot ${plotToHardDelete.plot_name}?`
            : 'Delete plot?'
        }
        description="This permanently removes the plot and all of its task data. This cannot be undone."
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Permanently delete ${selectedPlotIds.size} plot${selectedPlotIds.size === 1 ? '' : 's'}?`}
        description="This permanently removes the selected plots and all of their task data. This cannot be undone."
      />

      <BackToTop />
    </div>
  );
}
