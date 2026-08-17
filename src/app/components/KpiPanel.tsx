'use client';

import { useEffect, useState } from 'react';
import type { Country } from '@/constants';

interface KpiData {
  avgLeadTimeDays: number;
  redistributionsCompleted: number;
  transferredUnits: number;
  protectedPairs: number;
  totalTracked: number;
  activeSurges: number;
}

interface KpiPanelProps {
  country: Country;
  refreshTrigger?: number;
  onSurgeClick?: () => void;
}

export default function KpiPanel({ country, refreshTrigger, onSurgeClick }: KpiPanelProps) {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/kpi?country=${country}`)
      .then((r) => r.json())
      .then((d: KpiData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [country, refreshTrigger]);

  return (
    <div className="kpi-strip animate-in" id="kpi-panel">
      {/* KPI 1: Average Stockout Lead-Time */}
      <div className="kpi-card" id="kpi-lead-time">
        <div className="kpi-header">
          <span className="kpi-icon">⏳</span>
          <span className="kpi-title">Stockout Lead-Time</span>
        </div>
        <div className="kpi-main">
          {loading && !data ? (
            <div className="shimmer kpi-shimmer" />
          ) : (
            <div className="kpi-value-row">
              <span className="kpi-num font-mono text-accent">
                {data?.avgLeadTimeDays ?? 0}
              </span>
              <span className="kpi-unit">days avg</span>
            </div>
          )}
        </div>
        <div className="kpi-footer">Forecasting horizon across network</div>
      </div>

      {/* KPI 2: Protected Supply Pairs */}
      <div className="kpi-card" id="kpi-protected">
        <div className="kpi-header">
          <span className="kpi-icon">🛡️</span>
          <span className="kpi-title">Protected Pairs</span>
        </div>
        <div className="kpi-main">
          {loading && !data ? (
            <div className="shimmer kpi-shimmer" />
          ) : (
            <div className="kpi-value-row">
              <span className="kpi-num font-mono" style={{ color: 'var(--status-ok)' }}>
                {data?.protectedPairs ?? 0}
              </span>
              <span className="kpi-unit">/ {data?.totalTracked ?? 0}</span>
            </div>
          )}
        </div>
        <div className="kpi-footer">Stock level above 10-day safety buffer</div>
      </div>

      {/* KPI 3: Active Surges */}
      <div
        className={`kpi-card ${data && data.activeSurges > 0 ? 'kpi-alert-surge' : ''}`}
        id="kpi-surges"
        onClick={data && data.activeSurges > 0 ? onSurgeClick : undefined}
        style={{ cursor: data && data.activeSurges > 0 ? 'pointer' : 'default' }}
        title={data && data.activeSurges > 0 ? 'Click to jump to active surge' : undefined}
      >
        <div className="kpi-header">
          <span className="kpi-icon">⚡</span>
          <span className="kpi-title">Active Surges</span>
          {data && data.activeSurges > 0 && (
            <span className="card-badge badge-surge animate-pulse" style={{ fontSize: '0.6rem' }}>
              ALERT
            </span>
          )}
        </div>
        <div className="kpi-main">
          {loading && !data ? (
            <div className="shimmer kpi-shimmer" />
          ) : (
            <div className="kpi-value-row">
              <span
                className={`kpi-num font-mono ${
                  data && data.activeSurges > 0 ? 'text-critical' : 'text-ok'
                }`}
              >
                {data?.activeSurges ?? 0}
              </span>
              <span className="kpi-unit">facilities</span>
            </div>
          )}
        </div>
        <div className="kpi-footer">
          {data && data.activeSurges > 0
            ? 'Abnormal consumption velocity'
            : 'Nominal consumption rates'}
        </div>
      </div>

      {/* KPI 4: Completed Redistributions */}
      <div className="kpi-card" id="kpi-redistributions">
        <div className="kpi-header">
          <span className="kpi-icon">🔄</span>
          <span className="kpi-title">Redistributions</span>
        </div>
        <div className="kpi-main">
          {loading && !data ? (
            <div className="shimmer kpi-shimmer" />
          ) : (
            <div className="kpi-value-row">
              <span className="kpi-num font-mono" style={{ color: 'var(--text-accent)' }}>
                {data?.redistributionsCompleted ?? 0}
              </span>
              <span className="kpi-unit">transfers</span>
            </div>
          )}
        </div>
        <div className="kpi-footer">
          {data && data.transferredUnits > 0
            ? `${data.transferredUnits} units balanced`
            : 'Dispatched via event ledger'}
        </div>
      </div>
    </div>
  );
}
