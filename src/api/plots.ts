import { supabase } from '@/lib/supabase';
import type { Plot, PlotTaskRow, TaskType, Template } from '@/components/price-grid/types';

/* ------------------------------------------------------------------ */
/*  Plots                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fetch all active (non-archived) plots for a site. Caller sorts.
 */
export async function fetchActivePlotsBySite(siteId: string): Promise<Plot[]> {
  const { data, error } = await supabase
    .from('plots')
    .select('*')
    .eq('site_id', siteId)
    .eq('is_archived', false);
  if (error) throw error;
  return (data ?? []) as Plot[];
}

/**
 * Fetch every plot_name on a site, including archived ones. Used by the
 * paste handler to avoid generating colliding auto-names against the
 * unique (site_id, plot_name) constraint.
 */
export async function fetchAllPlotNamesBySite(siteId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('plots')
    .select('plot_name')
    .eq('site_id', siteId);
  if (error) throw error;
  return ((data ?? []) as { plot_name: string }[]).map(r => r.plot_name);
}

/**
 * Archived plots for a site (lightweight: id, plot_name, sort_order).
 */
export async function fetchArchivedPlotsBySite(
  siteId: string,
): Promise<Array<{ id: string; plot_name: string; sort_order: number }>> {
  const { data, error } = await supabase
    .from('plots')
    .select('id, plot_name, sort_order')
    .eq('site_id', siteId)
    .eq('is_archived', true);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; plot_name: string; sort_order: number }>;
}

/**
 * Fetch (plot_id, type) pairs for any plot_tasks across a list of plot ids.
 * Used to summarise which "sections" each archived plot has.
 */
export async function fetchPlotTaskSections(
  plotIds: string[],
): Promise<Array<{ plot_id: string; type: TaskType }>> {
  const { data, error } = await supabase
    .from('plot_tasks')
    .select('plot_id, type')
    .in('plot_id', plotIds);
  if (error) throw error;
  return (data ?? []) as Array<{ plot_id: string; type: TaskType }>;
}

export async function insertPlot(row: {
  site_id: string;
  plot_name: string;
  status: string;
  sort_order: number;
}): Promise<void> {
  const { error } = await supabase.from('plots').insert(row);
  if (error) throw error;
}

export async function updatePlotName(plotId: string, plotName: string): Promise<void> {
  const { error } = await supabase.from('plots').update({ plot_name: plotName }).eq('id', plotId);
  if (error) throw error;
}

/**
 * Used by movePlot's optimistic Promise.all swap. Returns the raw supabase
 * result so the caller can inspect both swap legs together.
 */
export function updatePlotSortOrder(plotId: string, sortOrder: number) {
  return supabase.from('plots').update({ sort_order: sortOrder }).eq('id', plotId);
}

export async function archivePlot(plotId: string): Promise<void> {
  const { error } = await supabase.from('plots').update({ is_archived: true }).eq('id', plotId);
  if (error) throw error;
}

export async function archivePlots(plotIds: string[]): Promise<void> {
  const { error } = await supabase.from('plots').update({ is_archived: true }).in('id', plotIds);
  if (error) throw error;
}

export async function restorePlot(plotId: string): Promise<void> {
  const { error } = await supabase.from('plots').update({ is_archived: false }).eq('id', plotId);
  if (error) throw error;
}

export async function deletePlot(plotId: string): Promise<void> {
  const { error } = await supabase.from('plots').delete().eq('id', plotId);
  if (error) throw error;
}

export async function deletePlots(plotIds: string[]): Promise<void> {
  const { error } = await supabase.from('plots').delete().in('id', plotIds);
  if (error) throw error;
}

/**
 * Insert plots in batches of 20 with onConflict ignore so the unique
 * (site_id, plot_name) constraint never aborts the whole batch. Returns
 * the rows actually inserted (silently-skipped duplicates are filtered out
 * by Postgres). Returns { inserted, error } so callers can distinguish a
 * partial success from a hard failure.
 */
export async function bulkInsertPlotsChunked(
  rows: Array<{ site_id: string; plot_name: string; status: string; sort_order: number }>,
): Promise<{ inserted: Plot[]; error: string | null }> {
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
}

