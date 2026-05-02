import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GpsPoint } from '../utils/gpsCalculations';

const FALLBACK: [number, number] = [28.6139, 77.209];

function FitRoute({ path }: { path: GpsPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (path.length > 1) {
      const bounds = L.latLngBounds(path.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [70, 70], animate: false });
    }
  }, []);
  return null;
}

export const RunRouteBackground: React.FC<{ path: GpsPoint[] }> = ({ path }) => {
  const center: [number, number] =
    path.length > 0
      ? [
          path.reduce((s, p) => s + p.lat, 0) / path.length,
          path.reduce((s, p) => s + p.lng, 0) / path.length,
        ]
      : FALLBACK;

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none"
      style={{ filter: 'blur(2px) brightness(0.28) saturate(0.45)', opacity: 0.95 }}
    >
      <style>{`
        .rrbg .leaflet-container { background: #0d0f14 !important; }
        .rrbg .leaflet-control-attribution,
        .rrbg .leaflet-control-zoom { display: none !important; }
      `}</style>
      <div className="rrbg h-full w-full">
        <MapContainer
          center={center}
          zoom={14}
          style={{ height: '100%', width: '100%', background: '#0d0f14' }}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          touchZoom={false}
          doubleClickZoom={false}
          keyboard={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution=""
            keepBuffer={4}
            updateWhenZooming={false}
          />
          {path.length > 1 && (
            <Polyline
              positions={path.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{ color: '#C8FF00', weight: 8, opacity: 1 }}
            />
          )}
          <FitRoute path={path} />
        </MapContainer>
      </div>
    </div>
  );
};
