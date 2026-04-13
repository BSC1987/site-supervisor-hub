import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Building2, MapPin, Home, Users, HardHat, Paintbrush,
  Contact, PoundSterling, Warehouse, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import ActivityFeed from '@/components/ActivityFeed';
import SiteMap from '@/components/SiteMap';

interface Stats {
  active_developers: number;
  active_sites: number;
  inactive_site_status: number;
  total_units: number;
  decorators: number;
  staff: number;
  active_users: number;
  inactive_users: number;
  contacts: number;
  sites_with_internals: number;
  sites_with_externals: number;
  sites_with_garages: number;
  total_value: number;
  priced_tasks: number;
  unpriced_tasks: number;
  top_developers: { name: string; sites: number; units: number }[];
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  colour = 'text-primary',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  colour?: string;
}) {
  return (
    <div className="border rounded-lg bg-card p-4 flex items-start gap-4">
      <div className={`rounded-md bg-accent p-2.5 ${colour}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_dashboard_stats');
      if (error) {
        toast.error('Failed to load dashboard: ' + error.message);
        setLoading(false);
        return;
      }
      setStats(data as Stats);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-muted-foreground">Loading dashboard…</div>;
  if (!stats) return null;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Business overview</p>
      </div>

      {/* Row 1: Core counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Developers"
          value={stats.active_developers}
          colour="text-blue-500"
        />
        <StatCard
          icon={MapPin}
          label="Active Sites"
          value={stats.active_sites}
          sub={stats.inactive_site_status > 0 ? `${stats.inactive_site_status} inactive` : undefined}
          colour="text-green-500"
        />
        <StatCard
          icon={Home}
          label="Total Units"
          value={Number(stats.total_units).toLocaleString()}
          colour="text-orange-500"
        />
        <StatCard
          icon={PoundSterling}
          label="Total Value"
          value={formatCurrency(Number(stats.total_value))}
          sub={`${Number(stats.priced_tasks).toLocaleString()} priced / ${Number(stats.unpriced_tasks).toLocaleString()} unpriced`}
          colour="text-emerald-500"
        />
      </div>

      {/* Row 2: People */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Paintbrush}
          label="Decorators"
          value={stats.decorators}
          colour="text-purple-500"
        />
        <StatCard
          icon={HardHat}
          label="Staff"
          value={stats.staff}
          colour="text-yellow-500"
        />
        <StatCard
          icon={Users}
          label="Users"
          value={stats.active_users}
          sub={stats.inactive_users > 0 ? `${stats.inactive_users} inactive` : undefined}
          colour="text-sky-500"
        />
        <StatCard
          icon={Contact}
          label="Developer Contacts"
          value={stats.contacts}
          colour="text-pink-500"
        />
      </div>

      {/* Row 3: Site coverage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={ClipboardList}
          label="Sites with Internals"
          value={stats.sites_with_internals}
          sub={`of ${stats.active_sites} sites`}
          colour="text-blue-400"
        />
        <StatCard
          icon={Warehouse}
          label="Sites with Garages"
          value={stats.sites_with_garages}
          sub={`of ${stats.active_sites} sites`}
          colour="text-amber-500"
        />
        <StatCard
          icon={Paintbrush}
          label="Sites with Externals"
          value={stats.sites_with_externals}
          sub={`of ${stats.active_sites} sites`}
          colour="text-teal-500"
        />
      </div>

      {/* Row 4: Site map */}
      <SiteMap />

      {/* Row 5: Top developers */}
      {stats.top_developers.length > 0 && (
        <div className="border rounded-lg bg-card">
          <div className="px-5 py-3 border-b border-border/60">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Top Developers by Units
            </h2>
          </div>
          <div className="divide-y divide-border">
            {stats.top_developers.map((d, i) => (
              <div key={d.name} className="flex items-center gap-4 px-5 py-3">
                <span className="text-lg font-bold text-muted-foreground w-6 text-right">{i + 1}</span>
                <div className="flex-1">
                  <span className="font-medium">{d.name}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {d.sites} site{d.sites !== 1 ? 's' : ''}
                </div>
                <div className="text-sm font-semibold w-20 text-right">
                  {d.units} units
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 6: Activity feed */}
      <ActivityFeed />
    </div>
  );
}
