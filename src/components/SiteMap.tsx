import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { Loader2 } from 'lucide-react';

// Fix default marker icons (Leaflet + bundlers issue)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface SiteLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

type SiteRow = { id: string; name: string; latitude: number | null; longitude: number | null };

export default function SiteMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const { data, loading } = useSupabaseQuery<SiteRow[]>(
    () =>
      supabase
        .from('sites')
        .select('id, name, latitude, longitude')
        .eq('is_archived', false)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null),
    [],
  );

  const sites = useMemo<SiteLocation[]>(
    () =>
      (data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.latitude as number,
        lng: s.longitude as number,
      })),
    [data],
  );

  useEffect(() => {
    if (loading || sites.length === 0 || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      dragging: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    for (const site of sites) {
      L.marker([site.lat, site.lng]).addTo(map);
    }

    const bounds = L.latLngBounds(sites.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { paddingTopLeft: [10, 35], paddingBottomRight: [10, 5] });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [loading, sites]);

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
      <div className="h-[400px] w-full">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
