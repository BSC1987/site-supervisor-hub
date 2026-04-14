import type { UserRow } from './types';

export function formatCurrency(value: number | null) {
  if (value == null) return '—';
  return `£${Number(value).toFixed(2)}`;
}

export function capitalize(s: string | null) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function formatPhone(phone: string) {
  const digits = phone.replace(/\s+/g, '');
  if (digits.length > 5) return digits.slice(0, 5) + ' ' + digits.slice(5);
  return digits;
}

export function formatPostCode(pc: string) {
  const clean = pc.replace(/\s+/g, '').toUpperCase();
  if (clean.length > 3) return clean.slice(0, -3) + ' ' + clean.slice(-3);
  return clean;
}

export function fullName(row: UserRow) {
  const parts = [row.first_name, row.last_name].filter(Boolean).map(s => capitalize(s));
  return parts.join(' ') || '(no name)';
}

export function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function formatRelativeTime(iso: string | null) {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`;
  return `${Math.floor(diffDay / 365)}y ago`;
}

export function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
