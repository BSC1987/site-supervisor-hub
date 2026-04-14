import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { UserX, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { usePendingUsers } from '@/contexts/PendingUsersContext';
import {
  STAFF_NOTIFICATION_FIELDS,
  ROLES,
  type UserRow,
  type PendingUser,
} from '@/pages/users/types';
import {
  capitalize,
  formatPhone,
  formatPostCode,
} from '@/pages/users/utils';
import { UserDetail } from '@/pages/users/UserDetail';
import { PendingSection } from '@/pages/users/PendingSection';
import { UserTable } from '@/pages/users/UserTable';




export default function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    first_name: '', last_name: '', email: '', password: '',
    phone: '', post_code: '', sort_code: '', account_number: '',
    national_insurance_number: '', utr_number: '',
    role: 'decorator', rate: '18',
  });
  const [addSaving, setAddSaving] = useState(false);
  const { refreshPendingCount } = usePendingUsers();

  const fetchUsers = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, pendingRes] = await Promise.all([
      supabase.from('profiles').select('*').or('status.eq.approved,status.is.null'),
      supabase.from('user_roles').select('*'),
      supabase.from('profiles')
        .select('id, user_id, first_name, last_name, email, phone, sort_code, account_number, national_insurance_number, utr_number, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (profilesRes.error) { toast.error('Failed to load profiles: ' + profilesRes.error.message); setLoading(false); return; }
    if (rolesRes.error) { toast.error('Failed to load roles: ' + rolesRes.error.message); setLoading(false); return; }

    const roleMap = new Map<string, { role: string; rate: number; id: string }>();
    for (const r of rolesRes.data || []) {
      roleMap.set(r.user_id, { role: r.role, rate: r.rate, id: r.id });
    }

    const merged: UserRow[] = (profilesRes.data || []).map((p: any) => {
      const r = roleMap.get(p.user_id);
      return { ...p, role: r?.role ?? null, rate: r?.rate ?? null, role_id: r?.id ?? null };
    });

    setUsers(merged);
    setPendingUsers((pendingRes.data || []) as PendingUser[]);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSaved = (updated: UserRow) => {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    setSelected(updated);
  };

  const toggleActive = async (user: UserRow, is_active: boolean) => {
    const updated = { ...user, is_active };
    setUsers(prev => prev.map(u => u.id === user.id ? updated : u));

    const { error } = await supabase.rpc('toggle_user_active', {
      _user_id: user.user_id,
      _is_active: is_active,
    });

    if (error) {
      toast.error('Failed to update status');
      setUsers(prev => prev.map(u => u.id === user.id ? user : u));
    } else {
      toast.success(is_active ? 'User restored' : 'User deactivated');
    }
  };

  const handleInlineUpdate = async (user: UserRow, patch: { role?: string; is_active?: boolean }) => {
    if (patch.is_active !== undefined) {
      await toggleActive(user, patch.is_active);
      return;
    }

    if (patch.role !== undefined) {
      const updated = { ...user, ...patch };
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u));

      const res = user.role_id
        ? await supabase.from('user_roles').update({ role: patch.role }).eq('id', user.role_id)
        : await supabase.from('user_roles').insert({ user_id: user.user_id, role: patch.role, rate: user.rate ?? 18 });
      if (res.error) {
        toast.error('Failed to update role');
        setUsers(prev => prev.map(u => u.id === user.id ? user : u));
      }
    }
  };

  const handleToggleNotification = async (user: UserRow, field: typeof STAFF_NOTIFICATION_FIELDS[number]['key'], value: boolean) => {
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, [field]: value } : u));
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', user.id);
    if (error) {
      toast.error('Failed to update notification preference');
      setUsers(prev => prev.map(u => u.id === user.id ? user : u));
    }
  };

  const handleAddUser = async () => {
    const email = addForm.email.trim().toLowerCase();
    const first = capitalize(addForm.first_name.trim());
    const last = capitalize(addForm.last_name.trim());
    if (!email || !first || !last || !addForm.password) {
      toast.error('First name, last name, email and password are required');
      return;
    }
    setAddSaving(true);
    const { error } = await supabase.rpc('create_user', {
      _email: email,
      _password: addForm.password,
      _first_name: first,
      _last_name: last,
      _phone: addForm.phone.trim() ? formatPhone(addForm.phone.trim()) : null,
      _post_code: addForm.post_code.trim() ? formatPostCode(addForm.post_code.trim()) : null,
      _sort_code: addForm.sort_code.trim() || null,
      _account_number: addForm.account_number.trim() || null,
      _national_insurance_number: addForm.national_insurance_number.trim().toUpperCase() || null,
      _utr_number: addForm.utr_number.trim() || null,
      _role: addForm.role,
      _rate: parseFloat(addForm.rate) || 18,
    });
    if (error) {
      toast.error('Failed to create user: ' + error.message);
    } else {
      toast.success('User created');
      setAddOpen(false);
      setAddForm({ first_name: '', last_name: '', email: '', password: '', phone: '', post_code: '', sort_code: '', account_number: '', national_insurance_number: '', utr_number: '', role: 'decorator', rate: '18' });
      fetchUsers();
    }
    setAddSaving(false);
  };

  const handlePendingAction = async (userId: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase.rpc('update_user_status', {
      target_user_id: userId,
      new_status: status,
    });
    if (error) {
      toast.error('Failed to update status: ' + error.message);
      return;
    }
    if (status === 'approved') {
      const { error: roleErr } = await supabase.from('user_roles').insert({
        user_id: userId,
        role: 'decorator',
        rate: 18,
      });
      if (roleErr) toast.error('Approved but failed to assign role: ' + roleErr.message);
    }
    toast.success(status === 'approved' ? 'User approved as decorator' : 'User rejected');
    fetchUsers();
    refreshPendingCount();
  };

  const handleDeletePending = async (userId: string) => {
    const { error } = await supabase.rpc('hard_delete_user', { _user_id: userId });
    if (error) {
      toast.error('Failed to delete user: ' + error.message);
    } else {
      toast.success('User rejected and deleted');
      fetchUsers();
      refreshPendingCount();
    }
  };

  const handleDeleteUser = async (user: UserRow) => {
    const { error } = await supabase.rpc('hard_delete_user', {
      _user_id: user.user_id,
    });
    if (error) {
      toast.error('Failed to delete user: ' + error.message);
    } else {
      toast.success('User deleted');
      setUsers(prev => prev.filter(u => u.id !== user.id));
    }
  };

  if (selected) {
    return (
      <UserDetail
        user={selected}
        onBack={() => { setSelected(null); fetchUsers(); }}
        onSaved={handleSaved}
      />
    );
  }

  const active = users.filter(u => u.is_active);
  const inactive = users.filter(u => !u.is_active);
  const staff = active.filter(u => u.role !== 'decorator');
  const decorators = active.filter(u => u.role === 'decorator');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Staff: {staff.length} &middot; Decorators: {decorators.length} &middot; Total: {active.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inactive.length > 0 && (
            <Button
              variant={showInactive ? 'default' : 'outline'}
              onClick={() => setShowInactive(v => !v)}
            >
              <UserX className="mr-2 h-4 w-4" />
              Inactive ({inactive.length})
            </Button>
          )}
          <Button onClick={() => { setAddForm({ first_name: '', last_name: '', email: '', password: '', phone: '', post_code: '', sort_code: '', account_number: '', national_insurance_number: '', utr_number: '', role: 'decorator', rate: '18' }); setAddOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />Add User
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No users found</p>
      ) : (
        <>
          <PendingSection users={pendingUsers} onAction={handlePendingAction} onDelete={handleDeletePending} />
          {showInactive ? (
            <UserTable label="Inactive Users" users={inactive} onSelect={setSelected} onUpdate={handleInlineUpdate} onDelete={handleDeleteUser} />
          ) : (
            <>
              <UserTable label="Staff" users={staff} onSelect={setSelected} onUpdate={handleInlineUpdate} onToggleNotification={handleToggleNotification} />
              <UserTable label="Decorators" users={decorators} onSelect={setSelected} onUpdate={handleInlineUpdate} />
            </>
          )}
        </>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input autoComplete="off" value={addForm.first_name} onChange={e => setAddForm(f => ({ ...f, first_name: e.target.value }))} onBlur={() => setAddForm(f => ({ ...f, first_name: capitalize(f.first_name) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input autoComplete="off" value={addForm.last_name} onChange={e => setAddForm(f => ({ ...f, last_name: e.target.value }))} onBlur={() => setAddForm(f => ({ ...f, last_name: capitalize(f.last_name) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input autoComplete="off" type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} onBlur={() => setAddForm(f => ({ ...f, email: f.email.toLowerCase() }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <Input autoComplete="new-password" type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} onBlur={() => setAddForm(f => ({ ...f, phone: formatPhone(f.phone) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Post Code</Label>
              <Input value={addForm.post_code} onChange={e => setAddForm(f => ({ ...f, post_code: e.target.value }))} onBlur={() => setAddForm(f => ({ ...f, post_code: formatPostCode(f.post_code) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Sort Code</Label>
              <Input value={addForm.sort_code} onChange={e => setAddForm(f => ({ ...f, sort_code: e.target.value }))} placeholder="00-00-00" />
            </div>
            <div className="space-y-1.5">
              <Label>Account Number</Label>
              <Input value={addForm.account_number} onChange={e => setAddForm(f => ({ ...f, account_number: e.target.value }))} placeholder="12345678" />
            </div>
            <div className="space-y-1.5">
              <Label>National Insurance</Label>
              <Input value={addForm.national_insurance_number} onChange={e => setAddForm(f => ({ ...f, national_insurance_number: e.target.value }))} onBlur={() => setAddForm(f => ({ ...f, national_insurance_number: f.national_insurance_number.toUpperCase() }))} placeholder="AB 12 34 56 C" />
            </div>
            <div className="space-y-1.5">
              <Label>UTR Number</Label>
              <Input value={addForm.utr_number} onChange={e => setAddForm(f => ({ ...f, utr_number: e.target.value }))} placeholder="1234567890" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={addForm.role} onValueChange={v => setAddForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r} value={r}>{capitalize(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hourly Rate (£)</Label>
              <Input type="number" step="0.50" min="0" value={addForm.rate} onChange={e => setAddForm(f => ({ ...f, rate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={addSaving}>{addSaving ? 'Creating…' : 'Create User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
