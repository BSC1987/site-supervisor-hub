import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Archive, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BackToTop } from '@/components/BackToTop';
import type {
  TaskType,
  Plot,
  ArchivedPlotEntry,
  Template,
  PlotTaskRow,
} from '@/components/price-grid/types';
import {
  cellKey,
  customKey,
  parsePastedGrid,
  cleanNumericInput,
  bulkInsertPlotsChunked,
} from '@/components/price-grid/utils';
import { usePasteHandler } from '@/components/price-grid/usePasteHandler';
import {
  AddUnitDialog,
  AddVariationDialog,
  ArchivePlotConfirm,
  ArchivedUnitsDialog,
  DeleteVariationConfirm,
  HardDeletePlotConfirm,
  BulkDeleteConfirm,
} from '@/components/price-grid/PriceGridDialogs';
import { PriceGridTable } from '@/components/price-grid/PriceGridTable';

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
      toast.error('Units load failed: ' + plotsRes.error.message);
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
      // Supabase's PostgREST max-rows (default 1000) silently caps .limit().
      // Paginate to fetch ALL plot_tasks regardless of server config.
      let allTaskData: PlotTaskRow[] = [];
      let taskErr: { message: string } | null = null;
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        // eslint-disable-next-line no-await-in-loop
        const { data: page, error: pageErr } = await supabase
          .from('plot_tasks')
          .select('*')
          .in('plot_id', ids)
          .eq('archived', false)
          .order('id')
          .range(from, from + PAGE - 1);
        if (pageErr) { taskErr = pageErr; break; }
        const rows = (page || []) as PlotTaskRow[];
        allTaskData.push(...rows);
        if (rows.length < PAGE) break; // last page
      }
      const taskData = allTaskData;
      if (taskErr) {
        toast.error('Tasks load failed: ' + taskErr.message);
        setLoading(false);
        return;
      }
      const t = (taskData || []) as PlotTaskRow[];
      console.log(`[fetchAll] returned ${t.length} plot_tasks rows for ${ids.length} plots`);
      if (t.length > 0) {
        console.log(`[fetchAll] first 5 rows:`, t.slice(0, 5));
      }
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
      console.log(`[fetchAll] cells with values: ${Object.keys(v).length}, total taskIds: ${Object.keys(idMap).length}`);
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
    // Try INSERT first. The unique index on (plot_id, task_template_id) is partial, so
    // we can't use ON CONFLICT from the client — instead we catch 23505, find the
    // existing (possibly archived) row, and update it in place.
    let row: PlotTaskRow | null = null;
    const insertRes = await supabase
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
    if (insertRes.error) {
      // 23505 = unique_violation. An archived row already exists for this cell —
      // revive it with the new price instead of creating a duplicate.
      const isDuplicate =
        (insertRes.error as { code?: string }).code === '23505' ||
        /duplicate key/i.test(insertRes.error.message);
      if (!isDuplicate) {
        toast.error('Save failed: ' + insertRes.error.message);
        return;
      }
      const { data: existing, error: findErr } = await supabase
        .from('plot_tasks')
        .select('*')
        .eq('plot_id', plotId)
        .eq('task_template_id', template.id)
        .maybeSingle();
      if (findErr || !existing) {
        toast.error('Save failed: ' + (findErr?.message ?? 'conflict row not found'));
        return;
      }
      const { data: updated, error: updateErr } = await supabase
        .from('plot_tasks')
        .update({
          price: numeric,
          archived: false,
          name: template.name,
          type: template.type,
        })
        .eq('id', (existing as PlotTaskRow).id)
        .select()
        .single();
      if (updateErr || !updated) {
        toast.error('Save failed: ' + (updateErr?.message ?? 'update failed'));
        return;
      }
      row = updated as PlotTaskRow;
    } else if (insertRes.data) {
      row = insertRes.data as PlotTaskRow;
    }
    if (row) {
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
  const handleTablePaste = usePasteHandler({
    siteId,
    focusedCellRef,
    plotsRef,
    templatesRef,
    tasksRef,
    taskIdsRef,
    valuesRef,
    setPlots,
    setTasks,
    setTaskIds,
    setValues,
    fetchAll,
  });

  const handleAddVariation = async () => {
    const name = variationName.trim();
    if (!name) {
      toast.error('Task name required');
      return;
    }
    if (plotsRef.current.length === 0) {
      toast.error('No units on this site yet');
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
      toast.error('Selected unit not found');
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
        toast.error(`This unit already has a ${variationType} variation called "${name}"`);
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
        ? `Added "${name}" to ${targetPlots.length} unit${targetPlots.length === 1 ? '' : 's'}`
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
      toast.error('Unit name required');
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
    toast.success('Unit added');
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
    toast.success(`Unit ${target.plot_name} archived`);

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
      toast.error('Failed to load archived units: ' + plotErr.message);
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
    const orderedTypes: TaskType[] = ['internal', 'garage', 'external', 'variation'];
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
    toast.success('Unit restored');
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
      toast.error('Unit name required');
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
        toast.error('Failed to create units: ' + insertErr);
        return;
      }
      const skipped = overflow - insertedPlots.length;
      if (skipped > 0) {
        toast.success(
          `Created ${insertedPlots.length} new plot${insertedPlots.length === 1 ? '' : 's'}, skipped ${skipped} (already exist)`
        );
      } else if (insertedPlots.length > 0) {
        toast.success(`Created ${insertedPlots.length} new unit${insertedPlots.length === 1 ? '' : 's'}`);
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
      if (failed > 0) toast.error(`${failed} unit rename${failed === 1 ? '' : 's'} failed`);
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
    toast.success(`Unit ${target.plot_name} deleted`);
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
    toast.success(`Archived ${ids.length} unit${ids.length === 1 ? '' : 's'}`);
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
    toast.success(`Deleted ${ids.length} unit${ids.length === 1 ? '' : 's'}`);
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
  const renderTable = (groupType: TaskType, label: string) => (
    <PriceGridTable
      groupType={groupType}
      label={label}
      plots={plots}
      templates={templates}
      tasks={tasks}
      values={values}
      selectedPlotIds={selectedPlotIds}
      valuesRef={valuesRef}
      focusedCellRef={focusedCellRef}
      plotNameAtFocusRef={plotNameAtFocusRef}
      onTablePaste={handleTablePaste}
      onToggleSelectAll={toggleSelectAll}
      onTogglePlotSelection={togglePlotSelection}
      onMovePlot={movePlot}
      onArchivePlot={setPlotToDelete}
      onDeleteVariation={setVariationToDelete}
      onPersistPlotName={persistPlotName}
      onPlotNameChange={handlePlotNameChange}
      onPlotNamePaste={handlePlotNamePaste}
      onCellChange={handleChange}
      onCellBlur={handleBlur}
      onCustomCellChange={handleCustomChange}
      onCustomCellPersist={persistCustomCell}
    />
  );

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
          <Button size="sm" variant="outline" onClick={() => scrollToSection('garage')}>
            Garages
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
            title="View and restore archived units"
          >
            Show archived
          </Button>
          <Button size="sm" variant="outline" onClick={() => setVariationOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Add variation
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Add unit
          </Button>
        </div>
      </div>

      {selectedPlotIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2 shadow-sm">
          <div className="text-sm">
            <span className="font-semibold">{selectedPlotIds.size}</span>{' '}
            unit{selectedPlotIds.size === 1 ? '' : 's'} selected
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
        <div className="text-muted-foreground italic">No units yet. Add one to get started.</div>
      ) : templates.length === 0 && !tasks.some(t => t.task_template_id == null) ? (
        <div className="text-muted-foreground italic">
          No task templates exist. Add some on the Task Templates page.
        </div>
      ) : (
        <div className="space-y-6">
          {renderTable('internal', 'Internal')}
          {renderTable('garage', 'Garages')}
          {renderTable('external', 'External')}
          {renderTable('variation', 'Variations')}
        </div>
      )}

      <AddUnitDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        newPlotName={newPlotName}
        setNewPlotName={setNewPlotName}
        onAdd={handleAddPlot}
      />

      <AddVariationDialog
        open={variationOpen}
        onOpenChange={setVariationOpen}
        variationName={variationName}
        setVariationName={setVariationName}
        variationType={variationType}
        setVariationType={setVariationType}
        variationPrice={variationPrice}
        setVariationPrice={setVariationPrice}
        variationApplyTo={variationApplyTo}
        setVariationApplyTo={setVariationApplyTo}
        plots={plots}
        onAdd={handleAddVariation}
      />

      <ArchivePlotConfirm
        plot={plotToDelete}
        onClose={() => setPlotToDelete(null)}
        onConfirm={handleDeletePlot}
      />

      <ArchivedUnitsDialog
        open={archivedModalOpen}
        onOpenChange={setArchivedModalOpen}
        loading={archivedLoading}
        archivedPlots={archivedPlots}
        onRestore={restorePlot}
        onHardDeleteRequest={setPlotToHardDelete}
      />

      <DeleteVariationConfirm
        variation={variationToDelete}
        onClose={() => setVariationToDelete(null)}
        onConfirm={handleDeleteVariation}
      />

      <HardDeletePlotConfirm
        plot={plotToHardDelete}
        onClose={() => setPlotToHardDelete(null)}
        onConfirm={handleHardDeletePlot}
      />

      <BulkDeleteConfirm
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        count={selectedPlotIds.size}
      />

      <BackToTop />
    </div>
  );
}
