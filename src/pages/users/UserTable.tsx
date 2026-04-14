import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  STAFF_NOTIFICATION_FIELDS,
  ROLES,
  type UserRow,
  type SortKey,
  type SortDir,
} from './types';
import { capitalize, formatCurrency, fullName } from './utils';

export function UserTable({ label, users, onSelect, onUpdate, onDelete, onToggleNotification }: {
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
