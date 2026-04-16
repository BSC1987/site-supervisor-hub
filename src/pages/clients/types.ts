import type { FieldConfig } from '@/components/EntityPage';

export { SUPABASE_URL } from '@/lib/supabase';

export interface DrillState {
  developer?: { id: string; name: string };
  site?: { id: string; name: string };
}

export interface DeveloperRow {
  id: string;
  name: string;
  is_archived: boolean;
  logo_url?: string | null;
  site_count: number;
  unit_count: number;
  [key: string]: unknown;
}

export interface SiteRow {
  id: string;
  name: string;
  is_archived: boolean;
  status?: string | null;
  plot_count: number;
  [key: string]: unknown;
}

export const developerFields: FieldConfig[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'reg_number', label: 'Reg Number' },
  { key: 'address_1', label: 'Address', required: true },
  { key: 'city', label: 'City', required: true },
  { key: 'county', label: 'County', required: true },
  { key: 'post_code', label: 'Post Code', required: true },
  { key: 'website', label: 'Website' },
  { key: 'logo_url', label: 'Logo', type: 'image' },
];

export const siteFields: FieldConfig[] = [
  { key: 'name', label: 'Site Name', required: true },
  { key: 'developer_id', label: 'Developer', type: 'select', foreignTable: 'developers', foreignLabel: 'name' },
  { key: 'address', label: 'Address', required: true },
  { key: 'grid_reference', label: 'Grid Reference' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'site_plans', label: 'Site Plans', type: 'file', bucket: 'site-plans' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]},
];
