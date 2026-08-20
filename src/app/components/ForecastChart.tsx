'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import type { InventoryEventSource } from '@/types';

interface ForecastData {
  p10Days: number;
  p50Days: number;
  p90Days: number;
  confidenceScore: number;
  surgeFlag: boolean;
  source: InventoryEventSource;
  lastUpdated: string;
}

interface ForecastChartProps {
  facilityId: string | null;
  medicineId: string | null;
}

export default function ForecastChart({ facilityId, medicineId }: ForecastChartProps) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  // Capture freshness at fetch time — not during render — to avoid Date.now() impurity
  const [freshnessText, setFreshnessText] = useState('');
  const [freshnessDotColor, setFreshnessDotColor] = useState('var(--status-ok)');

  useEffect(() => {
    // Guard: early return without setState (rule: no setState sync in effect body)
    if (!facilityId || !medicineId) return;

    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });

    fetch(`/api/forecast/${facilityId}/${medicineId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: ForecastData) => {
        if (cancelled) return;
        // Compute freshness at fetch time — pure, deterministic at this point
        const now = Date.now();
        const updatedMs = now - new Date(d.lastUpdated).getTime();
        const updatedMins = Math.round(updatedMs / 60000);
        let ft: string;
        if (updatedMins < 60) ft = `${updatedMins}m ago`;
        else if (updatedMins < 1440) ft = `${Math.round(updatedMins / 60)}h ago`;
        else ft = `${Math.round(updatedMins / 1440)}d ago`;
        const dot = updatedMins < 60 ? 'var(--status-ok)' :
          updatedMins < 1440 ? 'var(--status-warning)' : 'var(--status-critical)';

        setData(d);
        setFreshnessText(ft);
        setFreshnessDotColor(dot);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [facilityId, medicineId]);

  if (!facilityId || !medicineId) {
    return (
      <div className="glass-card animate-in" id="forecast-chart">
        <div className="card-header"><span className="card-title">📈 Stockout Forecast</span></div>
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>Select a facility and medicine</p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="glass-card animate-in" id="forecast-chart">
        <div className="card-header"><span className="card-title">📈 Stockout Forecast</span></div>
        <div className="shimmer" style={{ height: 200, borderRadius: 8 }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card animate-in" id="forecast-chart">
        <div className="card-header"><span className="card-title">📈 Stockout Forecast</span></div>
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>No forecast data available</p>
      </div>
    );
  }

  // Generate fan chart data points for next 30 days
  const chartData = [];
  for (let d = 0; d <= 30; d++) {
    const p10Pct = d <= data.p10Days ? 100 : Math.max(0, 100 - ((d - data.p10Days) / 10) * 100);
    const p50Pct = d <= data.p50Days ? 100 : Math.max(0, 100 - ((d - data.p50Days) / 10) * 100);
    const p90Pct = d <= data.p90Days ? 100 : Math.max(0, 100 - ((d - data.p90Days) / 10) * 100);

    chartData.push({
      day: d,
      p10: Math.round(Math.min(p10Pct, 100)),
      p50: Math.round(Math.min(p50Pct, 100)),
      p90: Math.round(Math.min(p90Pct, 100)),
    });
  }

  const confidenceColor = data.confidenceScore >= 70 ? 'var(--status-ok)' :
    data.confidenceScore >= 40 ? 'var(--status-warning)' : 'var(--status-critical)';

  const sourceLabel =
    data.source === 'BARCODE' ? 'barcode scan' :
    data.source === 'OCR_INVOICE' ? 'invoice scan' :
    data.source === 'VOICE_LOG' ? 'voice entry' :
    data.source === 'SIMULATION' ? 'API sync' : 'manual entry';

  return (
    <div className="glass-card animate-in" id="forecast-chart">
      <div className="card-header">
        <span className="card-title">📈 Stockout Forecast</span>
        {data.surgeFlag && <span className="card-badge badge-surge">⚡ SURGE</span>}
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: 12, fontSize: '0.78rem' }}>
        <span>P10: <strong className="text-ok">{data.p10Days}d</strong></span>
        <span>P50: <strong className="text-warning">{data.p50Days}d</strong></span>
        <span>P90: <strong className="text-critical">{data.p90Days}d</strong></span>
      </div>

      <div className="forecast-chart-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <defs>
              <linearGradient id="p90Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="p50Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="p10Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                background: 'rgba(17,24,39,0.9)', border: '1px solid rgba(148,163,184,0.12)',
                borderRadius: 8, fontSize: 12, color: '#f1f5f9',
              }}
              labelFormatter={(v) => `Day ${v}`}
            />
            <ReferenceLine x={data.p50Days} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Area type="monotone" dataKey="p90" stroke="#ef4444" fill="url(#p90Gradient)" strokeWidth={1.5} dot={false} name="P90" />
            <Area type="monotone" dataKey="p50" stroke="#f59e0b" fill="url(#p50Gradient)" strokeWidth={2} dot={false} name="P50" />
            <Area type="monotone" dataKey="p10" stroke="#22c55e" fill="url(#p10Gradient)" strokeWidth={1.5} dot={false} name="P10" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Confidence</span>
        <div className="confidence-bar" style={{ flex: 1 }}>
          <div className="confidence-fill" style={{ width: `${data.confidenceScore}%`, background: confidenceColor }} />
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: confidenceColor }}>{data.confidenceScore}%</span>
      </div>

      {/* Freshness — computed at fetch time, not at render time */}
      <div className="freshness-indicator source-badge">
        <span className="freshness-dot" style={{ background: freshnessDotColor }} />
        <span>Last: {sourceLabel} · {freshnessText}</span>
      </div>
    </div>
  );
}
