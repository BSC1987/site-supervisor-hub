import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  ROLES,
  type UserRow,
  type SignOff,
  type HourlyAgreement,
  type Invoice,
  type DetailForm,
} from './types';
import {
  formatCurrency,
  capitalize,
  formatPhone,
  formatPostCode,
  fullName,
  formatDate,
  formatDateTime,
} from './utils';
import {
  fetchUserSignOffs,
  fetchUserHourlyAgreements,
  fetchUserInvoices,
  updateProfile,
  updateUserRole,
  insertUserRole,
} from '@/api/users';

export function UserDetail({ user, onBack, onSaved }: {
  user: UserRow;
  onBack: () => void;
  onSaved: (updated: UserRow) => void;
}) {
  const [form, setForm] = useState<DetailForm>({
    first_name: capitalize(user.first_name),
    last_name: capitalize(user.last_name),
    email: user.email ?? '',
    phone: user.phone ? formatPhone(user.phone) : '',
    post_code: user.post_code ? formatPostCode(user.post_code) : '',
    sort_code: user.sort_code ?? '',
    account_number: user.account_number ?? '',
    national_insurance_number: user.national_insurance_number ?? '',
    utr_number: user.utr_number ?? '',
    is_active: user.is_active,
    role: user.role ?? 'decorator',
    rate: user.rate != null ? String(user.rate) : '18',
  });
  const [saving, setSaving] = useState(false);

  const [signOffs, setSignOffs] = useState<SignOff[]>([]);
  const [hourlyAgreements, setHourlyAgreements] = useState<HourlyAgreement[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  useEffect(() => {
    async function load() {
      setLoadingActivity(true);
      const [soRes, haRes, invRes] = await Promise.allSettled([
        fetchUserSignOffs(user.user_id),
        fetchUserHourlyAgreements(user.user_id),
        fetchUserInvoices(user.user_id),
      ]);
      if (soRes.status === 'rejected') toast.error('Failed to load sign-offs');
      if (haRes.status === 'rejected') toast.error('Failed to load hourly agreements');
      if (invRes.status === 'rejected') toast.error('Failed to load invoices');
      setSignOffs(soRes.status === 'fulfilled' ? soRes.value : []);
      setHourlyAgreements(haRes.status === 'fulfilled' ? haRes.value : []);
      setInvoices(invRes.status === 'fulfilled' ? invRes.value : []);
      setLoadingActivity(false);
    }
    load();
  }, [user.user_id]);

  const handleSave = async () => {
    setSaving(true);

    const profileUpdate = {
      first_name: capitalize(form.first_name.trim()) || null,
      last_name: capitalize(form.last_name.trim()) || null,
      email: form.email.trim().toLowerCase() || null,
      phone: form.phone.trim() ? formatPhone(form.phone.trim()) : null,
      post_code: form.post_code.trim() ? formatPostCode(form.post_code.trim()) : null,
      sort_code: form.sort_code.trim() || null,
      account_number: form.account_number.trim() || null,
      national_insurance_number: form.national_insurance_number.trim().toUpperCase() || null,
      utr_number: form.utr_number.trim() || null,
      is_active: form.is_active,
    };

    const roleUpdate = {
      role: form.role,
      rate: parseFloat(form.rate) || 18,
    };

    const [pRes, rRes] = await Promise.allSettled([
      updateProfile(user.id, profileUpdate),
      user.role_id
        ? updateUserRole(user.role_id, roleUpdate)
        : insertUserRole({ user_id: user.user_id, ...roleUpdate }),
    ]);

    if (pRes.status === 'rejected' || rRes.status === 'rejected') {
      const msg =
        (pRes.status === 'rejected' ? (pRes.reason as Error).message : undefined) ||
        (rRes.status === 'rejected' ? (rRes.reason as Error).message : undefined);
      toast.error('Save failed: ' + msg);
    } else {
      toast.success('Saved');
      onSaved({
        ...user,
        ...profileUpdate,
        role: roleUpdate.role,
        rate: roleUpdate.rate,
        role_id: user.role_id ?? 'new',
      });
    }
    setSaving(false);
  };

  const set = (key: keyof DetailForm, value: string | boolean) =>
    setForm(f => ({ ...f, [key]: value }));

  const section = (title: string, children: React.ReactNode) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{fullName(user)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Edit user profile &amp; view activity</p>
        </div>
        <Button className="ml-auto" onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      {/* Editable profile + role */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-lg p-4 bg-card space-y-4">
          {section('Profile', (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} onBlur={() => set('first_name', capitalize(form.first_name))} />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} onBlur={() => set('last_name', capitalize(form.last_name))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} onChange={e => set('email', e.target.value)} onBlur={() => set('email', form.email.toLowerCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => set('phone', e.target.value)} onBlur={() => set('phone', formatPhone(form.phone))} />
              </div>
              <div className="space-y-1.5">
                <Label>Post Code</Label>
                <Input value={form.post_code} onChange={e => set('post_code', e.target.value)} onBlur={() => set('post_code', formatPostCode(form.post_code))} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.is_active ? 'active' : 'inactive'} onValueChange={v => set('is_active', v === 'active')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>

        <div className="border rounded-lg p-4 bg-card space-y-4">
          {section('Role & Pay', (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => set('role', v)}>
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
                <Input type="number" step="0.50" min="0" value={form.rate} onChange={e => set('rate', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Member Since</Label>
                <p className="text-sm pt-1">{formatDate(user.created_at)}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Last Updated</Label>
                <p className="text-sm pt-1">{formatDate(user.updated_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Financial details */}
      <div className="border rounded-lg p-4 bg-card space-y-4">
        {section('Financial Details', (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Sort Code</Label>
              <Input value={form.sort_code} onChange={e => set('sort_code', e.target.value)} placeholder="00-00-00" />
            </div>
            <div className="space-y-1.5">
              <Label>Account Number</Label>
              <Input value={form.account_number} onChange={e => set('account_number', e.target.value)} placeholder="12345678" />
            </div>
            <div className="space-y-1.5">
              <Label>National Insurance</Label>
              <Input value={form.national_insurance_number} onChange={e => set('national_insurance_number', e.target.value)} onBlur={() => set('national_insurance_number', form.national_insurance_number.toUpperCase())} placeholder="AB 12 34 56 C" />
            </div>
            <div className="space-y-1.5">
              <Label>UTR Number</Label>
              <Input value={form.utr_number} onChange={e => set('utr_number', e.target.value)} placeholder="1234567890" />
            </div>
          </div>
        ))}
      </div>

      {/* Activity tables */}
      {loadingActivity ? (
        <div className="text-muted-foreground">Loading activity…</div>
      ) : (
        <>
          <div className="border rounded-lg p-4 bg-card space-y-3">
            {section(`Sign-offs (${signOffs.length})`, signOffs.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No sign-offs recorded</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Plot</TableHead>
                    <TableHead>Task Type</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signOffs.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>{s.site_name || '—'}</TableCell>
                      <TableCell>{s.plot_name || '—'}</TableCell>
                      <TableCell className="capitalize">{s.task_type}</TableCell>
                      <TableCell>{s.manager_name || '—'}</TableCell>
                      <TableCell>{formatDateTime(s.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ))}
          </div>

          <div className="border rounded-lg p-4 bg-card space-y-3">
            {section(`Hourly Agreements (${hourlyAgreements.length})`, hourlyAgreements.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No hourly agreements recorded</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Plot</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hourlyAgreements.map(h => (
                    <TableRow key={h.id}>
                      <TableCell>{h.site_name || '—'}</TableCell>
                      <TableCell>{h.plot_name || '—'}</TableCell>
                      <TableCell>{h.hours}</TableCell>
                      <TableCell>{formatCurrency(h.rate)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {h.descriptions?.join(', ') || '—'}
                      </TableCell>
                      <TableCell>{formatDateTime(h.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ))}
          </div>

          <div className="border rounded-lg p-4 bg-card space-y-3">
            {section(`Invoices (${invoices.length})`, invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No invoices recorded</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Badge variant={inv.status === 'draft' ? 'secondary' : 'default'} className="capitalize">
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(inv.total_amount)}</TableCell>
                      <TableCell>{formatDateTime(inv.submitted_at)}</TableCell>
                      <TableCell>{formatDateTime(inv.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
