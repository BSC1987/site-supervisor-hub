import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Plus, Pencil, Trash2, Search, ChevronRight, ArrowLeft, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

const SUPABASE_URL = 'https://xhqornncpcgewlbzutsd.supabase.co';

/* ───── tiny generic CRUD table (inlined to keep things self-contained) ───── */

interface Field {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'select' | 'image';
  options?: { value: string; label: string }[];
  required?: boolean;
  foreignTable?: string;
  foreignLabel?: string;
}

function CrudTable({
  title,
  table,
  fields,
  defaultValues = {},
  onRowClick,
  parentFilter,
}: {
  title: string;
  table: string;
  fields: Field[];
  defaultValues?: Record<string, any>;
  onRowClick?: (row: any) => void;
  parentFilter?: { column: string; value: string };
}) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [foreignData, setForeignData] = useState<Record<string, any[]>>({});

  useEffect(() => {
    fields.filter(f => f.foreignTable).forEach(async f => {
      const { data } = await supabase.from(f.foreignTable!).select('*');
      if (data) setForeignData(prev => ({ ...prev, [f.key]: data }));
    });
  }, [fields]);

  const fetchData = async () => {
    setLoading(true);
    let q = supabase.from(table).select('*').order('created_at', { ascending: false });
    if (parentFilter) q = q.eq(parentFilter.column, parentFilter.value);
    const { data, error } = await q;
    if (error) toast.error('Failed to load: ' + error.message);
    else setData(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [table, parentFilter?.value]);

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
      const { error } = await supabase.from(table).update(formData).eq('id', editingRecord.id);
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
    const { error } = await supabase.from(table).delete().eq('id', deleteId);
    if (error) toast.error('Delete failed: ' + error.message);
    else { toast.success('Deleted'); fetchData(); }
    setDeleteId(null);
  };

  const getForeignLabel = (field: Field, value: any) => {
    if (!field.foreignTable || !foreignData[field.key]) return value;
    const record = foreignData[field.key].find((r: any) => r.id === value);
    return record ? record[field.foreignLabel || 'name'] : value;
  };

  const renderField = (field: Field) => {
    // hide parent filter field in form
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

  // visible fields (hide parent FK column from table)
  const visibleFields = parentFilter ? fields.filter(f => f.key !== parentFilter.column) : fields;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add</Button>
      </div>

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

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {visibleFields.map(f => <TableHead key={f.key}>{f.label}</TableHead>)}
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={visibleFields.length + 1} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow><TableCell colSpan={visibleFields.length + 1} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow>
            ) : (
              filteredData.map(row => (
                <TableRow
                  key={row.id}
                  className={onRowClick ? 'hover:bg-muted/30 cursor-pointer' : 'hover:bg-muted/30'}
                  onClick={() => onRowClick?.(row)}
                >
                  {visibleFields.map(f => (
                    <TableCell key={f.key}>
                      {f.type === 'select' && f.options
                        ? <Badge variant={row[f.key] === 'active' || row[f.key] === 'complete' ? 'default' : 'secondary'}>
                            {f.options.find(o => o.value === row[f.key])?.label ?? row[f.key]}
                          </Badge>
                        : f.foreignTable ? getForeignLabel(f, row[f.key])
                        : f.type === 'number' && f.key === 'price' ? `£${Number(row[f.key]).toFixed(2)}`
                        : row[f.key]}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      {onRowClick && <ChevronRight className="h-4 w-4 text-muted-foreground mt-2" />}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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

/* ───── Breadcrumb trail ───── */

interface Breadcrumb {
  label: string;
  onClick?: () => void;
}

function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
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

/* ───── Field configs ───── */

const developerFields: Field[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'official_reg_number', label: 'Official Reg Number' },
  { key: 'street_address', label: 'Street Address', required: true },
  { key: 'city', label: 'City', required: true },
  { key: 'county', label: 'County', required: true },
  { key: 'post_code', label: 'Post Code', required: true },
  { key: 'website', label: 'Website' },
];

const siteFields: Field[] = [
  { key: 'name', label: 'Site Name', required: true },
  { key: 'developer_id', label: 'Developer', type: 'select', foreignTable: 'developers', foreignLabel: 'name' },
  { key: 'address', label: 'Address' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'complete', label: 'Complete' },
  ]},
];

const plotFields: Field[] = [
  { key: 'plot_number', label: 'Plot Number', required: true },
  { key: 'site_id', label: 'Site', type: 'select', foreignTable: 'sites', foreignLabel: 'name' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'not_started', label: 'Not Started' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
  ]},
];

/* ───── Main page with drill-down ───── */

interface DrillState {
  developer?: { id: string; name: string };
  site?: { id: string; name: string };
}

export default function Developers() {
  const [drill, setDrill] = useState<DrillState>({});

  // Level 3: Plots for a site
  if (drill.developer && drill.site) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setDrill({ developer: drill.developer })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <Breadcrumbs items={[
              { label: 'Developers', onClick: () => setDrill({}) },
              { label: drill.developer.name, onClick: () => setDrill({ developer: drill.developer }) },
              { label: drill.site.name },
            ]} />
            <h1 className="text-2xl font-semibold">{drill.site.name} – Plots</h1>
          </div>
        </div>
        <CrudTable
          title="Plots"
          table="plots"
          fields={plotFields}
          defaultValues={{ status: 'not_started' }}
          parentFilter={{ column: 'site_id', value: drill.site.id }}
        />
      </div>
    );
  }

  // Level 2: Sites for a client
  if (drill.developer) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setDrill({})}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <Breadcrumbs items={[
              { label: 'Developers', onClick: () => setDrill({}) },
              { label: drill.developer.name },
            ]} />
            <h1 className="text-2xl font-semibold">{drill.developer.name} – Sites</h1>
          </div>
        </div>
        <CrudTable
          title="Sites"
          table="sites"
          fields={siteFields}
          defaultValues={{ status: 'active' }}
          parentFilter={{ column: 'developer_id', value: drill.developer.id }}
          onRowClick={(row) => setDrill({ developer: drill.developer, site: { id: row.id, name: row.name } })}
        />
      </div>
    );
  }

  // Level 1: Developers
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Developers</h1>
      <CrudTable
        title="Developers"
        table="developers"
        fields={developerFields}
        onRowClick={(row) => setDrill({ developer: { id: row.id, name: row.name } })}
      />
    </div>
  );
}
