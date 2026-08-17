'use client';

import { useEffect, useState } from 'react';
import type { Country } from '@/constants';

interface Signal {
  country: string;
  medicineCategory: string;
  demandTrendIndex: number;
  surgeActive: boolean;
  timestamp: string;
}

interface CrossBorderSignalsProps {
  country: Country;
}

const COUNTRY_FLAGS: Record<string, string> = {
  india: '🇮🇳',
  brazil: '🇧🇷',
  south_africa: '🇿🇦',
};

export default function CrossBorderSignals({ country }: CrossBorderSignalsProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/signals?country=${country}`)
      .then((r) => r.json())
      .then((data: Signal[]) => setSignals(data))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false));
  }, [country]);

  const surgeCount = signals.filter((s) => s.surgeActive).length;

  return (
    <div className="glass-card animate-in" id="cross-border-signals">
      <div className="card-header">
        <span className="card-title">🌐 Cross-Border Signals</span>
        {surgeCount > 0 && (
          <span className="card-badge badge-surge">{surgeCount} surges</span>
        )}
      </div>

      {loading && <div className="shimmer" style={{ height: 120 }} />}

      {!loading && signals.length === 0 && (
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>No cross-border signals</p>
      )}

      {!loading && signals.map((s, i) => {
        const trendPct = Math.round(s.demandTrendIndex * 100);
        const trendClass = trendPct > 10 ? 'trend-up' : trendPct < -10 ? 'trend-down' : 'trend-flat';
        const trendArrow = trendPct > 10 ? '↑' : trendPct < -10 ? '↓' : '→';

        return (
          <div className="signal-row" key={`${s.country}-${s.medicineCategory}-${i}`}>
            <div>
              <div className="signal-category">{s.medicineCategory}</div>
              <div className="signal-country">{COUNTRY_FLAGS[s.country] || ''} {s.country.replace('_', ' ')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {s.surgeActive && <span className="card-badge badge-surge" style={{ fontSize: '0.6rem' }}>SURGE</span>}
              <span className={`signal-trend ${trendClass}`}>
                {trendArrow} {trendPct > 0 ? '+' : ''}{trendPct}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
