import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Plus, Pencil, Trash2, Search, ChevronRight, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL = 'https://xhqornncpcgewlbzutsd.supabase.co';

export interface FieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'select' | 'image';
  options?: { value: string; label: string }[];
  required?: boolean;
  /** For select fields that reference another table */
  foreignTable?: string;
  foreignLabel?: string;
  /** Width class for the column header */
  width?: string;
}

interface EntityPageProps {
  title: string;
  table: string;
  fields: FieldConfig[];
  defaultValues?: Record<string, any>;
  /** Scope rows to a parent FK (e.g. sites under a developer). The FK column is hidden from table/form. */
  parentFilter?: { column: string; value: string };
  /** Make rows clickable for drill-down navigation */
  onRowClick?: (row: any) => void;
  /** Override default cell rendering. Return undefined to fall back to defaults. */
  formatCell?: (key: string, value: any, row: any) => React.ReactNode | undefined;
  /**
   * 'page' renders an h1 header (full page). 'section' renders an h2 (nested inside a page
   * that owns its own h1, e.g. drill-down wrapper).
   */
  variant?: 'page' | 'section';
  /** Hide Add / Edit / Delete actions and the create/edit dialog. Useful for views. */
  readOnly?: boolean;
  /** Column to order rows by. Pass null to skip ordering (e.g. for views without created_at). */
  orderBy?: string | null;
  /** Row key when rows have no `id` column (e.g. database views). Defaults to 'id'. */
  rowKey?: string;
}

