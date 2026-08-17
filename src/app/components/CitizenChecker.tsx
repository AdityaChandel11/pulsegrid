'use client';

import { useEffect, useState } from 'react';

interface CitizenCheckResult {
  status: 'available' | 'low' | 'unavailable';
  freshnessText: string;
}

interface CitizenCheckerProps {
  facilityId: string | null;
  medicineId: string | null;
  facilityName: string;
  medicineName: string;
}

const STATUS_ICONS: Record<string, string> = {
  available: '✓',
  low: '⚠',
  unavailable: '✕',
};

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  low: 'Low Stock',
  unavailable: 'Unavailable',
};

export default function CitizenChecker({ facilityId, medicineId, facilityName, medicineName }: CitizenCheckerProps) {
  const [result, setResult] = useState<CitizenCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!facilityId || !medicineId) { setResult(null); return; }
    setLoading(true);
    fetch(`/api/citizen-check?facilityId=${facilityId}&medicineId=${medicineId}`)
      .then((r) => r.json())
      .then((d: CitizenCheckResult) => setResult(d))
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [facilityId, medicineId]);

  return (
    <div className="glass-card animate-in" id="citizen-checker">
      <div className="card-header">
        <span className="card-title">🏥 Citizen Availability Check</span>
      </div>

      {!facilityId || !medicineId ? (
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>Select a facility and medicine to check availability</p>
      ) : loading ? (
        <div className="shimmer" style={{ height: 80 }} />
      ) : result ? (
        <>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>{medicineName}</strong> at <strong style={{ color: 'var(--text-secondary)' }}>{facilityName}</strong>
          </div>
          <div className={`citizen-status ${result.status}`}>
            <div className="citizen-status-icon">
              {STATUS_ICONS[result.status]}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {STATUS_LABELS[result.status]}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {result.freshnessText}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>Unable to check availability</p>
      )}
    </div>
  );
}
