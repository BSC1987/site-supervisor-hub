import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  address: string | null;
  developer_name: string | null;
  lat: number;
  lng: number;
}

const UK_CENTER: [number, number] = [53.5, -2.5];
const DEFAULT_ZOOM = 6;

function FitBounds({ sites }: { sites: SiteLocation[] }) {
  const map = useMap();
  useEffect(() => {
    if (sites.length === 0) return;
    const bounds = L.latLngBounds(sites.map((s) => [s.lat, s.lng]));
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, sites]);
  return null;
}

function ToggleInteractions({ interactive }: { interactive: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (interactive) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      if (map.zoomControl) map.zoomControl.getContainer()!.style.display = '';
    } else {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      if (map.zoomControl) map.zoomControl.getContainer()!.style.display = 'none';
    }
  }, [map, interactive]);
  return null;
}

export default function SiteMapInner({
  sites,
  interactive = true,
}: {
  sites: SiteLocation[];
  interactive?: boolean;
}) {
  return (
    <MapContainer
      center={UK_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds sites={sites} />
      <ToggleInteractions interactive={interactive} />
      {sites.map((site) => (
        <Marker key={site.id} position={[site.lat, site.lng]}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{site.name}</p>
              {site.developer_name && (
                <p className="text-gray-600">{site.developer_name}</p>
              )}
              {site.address && (
                <p className="text-gray-500 text-xs mt-1">{site.address}</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
