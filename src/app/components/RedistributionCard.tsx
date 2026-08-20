'use client';

import { useEffect, useRef, useState } from 'react';
import RouteAnimation from './RouteAnimation';

interface Recommendation {
  sourceFacilityId: string;
  sourceFacilityName: string;
  quantity: number;
  distanceKm: number;
  etaHours: number;
  memoText: string;
}

interface ApprovalResult {
  success: boolean;
  newStockAtDestination: number;
  newStockAtSource: number;
}

interface RedistributionCardProps {
  facilityId: string | null;
  facilityName: string;
  medicineId: string | null;
}

export default function RedistributionCard({ facilityId, facilityName, medicineId }: RedistributionCardProps) {
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState<ApprovalResult | null>(null);
  const [showAnimation, setShowAnimation] = useState(false);

  // Track the current pair key so we can reset approved/animation state when it changes
  const pairKeyRef = useRef<string>('');

  useEffect(() => {
    const newKey = `${facilityId}::${medicineId}`;

    // Reset approval/animation state synchronously only via ref comparison,
    // actual setState happens in async path or on submit. When the pair changes
    // and there's no facilityId/medicineId, we schedule the reset asynchronously.
    if (pairKeyRef.current !== newKey) {
      pairKeyRef.current = newKey;
    }

    // Do not fetch if inputs are absent
    if (!facilityId || !medicineId) return;

    let cancelled = false;

    // Reset derived states for new pair in async microtask (not synchronously in effect body)
    Promise.resolve().then(() => {
      if (!cancelled) {
        setApproved(null);
        setShowAnimation(false);
        setLoading(true);
      }
    });

    fetch(`/api/redistribution/recommendations?facilityId=${facilityId}&medicineId=${medicineId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: Recommendation) => {
        if (!cancelled) {
          setRec(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRec(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [facilityId, medicineId]);

  const handleApprove = async () => {
    if (!facilityId || !medicineId || !rec) return;
    setApproving(true);
    try {
      const res = await fetch('/api/redistribution/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId,
          medicineId,
          sourceFacilityId: rec.sourceFacilityId,
          quantity: rec.quantity,
        }),
      });
      const data: ApprovalResult = await res.json();
      setApproved(data);
      setShowAnimation(true);
    } catch { /* ignore */ }
    finally { setApproving(false); }
  };

  return (
    <div className="glass-card span-2 animate-in" id="redistribution-card">
      <div className="card-header">
        <span className="card-title">🔄 Redistribution Recommendation</span>
        {rec && <span className="card-badge badge-warning">Action Needed</span>}
      </div>

      {loading && <div className="shimmer" style={{ height: 120 }} />}

      {!loading && !rec && (
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>
          {facilityId ? 'No redistribution recommendation available' : 'Select a facility and medicine'}
        </p>
      )}

      {!loading && rec && (
        <>
          <div className="redistribution-memo">{rec.memoText}</div>
          <div className="redistribution-stats">
            <div className="redistribution-stat">
              <div className="stat-value">{rec.quantity}</div>
              <div className="stat-label">Units</div>
            </div>
            <div className="redistribution-stat">
              <div className="stat-value">{rec.distanceKm}<span style={{ fontSize: '0.7rem' }}>km</span></div>
              <div className="stat-label">Distance</div>
            </div>
            <div className="redistribution-stat">
              <div className="stat-value">{rec.etaHours}<span style={{ fontSize: '0.7rem' }}>h</span></div>
              <div className="stat-label">ETA</div>
            </div>
          </div>

          {showAnimation && (
            <RouteAnimation
              sourceName={rec.sourceFacilityName}
              destName={facilityName}
              distanceKm={rec.distanceKm}
              etaHours={rec.etaHours}
              active={showAnimation}
            />
          )}

          {approved ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <span className="text-ok" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                ✓ Transfer Approved
              </span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Destination stock: {approved.newStockAtDestination} · Source stock: {approved.newStockAtSource}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <button
                className="btn-primary"
                id="approve-redistribution-btn"
                onClick={handleApprove}
                disabled={approving}
              >
                {approving ? '⏳ Processing...' : '✓ Approve Transfer'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
