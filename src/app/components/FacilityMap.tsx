'use client';

import { useEffect, useRef, useState } from 'react';
import type { Facility } from '@/types';
import type { Country } from '@/constants';

interface FacilityMapProps {
  country: Country;
  onSelectFacility: (f: Facility) => void;
  selectedFacilityId: string | null;
  facilitySeverity?: Record<string, 'low' | 'medium' | 'high' | 'surge'>;
}

const COUNTRY_CENTERS: Record<Country, [number, number]> = {
  india: [26.5, 80.5],
  brazil: [-14.0, -51.0],
  south_africa: [-30.5, 25.0],
};

const SEVERITY_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  surge: '#dc2626',
};

export default function FacilityMap({ country, onSelectFacility, selectedFacilityId, facilitySeverity }: FacilityMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [L, setL] = useState<typeof import('leaflet') | null>(null);

  // Load leaflet dynamically (client only)
  useEffect(() => {
    import('leaflet').then((mod) => setL(mod.default || mod));
  }, []);

  // Fetch facilities when country changes
  useEffect(() => {
    fetch(`/api/facilities?country=${country}`)
      .then((r) => r.json())
      .then((data: Facility[]) => setFacilities(data))
      .catch(() => setFacilities([]));
  }, [country]);

  // Initialize / update map
  useEffect(() => {
    if (!L || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
      }).addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;
    const center = COUNTRY_CENTERS[country];
    map.setView(center, country === 'india' ? 6 : 5);

    // Clear old markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    // Add new markers
    facilities.forEach((f) => {
      const severity = facilitySeverity?.[f.id] || 'low';
      const color = SEVERITY_COLORS[severity];
      const isSelected = f.id === selectedFacilityId;

      const marker = L.circleMarker([f.lat, f.lng], {
        radius: isSelected ? 10 : 7,
        fillColor: color,
        fillOpacity: 0.8,
        color: isSelected ? '#fff' : 'rgba(255,255,255,0.3)',
        weight: isSelected ? 3 : 2,
        className: 'map-severity-dot',
      }).addTo(map);

      marker.bindPopup(`
        <div class="facility-popup">
          <h3>${f.name}</h3>
          <div class="meta">${f.type} · ${f.district}</div>
        </div>
      `);

      marker.on('click', () => onSelectFacility(f));
      markersRef.current.push(marker);
    });

    return () => {};
  }, [L, facilities, country, selectedFacilityId, facilitySeverity, onSelectFacility]);

  return (
    <div className="glass-card span-2 animate-in" id="facility-map-card">
      <div className="card-header">
        <span className="card-title">📍 Facility Map</span>
        <span className="card-badge badge-info">{facilities.length} facilities</span>
      </div>
      <div className="map-container" ref={mapRef} id="leaflet-map" />
    </div>
  );
}

