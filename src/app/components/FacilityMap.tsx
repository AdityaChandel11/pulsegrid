'use client';

import { useEffect, useRef, useState } from 'react';
import type { Facility } from '@/types';
import type { Country } from '@/constants';

export interface ActiveRoute {
  sourceId: string;
  destId: string;
  sourceName: string;
  destName: string;
  sourceLat: number;
  sourceLng: number;
  destLat: number;
  destLng: number;
  quantity: number;
  etaHours: number;
}

interface FacilityMapProps {
  country: Country;
  onSelectFacility: (f: Facility) => void;
  selectedFacilityId: string | null;
  facilitySeverity?: Record<string, 'low' | 'medium' | 'high' | 'surge'>;
  activeRoute?: ActiveRoute | null;
}

const COUNTRY_CENTERS: Record<Country, [number, number]> = {
  india: [26.8, 80.8],
  brazil: [-15.8, -47.9],
  south_africa: [-29.0, 26.0],
};

const COUNTRY_ZOOMS: Record<Country, number> = {
  india: 6,
  brazil: 4,
  south_africa: 5,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  surge: '#dc2626',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Normal (>10d)',
  medium: 'Watch (6-10d)',
  high: 'Critical (≤5d)',
  surge: 'Surge Active',
};

export default function FacilityMap({
  country,
  onSelectFacility,
  selectedFacilityId,
  facilitySeverity = {},
  activeRoute,
}: FacilityMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [leafletLib, setLeafletLib] = useState<typeof import('leaflet') | null>(null);

  // Load leaflet dynamically (client only)
  useEffect(() => {
    import('leaflet').then((mod) => setLeafletLib(mod.default || mod));
  }, []);

  // Fetch facilities when country changes
  useEffect(() => {
    fetch(`/api/facilities?country=${country}`)
      .then((r) => r.json())
      .then((data: Facility[]) => setFacilities(data))
      .catch(() => setFacilities([]));
  }, [country]);

  // Initialize map once Leaflet is ready
  useEffect(() => {
    if (!leafletLib || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      const center = COUNTRY_CENTERS[country] || [20.5937, 78.9629];
      const zoom = COUNTRY_ZOOMS[country] || 5;

      const map = leafletLib.map(mapRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: false,
        zoomAnimation: true,
      });

      leafletLib.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        subdomains: 'abcd',
      }).addTo(map);

      markersLayerRef.current = leafletLib.layerGroup().addTo(map);
      routeLayerRef.current = leafletLib.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    } else {
      const map = mapInstanceRef.current;
      const center = COUNTRY_CENTERS[country];
      const zoom = COUNTRY_ZOOMS[country];
      map.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [leafletLib, country]);

  // Render Markers
  useEffect(() => {
    const L = leafletLib;
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!L || !map || !markersLayer) return;

    markersLayer.clearLayers();

    facilities.forEach((f) => {
      const severity = facilitySeverity[f.id] || 'low';
      const color = SEVERITY_COLORS[severity] || '#22c55e';
      const isSelected = f.id === selectedFacilityId;
      const isSurge = severity === 'surge';

      if (isSurge) {
        // Surge marker with animated radar pulse
        const surgeIcon = L.divIcon({
          className: 'custom-surge-icon-wrapper',
          html: `
            <div class="map-node-pulse-container ${isSelected ? 'selected' : ''}">
              <div class="map-node-surge-ring"></div>
              <div class="map-node-core surge"></div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker([f.lat, f.lng], { icon: surgeIcon });
        marker.bindPopup(`
          <div class="facility-popup surge-popup">
            <div class="popup-badge badge-surge">⚡ ACTIVE SURGE</div>
            <h3>${f.name}</h3>
            <div class="meta">${f.type} · ${f.district}</div>
            <div class="popup-action">Click to inspect supply risk</div>
          </div>
        `);

        marker.on('click', () => onSelectFacility(f));
        markersLayer.addLayer(marker);
      } else {
        // Standard severity colored circle marker
        const radius = isSelected ? 11 : severity === 'high' ? 9 : 7;
        const marker = L.circleMarker([f.lat, f.lng], {
          radius,
          fillColor: color,
          fillOpacity: isSelected ? 0.95 : 0.85,
          color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.4)',
          weight: isSelected ? 3 : 1.5,
          className: `map-marker-${severity}`,
        });

        marker.bindPopup(`
          <div class="facility-popup">
            <div class="popup-badge badge-${severity}">${SEVERITY_LABELS[severity]}</div>
            <h3>${f.name}</h3>
            <div class="meta">${f.type} · ${f.district}</div>
            <div class="popup-action">Click to inspect supply risk</div>
          </div>
        `);

        marker.on('click', () => onSelectFacility(f));
        markersLayer.addLayer(marker);
      }
    });
  }, [leafletLib, facilities, facilitySeverity, selectedFacilityId, onSelectFacility]);

  // Render Active Redistribution Route on the Map
  useEffect(() => {
    const L = leafletLib;
    const routeLayer = routeLayerRef.current;
    if (!L || !routeLayer) return;

    routeLayer.clearLayers();

    if (activeRoute) {
      const { sourceLat, sourceLng, destLat, destLng, sourceName, destName, quantity, etaHours } = activeRoute;

      // Draw dashed path line
      const latlngs: [number, number][] = [
        [sourceLat, sourceLng],
        [destLat, destLng],
      ];

      // Glow outline
      const glowLine = L.polyline(latlngs, {
        color: '#06b6d4',
        weight: 6,
        opacity: 0.35,
      });
      routeLayer.addLayer(glowLine);

      // Active animated dash line
      const activeLine = L.polyline(latlngs, {
        color: '#38bdf8',
        weight: 3,
        opacity: 0.95,
        dashArray: '8, 8',
      });
      routeLayer.addLayer(activeLine);

      // Midpoint truck icon
      const midLat = (sourceLat + destLat) / 2;
      const midLng = (sourceLng + destLng) / 2;

      const truckIcon = L.divIcon({
        className: 'map-truck-icon',
        html: `<div class="truck-marker animate-bounce">🚛 <span class="truck-tag">${quantity} units</span></div>`,
        iconSize: [80, 30],
        iconAnchor: [40, 15],
      });

      const truckMarker = L.marker([midLat, midLng], { icon: truckIcon });
      truckMarker.bindPopup(`
        <div class="facility-popup">
          <div class="popup-badge badge-ok">✓ REDISTRIBUTION IN TRANSIT</div>
          <div>From: <strong>${sourceName}</strong></div>
          <div>To: <strong>${destName}</strong></div>
          <div class="meta">${quantity} units · ${etaHours}h ETA</div>
        </div>
      `);
      routeLayer.addLayer(truckMarker);
    }
  }, [leafletLib, activeRoute]);

  return (
    <div className="glass-card animate-in facility-map-card" id="facility-map-card">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="card-title">📍 Facility Network Map</span>
          <span className="card-badge badge-info">{facilities.length} facilities</span>
        </div>
        <div className="map-quick-status">
          {Object.values(facilitySeverity).filter((s) => s === 'surge').length > 0 && (
            <span className="card-badge badge-surge animate-pulse">
              ⚡ {Object.values(facilitySeverity).filter((s) => s === 'surge').length} Surges Active
            </span>
          )}
        </div>
      </div>

      <div className="map-container-wrapper">
        <div className="map-container" ref={mapRef} id="leaflet-map" />

        {/* Floating Map Legend */}
        <div className="map-legend" id="map-legend">
          <div className="legend-title">SEVERITY / RISK</div>
          <div className="legend-items">
            <div className="legend-item">
              <span className="legend-dot surge-dot"></span>
              <span>Surge Alert</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot critical-dot"></span>
              <span>Critical (≤5d)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot warning-dot"></span>
              <span>Watch (6-10d)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot normal-dot"></span>
              <span>Normal (&gt;10d)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
