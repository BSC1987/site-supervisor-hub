import { supabase } from '@/lib/supabase';
import type { HourlyAgreement, Invoice, PendingUser, SignOff } from '@/pages/users/types';

/* ------------------------------------------------------------------ */
/*  Profiles + roles (Users page list)                                 */
/* ------------------------------------------------------------------ */

/**
 * All approved (or null-status legacy) profiles. Used as the main user list.
 */
export async function fetchActiveProfiles(): Promise<any[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or('status.eq.approved,status.is.null');
  if (error) throw error;
  return data ?? [];
}

export async function fetchUserRoles(): Promise<any[]> {
  const { data, error } = await supabase.from('user_roles').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function fetchPendingProfiles(): Promise<PendingUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, user_id, first_name, last_name, email, phone, sort_code, account_number, national_insurance_number, utr_number, created_at',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PendingUser[];
}

/**
 * Toggle is_active on a user via the toggle_user_active RPC.
 */
export async function toggleUserActive(userId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.rpc('toggle_user_active', {
    _user_id: userId,
    _is_active: isActive,
  });
  if (error) throw error;
}

/**
 * Update an existing user_roles row. Patch may be { role } or { role, rate }.
 */
export async function updateUserRole(
  roleId: string,
  patch: { role?: string; rate?: number },
): Promise<void> {
  const { error } = await supabase.from('user_roles').update(patch).eq('id', roleId);
  if (error) throw error;
}

/**
 * Insert a new user_roles row.
 */
export async function insertUserRole(payload: {
  user_id: string;
  role: string;
  rate: number;
}): Promise<void> {
  const { error } = await supabase.from('user_roles').insert(payload);
  if (error) throw error;
}

/**
 * Generic profile patch by profile id (not user_id). Used both for the
 * notification toggle in the user list and for the full edit-user save.
 */
export async function updateProfile(
  profileId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', profileId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Add / approve / reject / delete user (RPCs)                        */
/* ------------------------------------------------------------------ */

export interface CreateUserArgs {
  _email: string;
  _password: string;
  _first_name: string;
  _last_name: string;
  _phone: string | null;
  _post_code: string | null;
  _sort_code: string | null;
  _account_number: string | null;
  _national_insurance_number: string | null;
  _utr_number: string | null;
  _role: string;
  _rate: number;
}

/**
 * Bump the current user's profiles.last_seen_at via the touch_last_seen RPC.
 */
export async function touchLastSeen(): Promise<void> {
  const { error } = await supabase.rpc('touch_last_seen');
  if (error) throw error;
}

export async function createUser(args: CreateUserArgs): Promise<void> {
  const { error } = await supabase.rpc('create_user', args);
  if (error) throw error;
}

/**
 * Approve or reject a pending profile via the update_user_status RPC.
 */
export async function updatePendingUserStatus(
  userId: string,
  status: 'approved' | 'rejected',
): Promise<void> {
  const { error } = await supabase.rpc('update_user_status', {
    target_user_id: userId,
    new_status: status,
  });
  if (error) throw error;
}

/**
 * Permanently delete a user via the hard_delete_user RPC.
 */
export async function hardDeleteUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('hard_delete_user', { _user_id: userId });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  UserDetail activity tables                                         */
/* ------------------------------------------------------------------ */

export async function fetchUserSignOffs(userId: string): Promise<SignOff[]> {
  const { data, error } = await supabase
    .from('sign_offs')
    .select('id, site_name, plot_name, task_type, manager_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as SignOff[];
}

export async function fetchUserHourlyAgreements(userId: string): Promise<HourlyAgreement[]> {
  const { data, error } = await supabase
    .from('hourly_agreements')
    .select('id, site_name, plot_name, hours, rate, descriptions, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as HourlyAgreement[];
}

export async function fetchUserInvoices(userId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, status, total_amount, submitted_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Invoice[];
}

/* ------------------------------------------------------------------ */
/*  Pending users context                                              */
/* ------------------------------------------------------------------ */

/**
 * Count profiles with status='pending'. Returns null on error so callers
 * can skip the state update (matching prior context behaviour).
 */
export async function countPendingProfiles(): Promise<number | null> {
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error || count == null) return null;
  return count;
}

/**
 * Subscribe to realtime changes on profiles where status='pending'.
 * Returns the unsubscribe function.
 */
export function subscribeToPendingProfileChanges(onChange: () => void): () => void {
  const channel = supabase
    .channel('pending-users')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: 'status=eq.pending',
      },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
