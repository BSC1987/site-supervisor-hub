import { EntityPage, FieldConfig } from '@/components/EntityPage';

const fields: FieldConfig[] = [
  { key: 'company_name', label: 'Company Name', required: true },
  { key: 'contact_name', label: 'Contact Name' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
];

export default function Clients() {
  return <EntityPage title="Clients" table="clients" fields={fields} />;
}
