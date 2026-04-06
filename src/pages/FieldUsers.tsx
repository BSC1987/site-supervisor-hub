import { EntityPage, FieldConfig } from '@/components/EntityPage';

const fields: FieldConfig[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'role', label: 'Role', type: 'select', options: [
    { value: 'decorator', label: 'Decorator' },
    { value: 'supervisor', label: 'Supervisor' },
  ]},
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]},
];

export default function FieldUsers() {
  return <EntityPage title="Field Users" table="field_users" fields={fields} defaultValues={{ status: 'active' }} />;
}