/* ------------------------------------------------------------------ */
/*  Task templates                                                     */
/* ------------------------------------------------------------------ */

export async function fetchActiveTaskTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('archived', false)
    .order('type', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Template[];
}

/* ------------------------------------------------------------------ */
/*  Plot tasks                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch all active plot_tasks for the given plot ids, paginating in batches
 * of 1000 to bypass PostgREST's default row cap. Used both by the main
 * grid load and by the paste handler after auto-creating new plots.
 */
export async function fetchActivePlotTasksByPlotIds(plotIds: string[]): Promise<PlotTaskRow[]> {
  const all: PlotTaskRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('plot_tasks')
      .select('*')
      .in('plot_id', plotIds)
      .eq('archived', false)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as PlotTaskRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

export async function updatePlotTaskPrice(taskId: string, price: number | null): Promise<void> {
  const { error } = await supabase.from('plot_tasks').update({ price }).eq('id', taskId);
  if (error) throw error;
}

/**
 * Insert a single plot_task and return the inserted row. The unique index on
 * (plot_id, task_template_id) is partial, so callers should catch 23505
 * errors and call findPlotTaskByTemplate + revivePlotTask instead.
 */
export function insertPlotTask(row: {
  plot_id: string;
  task_template_id: string | null;
  name: string;
  type: TaskType;
  sort_order: number;
  price: number | null;
}) {
  return supabase.from('plot_tasks').insert(row).select().single();
}

/**
 * Bulk-insert plot_task rows without returning them. Used by the
 * "Add variation" flow which seeds a new column across many plots.
 */
export async function insertPlotTasks(
  rows: Array<{
    plot_id: string;
    task_template_id: string | null;
    name: string;
    type: TaskType;
    sort_order: number;
    price: number | null;
  }>,
): Promise<void> {
  const { error } = await supabase.from('plot_tasks').insert(rows);
  if (error) throw error;
}

/**
 * Find an existing (possibly archived) plot_task by its plot+template pair.
 * Returns null when no row exists.
 */
export async function findPlotTaskByTemplate(
  plotId: string,
  templateId: string,
): Promise<PlotTaskRow | null> {
  const { data, error } = await supabase
    .from('plot_tasks')
    .select('*')
    .eq('plot_id', plotId)
    .eq('task_template_id', templateId)
    .maybeSingle();
  if (error) throw error;
  return (data as PlotTaskRow | null) ?? null;
}

/**
 * Revive an archived plot_task with a new price + identifying fields.
 * Returns the updated row.
 */
export async function revivePlotTask(
  taskId: string,
  patch: { price: number | null; name: string; type: TaskType },
): Promise<PlotTaskRow> {
  const { data, error } = await supabase
    .from('plot_tasks')
    .update({ ...patch, archived: false })
    .eq('id', taskId)
    .select()
    .single();
  if (error) throw error;
  return data as PlotTaskRow;
}

/**
 * Soft-delete a single plot_task (sets archived=true, price=null). Keeps
 * the row for reporting; hides it from the grid.
 */
export async function softDeletePlotTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('plot_tasks')
    .update({ archived: true, price: null })
    .eq('id', taskId);
  if (error) throw error;
}

export async function softDeletePlotTasks(taskIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('plot_tasks')
    .update({ archived: true, price: null })
    .in('id', taskIds);
  if (error) throw error;
}

export async function deletePlotTasksByPlot(plotId: string): Promise<void> {
  const { error } = await supabase.from('plot_tasks').delete().eq('plot_id', plotId);
  if (error) throw error;
}

export async function deletePlotTasksByPlots(plotIds: string[]): Promise<void> {
  const { error } = await supabase.from('plot_tasks').delete().in('plot_id', plotIds);
  if (error) throw error;
}

/**
 * Bulk upsert of plot_tasks via the bulk_upsert_plot_tasks RPC. Used by the
 * paste handler to flush a whole pasted block in a single round-trip.
 */
export async function bulkUpsertPlotTasks(
  items: Array<{
    plot_id: string;
    task_template_id: string;
    name: string;
    type: string;
    sort_order: number;
    price: number | null;
  }>,
): Promise<void> {
  const { error } = await supabase.rpc('bulk_upsert_plot_tasks', { items });
  if (error) throw error;
}
