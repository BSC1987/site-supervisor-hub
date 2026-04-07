import { EntityPage, FieldConfig } from '@/components/EntityPage';

// invoices columns: id, user_id, status, total_amount, submitted_at, notes, created_at, updated_at
const fields: FieldConfig[] = [
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'paid', label: 'Paid' },
  ]},
  { key: 'total_amount', label: 'Total (£)', type: 'number' },
  { key: 'submitted_at', label: 'Submitted At' },
  { key: 'created_at', label: 'Created At' },
  { key: 'notes', label: 'Notes' },
];

export default function Invoices() {
  return (
    <EntityPage
      title="Invoices"
      table="invoices"
      fields={fields}
      readOnly
      formatCell={(key, value) => {
        if (value == null || value === '') return '—';
        if (key === 'total_amount') return `£${Number(value).toFixed(2)}`;
        if (key === 'submitted_at' || key === 'created_at') {
          const d = new Date(value);
          return isNaN(d.getTime()) ? value : d.toLocaleString();
        }
        return undefined;
      }}
    />
  );
}
