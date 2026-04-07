import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { EntityPage, Breadcrumbs, FieldConfig } from '@/components/EntityPage';
import { PlotTasks } from '@/components/PlotTasks';

const developerFields: FieldConfig[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'reg_number', label: 'Reg Number' },
  { key: 'address_1', label: 'Address', required: true },
  { key: 'city', label: 'City', required: true },
  { key: 'county', label: 'County', required: true },
  { key: 'post_code', label: 'Post Code', required: true },
  { key: 'website', label: 'Website' },
  { key: 'logo_url', label: 'Logo', type: 'image' },
];

const siteFields: FieldConfig[] = [
  { key: 'name', label: 'Site Name', required: true },
  { key: 'developer_id', label: 'Developer', type: 'select', foreignTable: 'developers', foreignLabel: 'name' },
  { key: 'address', label: 'Address' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'complete', label: 'Complete' },
  ]},
];

const plotFields: FieldConfig[] = [
  { key: 'plot_name', label: 'Plot Name', required: true },
  { key: 'site_id', label: 'Site', type: 'select', foreignTable: 'sites', foreignLabel: 'name' },
  { key: 'house_type', label: 'House Type' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'not_started', label: 'Not Started' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
  ]},
];

interface DrillState {
  developer?: { id: string; name: string };
  site?: { id: string; name: string };
  plot?: { id: string; name: string };
}

export default function Developers() {
  const [drill, setDrill] = useState<DrillState>({});

  // Level 4: Plot Tasks
  if (drill.developer && drill.site && drill.plot) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrill({ developer: drill.developer, site: drill.site })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <Breadcrumbs items={[
              { label: 'Developers', onClick: () => setDrill({}) },
              { label: drill.developer.name, onClick: () => setDrill({ developer: drill.developer }) },
              { label: drill.site.name, onClick: () => setDrill({ developer: drill.developer, site: drill.site }) },
              { label: drill.plot.name },
            ]} />
            <h1 className="text-2xl font-semibold">{drill.plot.name}</h1>
          </div>
        </div>
        <PlotTasks plotId={drill.plot.id} />
      </div>
    );
  }

  // Level 3: Plots for a site
  if (drill.developer && drill.site) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setDrill({ developer: drill.developer })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <Breadcrumbs items={[
              { label: 'Developers', onClick: () => setDrill({}) },
              { label: drill.developer.name, onClick: () => setDrill({ developer: drill.developer }) },
              { label: drill.site.name },
            ]} />
            <h1 className="text-2xl font-semibold">{drill.site.name} – Plots</h1>
          </div>
        </div>
        <EntityPage
          variant="section"
          title="Plots"
          table="plots"
          fields={plotFields}
          defaultValues={{ status: 'not_started' }}
          parentFilter={{ column: 'site_id', value: drill.site.id }}
          onRowClick={(row) =>
            setDrill({
              developer: drill.developer,
              site: drill.site,
              plot: { id: row.id, name: row.plot_name },
            })
          }
        />
      </div>
    );
  }

  // Level 2: Sites for a developer
  if (drill.developer) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setDrill({})}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <Breadcrumbs items={[
              { label: 'Developers', onClick: () => setDrill({}) },
              { label: drill.developer.name },
            ]} />
            <h1 className="text-2xl font-semibold">{drill.developer.name} – Sites</h1>
          </div>
        </div>
        <EntityPage
          variant="section"
          title="Sites"
          table="sites"
          fields={siteFields}
          defaultValues={{ status: 'active' }}
          parentFilter={{ column: 'developer_id', value: drill.developer.id }}
          onRowClick={(row) =>
            setDrill({
              developer: drill.developer,
              site: { id: row.id, name: row.name },
            })
          }
        />
      </div>
    );
  }

  // Level 1: Developers
  return (
    <EntityPage
      title="Developers"
      table="developers"
      fields={developerFields}
      onRowClick={(row) => setDrill({ developer: { id: row.id, name: row.name } })}
    />
  );
}
