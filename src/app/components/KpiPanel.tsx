'use client';

import { useEffect, useState, useRef } from 'react';
import type { Country } from '@/constants';

interface KpiData {
  avgLeadTimeDays: number;
  redistributionsCompleted: number;
  protectedPairs: number;
  activeSurges: number;
}

interface KpiPanelProps {
  country: Country;
}

export default function KpiPanel({ country }: KpiPanelProps) {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLoading(true);
    setSecondsElapsed(0);
    fetch(`/api/kpi?country=${country}`)
      .then((r) => r.json())
      .then((d: KpiData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [country]);

  // Seconds-to-action timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsElapsed((s) => s + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-card span-3 animate-in kpi-panel" id="kpi-panel">
      <div className="card-header">
        <span className="card-title">📊 Key Performance Indicators</span>
      </div>

      {loading && <div className="shimmer" style={{ height: 80 }} />}

      {!loading && data && (
        <div className="kpi-grid">
          <div className="kpi-item">
            <div className="kpi-value text-accent font-mono">{data.avgLeadTimeDays}</div>
            <div className="kpi-unit">days</div>
            <div className="kpi-label">Stockout Lead-Time Gained</div>
          </div>
          <div className="kpi-item">
            <div className="kpi-value font-mono" style={{ color: 'var(--status-ok)' }}>{formatTime(secondsElapsed)}</div>
            <div className="kpi-unit">elapsed</div>
            <div className="kpi-label">Seconds to Action</div>
          </div>
          <div className="kpi-item">
            <div className="kpi-value font-mono" style={{ color: 'var(--status-info)' }}>{data.protectedPairs}</div>
            <div className="kpi-unit">pairs</div>
            <div className="kpi-label">Network Stockout-Days Reduced</div>
          </div>
          <div className="kpi-item">
            <div className="kpi-value font-mono" style={{ color: 'var(--text-accent)' }}>{data.redistributionsCompleted}</div>
            <div className="kpi-unit">transfers</div>
            <div className="kpi-label">Redistributions Completed</div>
          </div>
          <div className="kpi-item">
            <div className={`kpi-value font-mono ${data.activeSurges > 0 ? 'text-critical' : 'text-ok'}`}>{data.activeSurges}</div>
            <div className="kpi-unit">active</div>
            <div className="kpi-label">Active Surges</div>
          </div>
        </div>
      )}
    </div>
  );
}
