import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Plot, PlotTaskRow, Template } from './types';
import { bulkInsertPlotsChunked, cellKey, cleanNumericInput, parsePastedGrid } from './utils';

export interface UsePasteHandlerProps {
  siteId: string;
  focusedCellRef: MutableRefObject<{ plotIdx: number; tplIdx: number } | null>;
  plotsRef: MutableRefObject<Plot[]>;
  templatesRef: MutableRefObject<Template[]>;
  tasksRef: MutableRefObject<PlotTaskRow[]>;
  taskIdsRef: MutableRefObject<Record<string, string>>;
  valuesRef: MutableRefObject<Record<string, string>>;
  setPlots: (plots: Plot[]) => void;
  setTasks: (tasks: PlotTaskRow[]) => void;
  setTaskIds: (ids: Record<string, string>) => void;
  setValues: (values: Record<string, string>) => void;
  fetchAll: () => Promise<void>;
}

export function usePasteHandler({
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
}: UsePasteHandlerProps) {
  return useCallback(async (e: React.ClipboardEvent<HTMLDivElement>) => {
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
        toast.error('Failed to check existing units: ' + existingErr.message);
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
        toast.error('Failed to create units: ' + insertErr);
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
          toast.error('Failed to load tasks for new units: ' + tasksErr.message);
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
        toast.success(`Created ${createdCount} new unit${createdCount === 1 ? '' : 's'}`);
      }
    }

    // ---------- Step 2: collect upsert rows for a single bulk RPC call ----------
    const upsertRows: Array<{
      plot_id: string; task_template_id: string;
      name: string; type: string; sort_order: number; price: number | null;
    }> = [];
    const nextValues = { ...valuesRef.current };

    // Build a section-specific template list so paste columns map to the visible
    // columns in the current section, not to arbitrary global template indices.
    // e.g. if Internal has templates at global indices [0, 3, 5, 8], pasting 4
    // columns should map to those 4 — not to global indices [0, 1, 2, 3].
    const anchorTemplate = currentTemplates[anchor.tplIdx];
    const sectionType = anchorTemplate.type;
    const sectionTemplates = currentTemplates.filter(t => t.type === sectionType);
    const anchorSectionIdx = sectionTemplates.findIndex(t => t.id === anchorTemplate.id);

    console.log(`[paste] ===== PASTE START =====`);
    console.log(`[paste] Grid: ${grid.length} rows × ${Math.max(...grid.map(r => r.length))} cols`);
    console.log(`[paste] Section: ${sectionType}, anchor col ${anchorSectionIdx} of ${sectionTemplates.length} cols`);
    console.log(`[paste] Anchor plot: ${workingPlots[anchor.plotIdx]?.plot_name ?? '?'}`);

    for (let r = 0; r < grid.length; r++) {
      const plotIdx = anchor.plotIdx + r;
      if (plotIdx >= workingPlots.length) break;
      const plot = workingPlots[plotIdx];
      for (let c = 0; c < grid[r].length; c++) {
        const sectionTplIdx = anchorSectionIdx + c;
        if (sectionTplIdx >= sectionTemplates.length) break;
        const template = sectionTemplates[sectionTplIdx];
        const raw = cleanNumericInput((grid[r][c] ?? '').trim());
        if (raw === '') continue;
        const parsed = parseFloat(raw);
        if (!Number.isFinite(parsed)) continue;
        const numeric = parsed === 0 ? null : parsed;
        const key = cellKey(plot.id, template.id);
        nextValues[key] = raw;

        // Compute sort_order for potential new rows.
        const sameType = tasksRef.current.filter(
          t => t.plot_id === plot.id && t.type === template.type
        );
        const sortOrder =
          sameType.length > 0
            ? Math.max(...sameType.map(t => t.sort_order)) + 1
            : template.sort_order;

        upsertRows.push({
          plot_id: plot.id,
          task_template_id: template.id,
          name: template.name,
          type: template.type,
          sort_order: sortOrder,
          price: numeric,
        });
        console.log(`[paste] Plot "${plot.plot_name}" / "${template.name}": ${numeric}`);
      }
    }

    valuesRef.current = nextValues;
    setValues(nextValues);

    if (upsertRows.length === 0) {
      console.log(`[paste] Nothing to upsert`);
      return;
    }

    // ---------- Step 3: single bulk upsert via RPC ----------
    console.log(`[paste] Upserting ${upsertRows.length} cells via bulk_upsert_plot_tasks RPC...`);
    const { error: rpcError } = await supabase.rpc('bulk_upsert_plot_tasks', {
      items: upsertRows,
    });
    if (rpcError) {
      console.error(`[paste] RPC FAILED:`, rpcError);
      toast.error('Bulk save failed: ' + rpcError.message);
    } else {
      console.log(`[paste] RPC OK — ${upsertRows.length} cells saved`);
    }

    // ---------- Step 4: single refetch to resync grid ----------
    await fetchAll();
    console.log(`[paste] ===== PASTE DONE =====`);
  }, [
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
  ]);
}
