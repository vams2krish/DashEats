import { useEffect, useRef } from 'react';
import L from 'leaflet';

const routeStart: L.LatLngExpression[] = [
  [37.78817, -122.40748],
  [37.78672, -122.4052],
  [37.78381, -122.40752],
  [37.78192, -122.41012],
  [37.77925, -122.40801],
];

export interface MapDestination {
  lat: number;
  lng: number;
  label: string;
  worldX?: number;
  worldZ?: number;
}

interface MiniMapProps {
  destination: MapDestination;
  onDestinationChange: (destination: MapDestination) => void;
  progress: number;
}

export default function MiniMap({ destination, onDestinationChange, progress }: MiniMapProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const destinationRef = useRef<L.CircleMarker | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const routeRef = useRef<L.LatLngExpression[]>([...routeStart, [destination.lat, destination.lng]]);
  const onDestinationChangeRef = useRef(onDestinationChange);

  useEffect(() => {
    onDestinationChangeRef.current = onDestinationChange;
  }, [onDestinationChange]);

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, {
      attributionControl: true,
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      keyboard: true,
    }).setView([37.7828, -122.4068], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    routeLayerRef.current = L.polyline(routeRef.current, { color: '#f3b51b', weight: 6, opacity: 0.95 }).addTo(map);
    L.circleMarker(routeStart[0], { radius: 6, color: '#fff', fillColor: '#f3b51b', fillOpacity: 1, weight: 2 }).addTo(map);
    destinationRef.current = L.circleMarker([destination.lat, destination.lng], {
      radius: 8,
      color: '#fff',
      fillColor: '#32cf8a',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);
    markerRef.current = L.circleMarker(routeStart[0], {
      radius: 8,
      color: '#10161a',
      fillColor: '#fff',
      fillOpacity: 1,
      weight: 3,
    }).addTo(map);
    map.fitBounds(L.latLngBounds(routeRef.current), { padding: [28, 28] });
    map.on('click', (event) => {
      onDestinationChangeRef.current({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        label: 'Pinned destination',
      });
    });
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 50);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    routeRef.current = [...routeStart, [destination.lat, destination.lng]];
    routeLayerRef.current?.setLatLngs(routeRef.current);
    destinationRef.current?.setLatLng([destination.lat, destination.lng]);
  }, [destination]);

  useEffect(() => {
    const route = routeRef.current;
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
