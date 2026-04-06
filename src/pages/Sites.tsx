import { EntityPage, FieldConfig } from '@/components/EntityPage';

const fields: FieldConfig[] = [
  { key: 'name', label: 'Site Name', required: true },
  { key: 'client_id', label: 'Client', type: 'select', foreignTable: 'clients', foreignLabel: 'company_name' },
  { key: 'address', label: 'Address' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'complete', label: 'Complete' },
  ]},
];

export default function Sites() {
  return <EntityPage title="Sites" table="sites" fields={fields} defaultValues={{ status: 'active' }} />;
}
