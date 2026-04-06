import { EntityPage, FieldConfig } from '@/components/EntityPage';

const fields: FieldConfig[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]},
];

export default function Decorators() {
  return <EntityPage title="Decorators" table="decorators" fields={fields} defaultValues={{ status: 'active' }} />;
}
