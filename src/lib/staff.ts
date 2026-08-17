/**
 * PulseGrid — Staff Engine
 *
 * Simple threshold rules:
 * deficit >= 2 → critical
 * deficit >= 1 → shortage
 */

import { getDb } from '@/db/connection';
import { STAFF_SHORTAGE_DEFICIT, STAFF_CRITICAL_DEFICIT } from '@/constants';

export interface StaffStatus {
  role: string;
  required: number;
  available: number;
  status: 'ok' | 'shortage' | 'critical';
}

export function getStaffStatus(facilityId: string): StaffStatus[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT role, required, available FROM staff_roster WHERE facilityId = ?
  `).all(facilityId) as { role: string; required: number; available: number }[];

  return rows.map(row => {
    const deficit = row.required - row.available;
    let status: 'ok' | 'shortage' | 'critical';

    if (deficit >= STAFF_CRITICAL_DEFICIT) {
      status = 'critical';
    } else if (deficit >= STAFF_SHORTAGE_DEFICIT) {
      status = 'shortage';
    } else {
      status = 'ok';
    }

    return { role: row.role, required: row.required, available: row.available, status };
  });
}
