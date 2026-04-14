import { supabase } from '@/lib/supabase';
import type { Plot, TaskType } from './types';

// Cell keys for template-backed cells use the template's UUID directly.
// Custom (variation) cells use a "c:" prefix + type + name, which can't
// collide with a UUID.
export const cellKey = (plotId: string, templateId: string) => `${plotId}:${templateId}`;

export const customKey = (plotId: string, type: TaskType, name: string) =>
  `${plotId}:c:${type}:${name}`;

export function parsePastedGrid(text: string): string[][] {
  const trimmed = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!trimmed) return [];
  return trimmed.split('\n').map(r => r.split('\t'));
}

// Strip thousands separators and surrounding currency symbols / whitespace from a
// numeric cell value so "£1,234.56" → "1234.56". Empty input passes through.
export function cleanNumericInput(raw: string): string {
  return raw.replace(/[,£$\s]/g, '');
}

// Insert many plot rows in small batches using upsert + ignoreDuplicates so the
// unique (site_id, plot_name) constraint never aborts the whole batch. Returns the
// rows that were actually inserted (skipped duplicates are filtered out by Postgres).
// Chunking keeps the request payload small and avoids the occasional REST timeout
// we saw on >40-row pastes.
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