export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {item.onClick ? (
            <button onClick={item.onClick} className="hover:text-foreground underline-offset-4 hover:underline">
              {item.label}
            </button>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function EntityPage({
  title,
  table,
  fields,
  defaultValues = {},
  parentFilter,
  onRowClick,
  formatCell,
  variant = 'page',
  readOnly = false,
  orderBy = 'created_at',
  rowKey = 'id',
}: EntityPageProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterField, setFilterField] = useState<string>('');
  const [filterValue, setFilterValue] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [foreignData, setForeignData] = useState<Record<string, any[]>>({});

  // Load foreign table data for select fields
  useEffect(() => {
    fields.filter(f => f.foreignTable).forEach(async f => {
      const { data } = await supabase.from(f.foreignTable!).select('*');
      if (data) setForeignData(prev => ({ ...prev, [f.key]: data }));
    });
  }, [fields]);

  const fetchData = async () => {
    setLoading(true);
    let q = supabase.from(table).select('*');
    if (orderBy) q = q.order(orderBy, { ascending: false });
    if (parentFilter) q = q.eq(parentFilter.column, parentFilter.value);
    const { data, error } = await q;
    if (error) toast.error('Failed to load: ' + error.message);
    else setData(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [table, parentFilter?.column, parentFilter?.value, orderBy]);

  const filteredData = useMemo(() => {
    let result = data;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(row => fields.some(f => String(row[f.key] ?? '').toLowerCase().includes(q)));
    }
    if (filterField && filterValue) {
      result = result.filter(row => String(row[filterField]) === filterValue);
    }
    return result;
  }, [data, search, filterField, filterValue, fields]);

  const selectFields = fields.filter(f => f.type === 'select' && f.options);

  // Hide parent FK column from table display and form inputs
  const visibleFields = parentFilter ? fields.filter(f => f.key !== parentFilter.column) : fields;

  const openCreate = () => {
    setEditingRecord(null);
    const defaults = { ...defaultValues };
    if (parentFilter) defaults[parentFilter.column] = parentFilter.value;
    setFormData(defaults);
    setDialogOpen(true);
  };

  const openEdit = (record: any) => {
    setEditingRecord(record);
    const fd: Record<string, any> = {};
    fields.forEach(f => { fd[f.key] = record[f.key] ?? ''; });
    if (parentFilter) fd[parentFilter.column] = parentFilter.value;
    setFormData(fd);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    if (editingRecord) {
      const { error } = await supabase.from(table).update(formData).eq(rowKey, editingRecord[rowKey]);
      if (error) toast.error('Update failed: ' + error.message);
      else { toast.success('Updated'); setDialogOpen(false); fetchData(); }
    } else {
      const { error } = await supabase.from(table).insert(formData);
      if (error) toast.error('Create failed: ' + error.message);
      else { toast.success('Created'); setDialogOpen(false); fetchData(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from(table).delete().eq(rowKey, deleteId);
    if (error) toast.error('Delete failed: ' + error.message);
    else { toast.success('Deleted'); fetchData(); }
    setDeleteId(null);
  };

  const getForeignLabel = (field: FieldConfig, value: any) => {
    if (!field.foreignTable || !foreignData[field.key]) return value;
    const record = foreignData[field.key].find((r: any) => r.id === value);
    return record ? record[field.foreignLabel || 'name'] : value;
  };

  const renderField = (field: FieldConfig) => {
    // Hide the parent FK field from the form
    if (parentFilter && field.key === parentFilter.column) return null;

    if (field.type === 'image') {
      const currentUrl = formData[field.key];
      const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const ext = file.name.split('.').pop();
        const path = `${table}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
        if (error) { toast.error('Upload failed: ' + error.message); return; }
        const url = `${SUPABASE_URL}/storage/v1/object/public/logos/${path}`;
        setFormData(p => ({ ...p, [field.key]: url }));
        toast.success('Logo uploaded');
      };
      return (
        <div className="space-y-2">
          {currentUrl && (
            <div className="relative inline-block">
              <img src={currentUrl} alt="Logo" className="h-16 w-auto rounded border object-contain bg-white p-1" />
              <button
                type="button"
                onClick={() => setFormData(p => ({ ...p, [field.key]: '' }))}
                className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground h-5 w-5 flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground border rounded-md px-3 py-2 w-fit">
            <Upload className="h-4 w-4" />
            {currentUrl ? 'Change logo' : 'Upload logo'}
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
        </div>
      );
    }

    if (field.type === 'select' && field.foreignTable) {
      const items = foreignData[field.key] || [];
      return (
        <Select value={formData[field.key] || ''} onValueChange={v => setFormData(p => ({ ...p, [field.key]: v }))}>
          <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
          <SelectContent>
            {items.map((item: any) => (
              <SelectItem key={item.id} value={item.id}>{item[field.foreignLabel || 'name']}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === 'select' && field.options) {
      return (
        <Select value={formData[field.key] || ''} onValueChange={v => setFormData(p => ({ ...p, [field.key]: v }))}>
          <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
          <SelectContent>
            {field.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={field.type || 'text'}
        value={formData[field.key] || ''}
        onChange={e => setFormData(p => ({ ...p, [field.key]: field.type === 'number' ? parseFloat(e.target.value) || '' : e.target.value }))}
        required={field.required}
      />
    );
  };

  const renderCell = (f: FieldConfig, row: any) => {
    if (formatCell) {
      const custom = formatCell(f.key, row[f.key], row);
      if (custom !== undefined) return custom;
    }
    const v = row[f.key];
    if (f.type === 'image') {
      return v ? <img src={v} alt="" className="h-8 w-auto object-contain" /> : null;
    }
    if (f.type === 'select' && f.options) {
      const label = f.options.find(o => o.value === v)?.label ?? v;
      return <Badge variant={v === 'active' || v === 'complete' ? 'default' : 'secondary'}>{label}</Badge>;
    }
    if (f.foreignTable) return getForeignLabel(f, v);
    if (f.type === 'number' && f.key === 'price') return `£${Number(v).toFixed(2)}`;
    return v;
  };

  const showActionsColumn = !readOnly || !!onRowClick;
  const Heading = variant === 'page' ? 'h1' : 'h2';
  const headingClass = variant === 'page' ? 'text-2xl font-semibold' : 'text-lg font-semibold';
  const addButtonSize = variant === 'page' ? 'default' : 'sm';
  const addButtonLabel = variant === 'page' ? `Add ${title.replace(/s$/, '')}` : 'Add';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Heading className={headingClass}>{title}</Heading>
        {!readOnly && (
          <Button size={addButtonSize as any} onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />{addButtonLabel}
          </Button>
        )}
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {selectFields.map(f => (
          <Select key={f.key} value={filterField === f.key ? filterValue : ''} onValueChange={v => { setFilterField(f.key); setFilterValue(v === '__all__' ? '' : v); if (v === '__all__') setFilterField(''); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder={f.label} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {f.options?.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {visibleFields.map(f => (
                <TableHead key={f.key} className={f.width}>{f.label}</TableHead>
              ))}
              {showActionsColumn && <TableHead className="w-[100px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={visibleFields.length + (showActionsColumn ? 1 : 0)} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow><TableCell colSpan={visibleFields.length + (showActionsColumn ? 1 : 0)} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow>
            ) : (
              filteredData.map((row, idx) => (
                <TableRow
                  key={row[rowKey] ?? idx}
                  className={onRowClick ? 'hover:bg-muted/30 cursor-pointer' : 'hover:bg-muted/30'}
                  onClick={() => onRowClick?.(row)}
                >
                  {visibleFields.map(f => (
                    <TableCell key={f.key}>{renderCell(f, row)}</TableCell>
                  ))}
                  {showActionsColumn && (
                    <TableCell>
                      <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
                        {!readOnly && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(row[rowKey])}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </>
                        )}
                        {onRowClick && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Edit' : 'Create'} {title.replace(/s$/, '')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {fields.map(f => {
              const el = renderField(f);
              if (!el) return null;
              return <div key={f.key} className="space-y-1.5"><Label>{f.label}</Label>{el}</div>;
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} />
    </div>
  );
}
