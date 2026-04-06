import { EntityPage, FieldConfig } from '@/components/EntityPage';

const fields: FieldConfig[] = [
  { key: 'plot_number', label: 'Plot Number', required: true },
  { key: 'site_id', label: 'Site', type: 'select', foreignTable: 'sites', foreignLabel: 'name' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'not_started', label: 'Not Started' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
  ]},
];

export default function Plots() {
  return <EntityPage title="Plots" table="plots" fields={fields} defaultValues={{ status: 'not_started' }} />;
}
