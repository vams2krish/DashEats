import { useEffect, useRef } from 'react';
import L from 'leaflet';

const route: L.LatLngExpression[] = [
  [37.78817, -122.40748],
  [37.78672, -122.4052],
  [37.78381, -122.40752],
  [37.78192, -122.41012],
  [37.77925, -122.40801],
  [37.7771, -122.40574],
];

interface MiniMapProps {
  progress: number;
}

export default function MiniMap({ progress }: MiniMapProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, {
      attributionControl: true,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      keyboard: false,
    }).setView([37.7828, -122.4068], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    L.polyline(route, { color: '#f3b51b', weight: 6, opacity: 0.95 }).addTo(map);
    L.circleMarker(route[0], { radius: 6, color: '#fff', fillColor: '#f3b51b', fillOpacity: 1, weight: 2 }).addTo(map);
    L.circleMarker(route[route.length - 1], { radius: 7, color: '#fff', fillColor: '#32cf8a', fillOpacity: 1, weight: 2 }).addTo(map);
    markerRef.current = L.circleMarker(route[0], {
      radius: 8,
      color: '#10161a',
      fillColor: '#ffffff',
      fillOpacity: 1,
      weight: 3,
    }).addTo(map);
    map.fitBounds(L.latLngBounds(route), { padding: [28, 28] });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const normalized = Math.min(0.999, Math.max(0, progress / 100));
    const scaled = normalized * (route.length - 1);
    const index = Math.floor(scaled);
    const fraction = scaled - index;
    const a = L.latLng(route[index]);
    const b = L.latLng(route[Math.min(index + 1, route.length - 1)]);
    markerRef.current?.setLatLng([a.lat + (b.lat - a.lat) * fraction, a.lng + (b.lng - a.lng) * fraction]);
  }, [progress]);

  return <div className="mini-map" data-testid="mini-map" ref={elementRef} />;
}
