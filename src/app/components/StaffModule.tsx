'use client';

import { useEffect, useState } from 'react';

interface StaffData {
  role: string;
  required: number;
  available: number;
  status: 'ok' | 'shortage' | 'critical';
}

interface StaffModuleProps {
  facilityId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  ok: 'var(--status-ok)',
  shortage: 'var(--status-warning)',
  critical: 'var(--status-critical)',
};

const ROLE_ICONS: Record<string, string> = {
  doctor: '👨‍⚕️',
  nurse: '👩‍⚕️',
  pharmacist: '💊',
};

export default function StaffModule({ facilityId }: StaffModuleProps) {
  const [staff, setStaff] = useState<StaffData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!facilityId) { setStaff([]); return; }
    setLoading(true);
    fetch(`/api/staff/${facilityId}`)
      .then((r) => r.json())
      .then((data: StaffData[]) => setStaff(data))
      .catch(() => setStaff([]))
      .finally(() => setLoading(false));
  }, [facilityId]);

  const overallStatus = staff.some((s) => s.status === 'critical') ? 'critical' :
    staff.some((s) => s.status === 'shortage') ? 'shortage' : 'ok';

  const badgeClass = overallStatus === 'ok' ? 'badge-ok' :
    overallStatus === 'shortage' ? 'badge-warning' : 'badge-critical';

  return (
    <div className="glass-card animate-in" id="staff-module">
      <div className="card-header">
        <span className="card-title">👥 Staff Roster</span>
        {staff.length > 0 && (
          <span className={`card-badge ${badgeClass}`}>{overallStatus}</span>
        )}
      </div>

      {loading && <div className="shimmer" style={{ height: 100 }} />}

      {!loading && staff.length === 0 && (
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>
          {facilityId ? 'No staff data' : 'Select a facility'}
        </p>
      )}

      {!loading && staff.map((s) => {
        const pct = s.required > 0 ? Math.round((s.available / s.required) * 100) : 0;
        return (
          <div className="progress-row" key={s.role}>
            <span className="progress-label">
              {ROLE_ICONS[s.role] || ''} {s.role.charAt(0).toUpperCase() + s.role.slice(1)}
            </span>
            <div className="progress-track">
              <div className="progress-fill" style={{
                width: `${Math.min(pct, 100)}%`,
                background: STATUS_COLORS[s.status],
              }} />
            </div>
            <span className="progress-value" style={{ color: STATUS_COLORS[s.status] }}>
              {s.available}/{s.required}
            </span>
          </div>
        );
      })}
    </div>
  );
}
