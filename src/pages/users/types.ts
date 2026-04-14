export interface UserRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  post_code: string | null;
  sort_code: string | null;
  account_number: string | null;
  national_insurance_number: string | null;
  utr_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  role: string | null;
  rate: number | null;
  role_id: string | null;
  notify_issue_report: boolean;
  notify_hourly_agreement: boolean;
  notify_sign_off: boolean;
  notify_quality_report: boolean;
  notify_invoice: boolean;
}

export const STAFF_NOTIFICATION_FIELDS = [
  { key: 'notify_issue_report', label: 'Issue Reports' },
  { key: 'notify_hourly_agreement', label: 'Hourly Agreements' },
  { key: 'notify_sign_off', label: 'Sign Offs' },
  { key: 'notify_quality_report', label: 'Quality Reports' },
  { key: 'notify_invoice', label: 'Invoices' },
] as const;

export interface SignOff {
  id: string;
  site_name: string | null;
  plot_name: string | null;
  task_type: string;
  manager_name: string | null;
  created_at: string;
}

export interface HourlyAgreement {
  id: string;
  site_name: string | null;
  plot_name: string | null;
  hours: number;
  rate: number | null;
  descriptions: string[];
  created_at: string;
}

export interface Invoice {
  id: string;
  status: string;
  total_amount: number;
  submitted_at: string | null;
  created_at: string;
}

export type SortKey = 'name' | 'role' | 'rate' | 'last_seen';
export type SortDir = 'asc' | 'desc';

export const ROLES = ['admin', 'supervisor', 'decorator'] as const;

export interface PendingUser {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  sort_code: string | null;
  account_number: string | null;
  national_insurance_number: string | null;
  utr_number: string | null;
  created_at: string;
}

export interface DetailForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  post_code: string;
  sort_code: string;
  account_number: string;
  national_insurance_number: string;
  utr_number: string;
  is_active: boolean;
  role: string;
  rate: string;
}
