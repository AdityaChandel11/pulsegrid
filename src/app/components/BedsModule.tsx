'use client';

import { useEffect, useState } from 'react';

interface BedData {
  ward: string;
  total: number;
  occupied: number;
  status: 'normal' | 'warning' | 'critical';
}

interface BedsModuleProps {
  facilityId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  normal: 'var(--status-ok)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
};

export default function BedsModule({ facilityId }: BedsModuleProps) {
  const [beds, setBeds] = useState<BedData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Guard: do not call setBeds([]) synchronously — early return keeps state as-is
    if (!facilityId) return;

    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });

    fetch(`/api/beds/${facilityId}`)
      .then((r) => r.json())
      .then((data: BedData[]) => {
        if (!cancelled) {
          setBeds(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBeds([]);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [facilityId]);

  const overallStatus = beds.some((b) => b.status === 'critical') ? 'critical' :
    beds.some((b) => b.status === 'warning') ? 'warning' : 'normal';

  return (
    <div className="glass-card animate-in" id="beds-module">
      <div className="card-header">
        <span className="card-title">🛏️ Bed Occupancy</span>
        {beds.length > 0 && (
          <span className={`card-badge badge-${overallStatus === 'normal' ? 'ok' : overallStatus}`}>
            {overallStatus}
          </span>
        )}
      </div>

      {loading && <div className="shimmer" style={{ height: 100 }} />}

      {!loading && beds.length === 0 && (
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>
          {facilityId ? 'No bed data' : 'Select a facility'}
        </p>
      )}

      {!loading && beds.map((b) => {
        const pct = b.total > 0 ? Math.round((b.occupied / b.total) * 100) : 0;
        return (
          <div className="progress-row" key={b.ward}>
            <span className="progress-label">{b.ward}</span>
            <div className="progress-track">
              <div className="progress-fill" style={{
                width: `${pct}%`,
                background: STATUS_COLORS[b.status],
              }} />
            </div>
            <span className="progress-value" style={{ color: STATUS_COLORS[b.status] }}>
              {b.occupied}/{b.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}
