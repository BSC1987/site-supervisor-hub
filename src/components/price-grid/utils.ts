import type { TaskType } from './types';

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
