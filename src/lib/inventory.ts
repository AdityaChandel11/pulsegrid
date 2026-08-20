/**
 * PulseGrid — Inventory Event Processing
 *
 * Derives current stock from the event-sourced inventory_events table
 * and produces daily dispensed series for forecasting.
 */

import { getDb } from '@/db/connection';
import { SimulationClock } from './clock';

const INFLOW_TYPES = ['RECEIVED', 'TRANSFERRED_IN'] as const;
const OUTFLOW_TYPES = ['DISPENSED', 'TRANSFERRED_OUT', 'EXPIRED', 'DAMAGED'] as const;

/**
 * Compute net current stock for a facility-medicine pair by summing
 * all inflow events and subtracting all outflow events.
 */
export function getCurrentStock(facilityId: string, medicineId: string): number {
  const db = getDb();

  const inflow = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS total
    FROM inventory_events
    WHERE facilityId = ? AND medicineId = ? AND type IN (${INFLOW_TYPES.map(() => '?').join(',')})
  `).get(facilityId, medicineId, ...INFLOW_TYPES) as { total: number };

  const outflow = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS total
    FROM inventory_events
    WHERE facilityId = ? AND medicineId = ? AND type IN (${OUTFLOW_TYPES.map(() => '?').join(',')})
  `).get(facilityId, medicineId, ...OUTFLOW_TYPES) as { total: number };

  return inflow.total - outflow.total;
}

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

  const rows = db.prepare(`
    SELECT DATE(timestamp) AS date, SUM(quantity) AS qty
    FROM inventory_events
    WHERE facilityId = ? AND medicineId = ? AND type = 'DISPENSED' AND timestamp >= ?
    GROUP BY DATE(timestamp)
    ORDER BY date ASC
  `).all(facilityId, medicineId, cutoffISO) as { date: string; qty: number }[];

  return rows;
}

/**
 * Get the most recent event source and timestamp for a facility-medicine pair.
 */
export function getLatestEventMeta(
  facilityId: string,
  medicineId: string,
): { source: 'api' | 'barcode' | 'manual'; timestamp: string } | null {
  const db = getDb();

  const row = db.prepare(`
    SELECT source, timestamp
    FROM inventory_events
    WHERE facilityId = ? AND medicineId = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(facilityId, medicineId) as { source: 'api' | 'barcode' | 'manual'; timestamp: string } | undefined;

  return row ?? null;
}

/**
 * Get all medicine IDs stocked at a facility (i.e. has any inventory events).
 */
export function getMedicineIdsAtFacility(facilityId: string): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT medicineId FROM inventory_events WHERE facilityId = ?
  `).all(facilityId) as { medicineId: string }[];
  return rows.map(r => r.medicineId);
}
