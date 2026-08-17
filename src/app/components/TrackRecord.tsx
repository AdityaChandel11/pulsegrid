'use client';

import { useEffect, useState } from 'react';

interface TrackRecordData {
  accuracyScore: number;
  avgErrorDays: number;
  sampleSize: number;
}

interface TrackRecordProps {
  facilityId: string | null;
}

export default function TrackRecord({ facilityId }: TrackRecordProps) {
  const [data, setData] = useState<TrackRecordData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!facilityId) { setData(null); return; }
    setLoading(true);
    fetch(`/api/predictions/track-record/${facilityId}`)
      .then((r) => r.json())
      .then((d: TrackRecordData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [facilityId]);

  const accuracyColor = data && data.accuracyScore >= 0.7 ? 'var(--status-ok)' :
    data && data.accuracyScore >= 0.4 ? 'var(--status-warning)' : 'var(--status-critical)';

  return (
    <div className="glass-card animate-in" id="track-record">
      <div className="card-header">
        <span className="card-title">🎯 Prediction Track Record</span>
      </div>
      {loading && <div className="shimmer" style={{ height: 80 }} />}
      {!loading && !data && (
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>Select a facility to view track record</p>
      )}
      {!loading && data && (
        <div className="track-record-grid">
          <div className="track-metric">
            <div className="metric-value" style={{ color: accuracyColor }}>
              {Math.round(data.accuracyScore * 100)}%
            </div>
            <div className="metric-label">Accuracy</div>
          </div>
          <div className="track-metric">
            <div className="metric-value text-accent">
              {data.avgErrorDays}d
            </div>
            <div className="metric-label">Avg Error</div>
          </div>
          <div className="track-metric">
            <div className="metric-value" style={{ color: 'var(--text-primary)' }}>
              {data.sampleSize}
            </div>
            <div className="metric-label">Sample Size</div>
          </div>
        </div>
      )}
    </div>
  );
}
