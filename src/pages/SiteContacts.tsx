import { EntityPage, FieldConfig } from '@/components/EntityPage';

const fields: FieldConfig[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'job_title', label: 'Job Title' },
  { key: 'site_id', label: 'Site', type: 'select', foreignTable: 'sites', foreignLabel: 'name' },
];

export default function SiteContacts() {
  return <EntityPage title="Site Contacts" table="site_contacts" fields={fields} />;
}
