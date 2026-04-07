import { EntityPage, FieldConfig } from '@/components/EntityPage';

// plot_progress is a view: plot_id, plot_name, house_type, internal_price, external_price,
// plot_status, site_id, site_name, client_id, client_name. Read-only, no created_at, no `id`.
const fields: FieldConfig[] = [
  { key: 'plot_name', label: 'Plot' },
  { key: 'site_name', label: 'Site' },
  { key: 'client_name', label: 'Client' },
  { key: 'house_type', label: 'House Type' },
  { key: 'plot_status', label: 'Status', type: 'select', options: [
    { value: 'not_started', label: 'Not Started' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
  ]},
  { key: 'internal_price', label: 'Internal (£)', type: 'number' },
  { key: 'external_price', label: 'External (£)', type: 'number' },
];

export default function PlotProgress() {
  return (
    <EntityPage
      title="Plot Progress"
      table="plot_progress"
      fields={fields}
      readOnly
      orderBy={null}
      rowKey="plot_id"
      formatCell={(key, value) => {
        if (value == null || value === '') return '—';
        if (key === 'internal_price' || key === 'external_price') {
          return `£${Number(value).toFixed(2)}`;
        }
        return undefined;
      }}
    />
  );
}
