import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, UserX, Plus, Check, X, Clock, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { usePendingUsers } from '@/contexts/PendingUsersContext';
import {
  STAFF_NOTIFICATION_FIELDS,
  ROLES,
  type UserRow,
  type SortKey,
  type SortDir,
  type PendingUser,
} from '@/pages/users/types';
import {
  formatCurrency,
  capitalize,
  formatPhone,
  formatPostCode,
  fullName,
  formatDate,
} from '@/pages/users/utils';
import { UserDetail } from '@/pages/users/UserDetail';


/* ------------------------------------------------------------------ */
/*  Pending approvals                                                  */
/* ------------------------------------------------------------------ */

function PendingSection({ users, onAction, onDelete }: {
  users: PendingUser[];
  onAction: (userId: string, status: 'approved' | 'rejected') => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<PendingUser | null>(null);

  if (users.length === 0) return null;

  const handle = async (userId: string, status: 'approved' | 'rejected') => {
    setLoading(prev => ({ ...prev, [userId]: true }));
    await onAction(userId, status);
    setLoading(prev => ({ ...prev, [userId]: false }));
  };

  const field = (label: string, value: string | null) => (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Clock className="h-4 w-4 text-orange-500" />
        Pending Approvals ({users.length})
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users.map(u => (
          <div key={u.id} className="border rounded-lg p-4 bg-card space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium">
                  {[u.first_name, u.last_name].filter(Boolean).map(s => capitalize(s)).join(' ') || '(no name)'}
                </h4>
                <p className="text-sm text-muted-foreground">{u.email || '—'}</p>
              </div>
              <Badge variant="outline" className="border-orange-500/50 text-orange-500">
                Pending
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {field('Phone', u.phone)}
              {field('Sort Code', u.sort_code)}
              {field('Account Number', u.account_number)}
              {field('National Insurance', u.national_insurance_number)}
              {field('UTR Number', u.utr_number)}
              {field('Signed Up', formatDate(u.created_at))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                disabled={!!loading[u.user_id]}
                onClick={() => handle(u.user_id, 'approved')}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {loading[u.user_id] ? 'Saving…' : 'Approve'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-red-500/50 text-red-500 hover:bg-red-500/10"
                disabled={!!loading[u.user_id]}
                onClick={() => setConfirmDelete(u)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!confirmDelete} onOpenChange={open => { if (!open) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject & Delete User</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Permanently reject and delete <span className="font-medium text-foreground">{confirmDelete && ([confirmDelete.first_name, confirmDelete.last_name].filter(Boolean).map(s => capitalize(s)).join(' ') || confirmDelete.email)}</span>? This removes their account entirely.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={!!confirmDelete && !!loading[confirmDelete.user_id]}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!!confirmDelete && !!loading[confirmDelete.user_id]}
              onClick={async () => {
                if (!confirmDelete) return;
                setLoading(prev => ({ ...prev, [confirmDelete.user_id]: true }));
                await onDelete(confirmDelete.user_id);
                setLoading(prev => ({ ...prev, [confirmDelete.user_id]: false }));
                setConfirmDelete(null);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {confirmDelete && loading[confirmDelete.user_id] ? 'Deleting…' : 'Reject & Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main list                                                          */
/* ------------------------------------------------------------------ */

function UserTable({ label, users, onSelect, onUpdate, onDelete, onToggleNotification }: {
  label: string;
  users: UserRow[];
  onSelect: (u: UserRow) => void;
  onUpdate: (u: UserRow, patch: { role?: string; is_active?: boolean }) => void;
  onDelete?: (u: UserRow) => void;
  onToggleNotification?: (u: UserRow, field: typeof STAFF_NOTIFICATION_FIELDS[number]['key'], value: boolean) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...users].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return dir * fullName(a).localeCompare(fullName(b));
    if (sortKey === 'role') return dir * (a.role ?? '').localeCompare(b.role ?? '');
    if (sortKey === 'rate') return dir * ((a.rate ?? 0) - (b.rate ?? 0));
    return 0;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3 inline" />
      : <ArrowDown className="ml-1 h-3 w-3 inline" />;
  };

  if (users.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      <div className="border rounded-lg bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 cursor-pointer select-none text-center min-w-[160px]" onClick={() => toggleSort('name')}>
                Name <SortIcon col="name" />
              </TableHead>
              <TableHead className="h-9 cursor-pointer select-none text-center min-w-[120px]" onClick={() => toggleSort('role')}>
                Role <SortIcon col="role" />
              </TableHead>
              <TableHead className="h-9 cursor-pointer select-none text-center min-w-[100px]" onClick={() => toggleSort('rate')}>
                Hourly Rate <SortIcon col="rate" />
              </TableHead>
              <TableHead className="h-9 text-center min-w-[100px]">Status</TableHead>
              {onToggleNotification && STAFF_NOTIFICATION_FIELDS.map(({ key, label }) => (
                <TableHead key={key} className="h-9 text-center min-w-[100px]">{label}</TableHead>
              ))}
              {onDelete && <TableHead className="h-9" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(u => (
              <TableRow
                key={u.id}
                className="cursor-pointer hover:bg-muted/50 [&:nth-child(even)]:bg-transparent"
                onClick={() => onSelect(u)}
              >
                <TableCell className="py-2 text-center font-medium">{fullName(u)}</TableCell>
                <TableCell className="py-2 text-center" onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-muted outline-none">
                      {capitalize(u.role)} <ChevronDown className="h-3 w-3 opacity-50" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      {ROLES.map(r => (
                        <DropdownMenuItem
                          key={r}
                          onClick={() => onUpdate(u, { role: r })}
                        >
                          {capitalize(r)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
                <TableCell className="py-2 text-center">{formatCurrency(u.rate)}</TableCell>
                <TableCell className="py-2 text-center" onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors outline-none ${
                      u.is_active
                        ? 'bg-green-500/15 text-green-500 hover:bg-green-500/25'
                        : 'bg-red-500/15 text-red-500 hover:bg-red-500/25'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'} <ChevronDown className="h-3 w-3 opacity-50" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      <DropdownMenuItem onClick={() => onUpdate(u, { is_active: true })}>
                        <span className="text-green-500">Active</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onUpdate(u, { is_active: false })}>
                        <span className="text-red-500">Inactive</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
                {onToggleNotification && STAFF_NOTIFICATION_FIELDS.map(({ key }) => (
                  <TableCell key={key} className="py-2 text-center" onClick={e => e.stopPropagation()}>
                    <Switch
                      checked={u[key]}
                      onCheckedChange={(checked) => onToggleNotification(u, key, checked)}
                    />
                  </TableCell>
                ))}
                {onDelete && (
                  <TableCell className="py-2 text-center" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => setConfirmDelete(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {onDelete && (
        <Dialog open={!!confirmDelete} onOpenChange={open => { if (!open) setConfirmDelete(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Permanently delete <span className="font-medium text-foreground">{confirmDelete && fullName(confirmDelete)}</span>? This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={async () => {
                  if (!confirmDelete) return;
                  setDeleting(true);
                  await onDelete(confirmDelete);
                  setDeleting(false);
                  setConfirmDelete(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

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
