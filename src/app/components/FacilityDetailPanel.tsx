'use client';

import { useEffect, useState } from 'react';
import type { Facility, Medicine, InventoryEventSource } from '@/types';
import type { ActiveRoute } from './FacilityMap';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from 'recharts';

interface ForecastData {
  p10Days: number;
  p50Days: number;
  p90Days: number;
  confidenceScore: number;
  surgeFlag: boolean;
  source: InventoryEventSource;
  lastUpdated: string;
}

interface TrackRecordData {
  accuracyScore: number;
  avgErrorDays: number;
  sampleSize: number;
}

interface BedData {
  ward: string;
  total: number;
  occupied: number;
  status: 'normal' | 'warning' | 'critical';
}

interface StaffData {
  role: string;
  required: number;
  available: number;
  status: 'ok' | 'shortage' | 'critical';
}

interface Recommendation {
  sourceFacilityId: string;
  sourceFacilityName: string;
  quantity: number;
  distanceKm: number;
  etaHours: number;
  memoText: string;
}

interface FacilityDetailPanelProps {
  facility: Facility | null;
  onClose: () => void;
  onApproveTransfer: (route: ActiveRoute) => void;
  selectedMedicineId?: string | null;
}

export default function FacilityDetailPanel({
  facility,
  onClose,
  onApproveTransfer,
  selectedMedicineId: initialMedicineId,
}: FacilityDetailPanelProps) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  // Facility detail data states
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  const [trackRecord, setTrackRecord] = useState<TrackRecordData | null>(null);
  const [beds, setBeds] = useState<BedData[]>([]);
  const [staff, setStaff] = useState<StaffData[]>([]);

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState<{
    destStock: number;
    sourceStock: number;
    sourceName: string;
    quantity: number;
  } | null>(null);

  // Load medicines list
  useEffect(() => {
    fetch('/api/medicines')
      .then((r) => r.json())
      .then((data: Medicine[]) => {
        setMedicines(data);
        if (data.length > 0) {
          const match = initialMedicineId
            ? data.find((m) => m.id === initialMedicineId)
            : data[0];
          setSelectedMedicine(match || data[0]);
        }
      })
      .catch(() => setMedicines([]));
  }, [initialMedicineId]);

  // Sync selected medicine when initialMedicineId changes from parent
  useEffect(() => {
    if (initialMedicineId && medicines.length > 0) {
      const match = medicines.find((m) => m.id === initialMedicineId);
      if (match) setSelectedMedicine(match);
    }
  }, [initialMedicineId, medicines]);

  // Load Forecast, Track Record, Beds, Staff, Recommendation when facility or medicine changes
  useEffect(() => {
    if (!facility) return;

    setTransferSuccess(null);

    // Fetch beds
    fetch(`/api/beds/${facility.id}`)
      .then((r) => r.json())
      .then((d: BedData[]) => setBeds(d))
      .catch(() => setBeds([]));

    // Fetch staff
    fetch(`/api/staff/${facility.id}`)
      .then((r) => r.json())
      .then((d: StaffData[]) => setStaff(d))
      .catch(() => setStaff([]));

    // Fetch track record
    fetch(`/api/predictions/track-record/${facility.id}`)
      .then((r) => r.json())
      .then((d: TrackRecordData) => setTrackRecord(d))
      .catch(() => setTrackRecord(null));
  }, [facility]);

  // Fetch forecast and recommendation for currently selected medicine
  useEffect(() => {
    if (!facility || !selectedMedicine) {
      setForecast(null);
      setRecommendation(null);
      return;
    }

    setForecastLoading(true);
    fetch(`/api/forecast/${facility.id}/${selectedMedicine.id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: ForecastData) => setForecast(data))
      .catch(() => setForecast(null))
      .finally(() => setForecastLoading(false));

    setRecLoading(true);
    fetch(`/api/redistribution/recommendations?facilityId=${facility.id}&medicineId=${selectedMedicine.id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: Recommendation) => setRecommendation(data))
      .catch(() => setRecommendation(null))
      .finally(() => setRecLoading(false));
  }, [facility, selectedMedicine]);

  // Handle transfer approval
  const handleApprove = async () => {
    if (!facility || !selectedMedicine || !recommendation) return;

    setApproving(true);
    try {
      const res = await fetch('/api/redistribution/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId: facility.id,
          medicineId: selectedMedicine.id,
          sourceFacilityId: recommendation.sourceFacilityId,
          quantity: recommendation.quantity,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTransferSuccess({
          destStock: data.newStockAtDestination,
          sourceStock: data.newStockAtSource,
          sourceName: recommendation.sourceFacilityName,
          quantity: recommendation.quantity,
        });

        // Trigger map animated route
        // Fetch source facility coordinates from API or database
        const facRes = await fetch(`/api/facilities?country=${facility.country}`);
        const allFacilities: Facility[] = await facRes.json();
        const srcFac = allFacilities.find((f) => f.id === recommendation.sourceFacilityId);

        if (srcFac) {
          onApproveTransfer({
            sourceId: srcFac.id,
            destId: facility.id,
            sourceName: srcFac.name,
            destName: facility.name,
            sourceLat: srcFac.lat,
            sourceLng: srcFac.lng,
            destLat: facility.lat,
            destLng: facility.lng,
            quantity: recommendation.quantity,
            etaHours: recommendation.etaHours,
          });
        }

        // Refetch forecast to update immediately
        const freshForecastRes = await fetch(`/api/forecast/${facility.id}/${selectedMedicine.id}`);
        if (freshForecastRes.ok) {
          const freshData = await freshForecastRes.json();
          setForecast(freshData);
        }
      }
    } catch {
      // Error handling
    } finally {
      setApproving(false);
    }
  };

  if (!facility) return null;

  // Build forecast chart data
  const chartData = [];
  if (forecast) {
    const maxDays = Math.max(forecast.p90Days + 4, 15);
    for (let d = 0; d <= maxDays; d++) {
      const p10Pct =
        d <= forecast.p10Days
          ? 100
          : Math.max(
              0,
              100 - ((d - forecast.p10Days) / Math.max(1, forecast.p50Days - forecast.p10Days + 1)) * 80,
            );
      const p50Pct =
        d <= forecast.p50Days
          ? 100
          : Math.max(
              0,
              100 - ((d - forecast.p50Days) / Math.max(1, forecast.p90Days - forecast.p50Days + 1)) * 100,
            );
      const p90Pct =
        d <= forecast.p90Days
          ? Math.max(20, 100 - (d / Math.max(1, forecast.p90Days)) * 80)
          : Math.max(0, 20 - (d - forecast.p90Days) * 10);

      chartData.push({
        day: `D+${d}`,
        p10: Math.round(p10Pct),
        p50: Math.round(p50Pct),
        p90: Math.round(p90Pct),
      });
    }
  }

  // Freshness & Source metadata formatting
  const sourceLabel =
    forecast?.source === 'BARCODE'
      ? 'Barcode scan'
      : forecast?.source === 'OCR_INVOICE'
      ? 'Invoice scan / OCR'
      : forecast?.source === 'VOICE_LOG'
      ? 'Voice log'
      : forecast?.source === 'SIMULATION'
      ? 'e-Aushadhi / API sync'
      : 'Manual log';

  let freshnessText = 'Recently';
  if (forecast?.lastUpdated) {
    const ageMins = Math.max(1, Math.floor((Date.now() - new Date(forecast.lastUpdated).getTime()) / 60000));
    if (ageMins < 60) freshnessText = `${ageMins}m ago`;
    else if (ageMins < 1440) freshnessText = `${Math.floor(ageMins / 60)}h ago`;
    else freshnessText = `${Math.floor(ageMins / 1440)}d ago`;
  }

  const confidenceColor =
    (forecast?.confidenceScore ?? 0) >= 70
      ? 'var(--status-ok)'
      : (forecast?.confidenceScore ?? 0) >= 40
      ? 'var(--status-warning)'
      : 'var(--status-critical)';

  return (
    <aside className="facility-detail-drawer animate-slide-left" id="facility-detail-drawer">
      {/* Drawer Header */}
      <div className="drawer-header">
        <div>
          <div className="drawer-subhead">
            {facility.type} · {facility.district} · {facility.country.toUpperCase()}
          </div>
          <h2 className="drawer-title" id="drawer-facility-name">
            {facility.name}
          </h2>
        </div>
        <button
          className="drawer-close-btn"
          onClick={onClose}
          aria-label="Close panel"
          id="close-facility-drawer-btn"
        >
          ✕
        </button>
      </div>

      <div className="drawer-content">
        {/* Medicine Selector */}
        <div className="drawer-section medicine-select-section">
          <label className="section-label">Select Medicine to Inspect</label>
          <select
            className="pg-select w-full"
            id="drawer-medicine-select"
            value={selectedMedicine?.id || ''}
            onChange={(e) => {
              const m = medicines.find((item) => item.id === e.target.value);
              if (m) setSelectedMedicine(m);
            }}
          >
            {medicines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit}) — {m.category}
              </option>
            ))}
          </select>
        </div>

        {/* Forecast & Confidence Section */}
        <div className="drawer-section forecast-section">
          <div className="section-header-row">
            <div className="section-title">Stockout Forecast & Risk Band</div>
            {forecast?.surgeFlag && (
              <span className="card-badge badge-surge animate-pulse">⚡ SURGE ACTIVE</span>
            )}
          </div>

          {forecastLoading ? (
            <div className="shimmer" style={{ height: 160, borderRadius: 8 }} />
          ) : forecast ? (
            <>
              {/* Forecast metrics summary row */}
              <div className="forecast-summary-bar">
                <div className="forecast-stat">
                  <span className="stat-p-tag">P10 (Pessimistic)</span>
                  <span className="stat-days text-critical font-mono">{forecast.p10Days}d</span>
                </div>
                <div className="forecast-stat highlight">
                  <span className="stat-p-tag">P50 (Expected)</span>
                  <span className="stat-days text-warning font-mono">{forecast.p50Days}d</span>
                </div>
                <div className="forecast-stat">
                  <span className="stat-p-tag">P90 (Optimistic)</span>
                  <span className="stat-days text-ok font-mono">{forecast.p90Days}d</span>
                </div>
              </div>

              {/* p10/p50/p90 Band Area Chart */}
              <div className="drawer-chart-container">
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="p90Band" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="p50Band" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="p10Band" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: 8,
                        fontSize: 11,
                        color: '#f8fafc',
                      }}
                    />
                    <ReferenceLine x={`D+${forecast.p50Days}`} stroke="#f59e0b" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="p90" stroke="#22c55e" fill="url(#p90Band)" strokeWidth={1.5} name="P90 (Stocked)" />
                    <Area type="monotone" dataKey="p50" stroke="#f59e0b" fill="url(#p50Band)" strokeWidth={2} name="P50 (Median)" />
                    <Area type="monotone" dataKey="p10" stroke="#ef4444" fill="url(#p10Band)" strokeWidth={1.5} name="P10 (Critical)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Confidence score + Freshness Badge */}
              <div className="meta-badge-row">
                <div className="confidence-pill" style={{ borderColor: confidenceColor }}>
                  <span className="pill-dot" style={{ background: confidenceColor }}></span>
                  <span className="font-mono font-semibold" style={{ color: confidenceColor }}>
                    {forecast.confidenceScore}% Confidence
                  </span>
                </div>
                <div className="freshness-pill">
                  <span>📡 {sourceLabel}</span>
                  <span className="pill-divider">·</span>
                  <span>{freshnessText}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.82rem' }}>
              No forecast stream available for this pair
            </p>
          )}
        </div>

        {/* Prediction Track Record Line */}
        {trackRecord && (
          <div className="drawer-section track-record-section">
            <div className="track-record-line">
              <span className="track-icon">🎯</span>
              <div className="track-text">
                <strong>{Math.round(trackRecord.accuracyScore * 100)}% historical accuracy</strong> (±{trackRecord.avgErrorDays}d avg error over last {trackRecord.sampleSize} alerts)
              </div>
            </div>
          </div>
        )}

        {/* Redistribution Recommendation Card & Action */}
        <div className="drawer-section redistribution-section">
          <div className="section-header-row">
            <div className="section-title">🔄 Proactive Redistribution</div>
            {recommendation && <span className="card-badge badge-warning">Action Ready</span>}
          </div>

          {recLoading ? (
            <div className="shimmer" style={{ height: 100, borderRadius: 8 }} />
          ) : transferSuccess ? (
            <div className="transfer-success-box animate-in" id="transfer-success-box">
              <div className="success-icon">✓</div>
              <div className="success-body">
                <div className="success-title">Redistribution Transfer Approved!</div>
                <div className="success-desc">
                  Paired ledger events written to SQLite. <strong>{transferSuccess.quantity} units</strong> dispatched from <strong>{transferSuccess.sourceName}</strong>.
                </div>
                <div className="stock-change-pills">
                  <span className="stock-pill">Destination Stock: +{transferSuccess.quantity}</span>
                  <span className="stock-pill">Source Stock: {transferSuccess.sourceStock}</span>
                </div>
              </div>
            </div>
          ) : recommendation ? (
            <div className="recommendation-box" id="redistribution-recommendation-box">
              <div className="memo-text">
                &ldquo;{recommendation.memoText}&rdquo;
              </div>

              <div className="rec-metrics-grid">
                <div className="rec-metric">
                  <span className="metric-label">Source</span>
                  <span className="metric-val text-accent">{recommendation.sourceFacilityName}</span>
                </div>
                <div className="rec-metric">
                  <span className="metric-label">Quantity</span>
                  <span className="metric-val font-mono">{recommendation.quantity} units</span>
                </div>
                <div className="rec-metric">
                  <span className="metric-label">Distance & ETA</span>
                  <span className="metric-val font-mono">{recommendation.distanceKm} km · {recommendation.etaHours}h</span>
                </div>
              </div>

              <button
                className="btn-primary w-full approve-btn"
                id="drawer-approve-redistribution-btn"
                onClick={handleApprove}
                disabled={approving}
              >
                {approving ? '⚡ Writing Paired Transfer Events...' : '✓ Approve & Dispatch Redistribution'}
              </button>
            </div>
          ) : (
            <div className="no-rec-box">
              <span>No current redistribution candidate required or network surplus meets local safety levels.</span>
            </div>
          )}
        </div>

        {/* Beds & Staff Snapshot */}
        <div className="drawer-section beds-staff-section">
          <div className="section-title" style={{ marginBottom: 12 }}>
            🏥 Facility Operations Snapshot
          </div>

          <div className="ops-snapshot-grid">
            {/* Beds */}
            <div className="ops-snapshot-card">
              <div className="ops-card-title">🛏️ Beds Occupancy</div>
              {beds.length === 0 ? (
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>No bed data</span>
              ) : (
                beds.map((b) => {
                  const pct = b.total > 0 ? Math.round((b.occupied / b.total) * 100) : 0;
                  const color =
                    b.status === 'critical'
                      ? 'var(--status-critical)'
                      : b.status === 'warning'
                      ? 'var(--status-warning)'
                      : 'var(--status-ok)';
                  return (
                    <div key={b.ward} className="ops-mini-row">
                      <span className="mini-label">{b.ward}</span>
                      <div className="mini-progress-bar">
                        <div className="mini-fill" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="mini-value font-mono" style={{ color }}>
                        {b.occupied}/{b.total}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Staff */}
            <div className="ops-snapshot-card">
              <div className="ops-card-title">👥 Staff Roster</div>
              {staff.length === 0 ? (
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>No staff data</span>
              ) : (
                staff.map((s) => {
                  const color =
                    s.status === 'critical'
                      ? 'var(--status-critical)'
                      : s.status === 'shortage'
                      ? 'var(--status-warning)'
                      : 'var(--status-ok)';
                  return (
                    <div key={s.role} className="ops-mini-row">
                      <span className="mini-label">{s.role}</span>
                      <span className="mini-value font-mono" style={{ color }}>
                        {s.available}/{s.required} {s.status === 'critical' ? '⚠️' : ''}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
