/**
 * PulseGrid — Inventory Query Helpers
 *
 * READ-ONLY helpers used by forecast, redistribution, and confidence modules.
 * Stock computation is delegated to inventoryService.deriveCurrentStock — the
 * single authoritative implementation. Do not add another stock formula here.
 *
 * For WRITING events, always use inventoryService.recordInventoryEvent().
 */

import { getDb } from '@/db/connection';
import { SimulationClock } from './clock';
import { deriveCurrentStock } from '@/services/inventoryService';
import type { InventoryEventSource } from '@/types';

// Re-export so existing callers (forecast, redistribution, simulation) keep working.
export { deriveCurrentStock as getCurrentStock };

/**
 * Aggregate DISPENSED events into a daily series (most recent `days` days).
 * Returns array of { date: 'YYYY-MM-DD', qty: number } sorted oldest→newest.
 */
export function getDailyDispensedSeries(
  facilityId: string,
  medicineId: string,
  days: number,
): { date: string; qty: number }[] {
  const db = getDb();

  const cutoff = SimulationClock.now();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString();

  const rows = db
    .prepare(
      `SELECT DATE(timestamp) AS date, SUM(quantity) AS qty
       FROM inventory_events
       WHERE facilityId = ? AND medicineId = ? AND type = 'DISPENSED' AND timestamp >= ?
       GROUP BY DATE(timestamp)
       ORDER BY date ASC`,
    )
    .all(facilityId, medicineId, cutoffISO) as { date: string; qty: number }[];

  return rows;
}

/**
 * Get the most recent event source and timestamp for a facility-medicine pair.
 */
export function getLatestEventMeta(
  facilityId: string,
  medicineId: string,
): { source: InventoryEventSource; timestamp: string } | null {
  const db = getDb();

  const row = db
    .prepare(
      `SELECT source, timestamp
       FROM inventory_events
       WHERE facilityId = ? AND medicineId = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
    )
    .get(facilityId, medicineId) as
    | { source: InventoryEventSource; timestamp: string }
    | undefined;

  return row ?? null;
}

/**
 * Get all medicine IDs stocked at a facility (i.e. has any inventory events).
 */
export function getMedicineIdsAtFacility(facilityId: string): string[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT DISTINCT medicineId FROM inventory_events WHERE facilityId = ?')
    .all(facilityId) as { medicineId: string }[];
  return rows.map(r => r.medicineId);
}
