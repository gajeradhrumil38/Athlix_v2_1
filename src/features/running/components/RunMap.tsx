import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GpsPoint } from '../utils/gpsCalculations';

// Fix Leaflet's broken default icon URLs when bundled with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const currentPositionIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:18px;height:18px;
    background:var(--accent,#C8FF00);
    border:3px solid #0d0f14;
    border-radius:50%;
    box-shadow:0 0 12px rgba(200,255,0,0.55);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function MapAutoCenter({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

interface RunMapProps {
  path: GpsPoint[];
  currentPosition: GpsPoint | null;
}

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209]; // fallback center

export const RunMap: React.FC<RunMapProps> = ({ path, currentPosition }) => {
  const center: [number, number] | null = currentPosition
    ? [currentPosition.lat, currentPosition.lng]
    : null;

  return (
    <div className="h-full w-full overflow-hidden">
      <MapContainer
        center={center ?? DEFAULT_CENTER}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />

        <MapAutoCenter center={center} />

        {path.length > 1 && (
          <Polyline
            positions={path.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#C8FF00', weight: 4, opacity: 0.9 }}
          />
        )}

        {currentPosition && (
          <Marker
            position={[currentPosition.lat, currentPosition.lng]}
            icon={currentPositionIcon}
          />
        )}
      </MapContainer>
    </div>
  );
};
