import { useEffect, useState, Component, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, MousePointerClick } from 'lucide-react';

const SiteMapInner = lazy(() => import('./SiteMapInner'));

interface SiteLocation {
  id: string;
  name: string;
  address: string | null;
  developer_name: string | null;
  lat: number;
  lng: number;
}

class MapErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
          Map failed to load
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SiteMap() {
  const [sites, setSites] = useState<SiteLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, name, address, latitude, longitude, developer:developers(name)')
        .eq('is_archived', false)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error || !data) {
        console.error('SiteMap: failed to fetch sites', error);
        setLoading(false);
        return;
      }

      setSites(
        data.map((site) => ({
          id: site.id,
          name: site.name,
          address: site.address,
          developer_name: (site.developer as { name: string } | null)?.name ?? null,
          lat: site.latitude as number,
          lng: site.longitude as number,
        }))
      );
      setLoading(false);
    })();
  }, []);

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Site Locations
        </h2>
        {loading ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading sites…
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {sites.length} site{sites.length !== 1 ? 's' : ''} mapped
          </span>
        )}
      </div>
      <div className="h-[400px] w-full relative">
        <MapErrorBoundary>
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading map…
              </div>
            }
          >
            <SiteMapInner sites={sites} interactive={interactive} />
          </Suspense>
        </MapErrorBoundary>

        {/* Click-to-interact overlay */}
        {!interactive && !loading && (
          <button
            type="button"
            className="absolute inset-0 z-[1000] cursor-pointer group"
            onClick={() => setInteractive(true)}
          >
            <div className="h-full w-full bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 text-foreground text-sm font-medium px-4 py-2 rounded-lg shadow flex items-center gap-2">
                <MousePointerClick className="h-4 w-4" />
                Click to interact
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
