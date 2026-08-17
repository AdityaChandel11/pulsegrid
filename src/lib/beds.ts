/**
 * PulseGrid — Beds Engine
 *
 * Simple threshold rules:
 * occupancy >= 90% → warning
 * occupancy >= 100% → critical
 */

import { getDb } from '@/db/connection';
import { BED_WARNING_THRESHOLD, BED_CRITICAL_THRESHOLD } from '@/constants';

export interface BedStatus {
  ward: string;
  total: number;
  occupied: number;
  status: 'normal' | 'warning' | 'critical';
}

export function getBedStatus(facilityId: string): BedStatus[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT ward, total, occupied FROM beds WHERE facilityId = ?
  `).all(facilityId) as { ward: string; total: number; occupied: number }[];

  return rows.map(row => {
    const occupancyRate = row.total > 0 ? row.occupied / row.total : 0;
    let status: 'normal' | 'warning' | 'critical';

    if (occupancyRate >= BED_CRITICAL_THRESHOLD) {
      status = 'critical';
    } else if (occupancyRate >= BED_WARNING_THRESHOLD) {
      status = 'warning';
    } else {
      status = 'normal';
    }

    return { ward: row.ward, total: row.total, occupied: row.occupied, status };
  });
}
