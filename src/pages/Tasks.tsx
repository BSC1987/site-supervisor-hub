import { EntityPage, FieldConfig } from '@/components/EntityPage';

const fields: FieldConfig[] = [
  { key: 'name', label: 'Task Name', required: true },
  { key: 'price', label: 'Price (£)', type: 'number', required: true },
];

export default function Tasks() {
  return <EntityPage title="Tasks" table="tasks" fields={fields} />;
}
