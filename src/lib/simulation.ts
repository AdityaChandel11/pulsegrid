/**
 * PulseGrid — Live Demo Simulation Engine
 *
 * Generates continuous stochastic hospital inventory events (RECEIVED, DISPENSED)
 * using Poisson distribution, multi-day sustained surges, decoupled SimulationClock,
 * and prediction validation on stockout.
 */

import { getDb } from '@/db/connection';
import { computeForecast } from './forecast';
import { computeConfidence } from './confidence';
import { getLatestEventMeta, getCurrentStock } from './inventory';
import { validatePredictionOnStockout } from './predictions';
import { SimulationClock } from './clock';
import type { InventoryEvent, InventoryEventType } from '@/types';
import type { Country } from '@/constants';

interface SimulationTickResult {
  country: Country;
  scenario: 'normal' | 'surge';
  eventsGenerated: number;
  updatedPairs: number;
  activeSurges: number;
  timestamp: string;
}

interface ActiveSurge {
  facilityId: string;
  multiplier: number; // 3.0 to 5.0
  remainingDays: number; // 3 to 7 days
}

// Active multi-day surges keyed by facilityId
const activeSurgesMap = new Map<string, ActiveSurge>();

/**
 * Sample from a Poisson distribution with parameter lambda (mean consumption).
 * Uses Knuth's algorithm for lambda < 30 and Gaussian approximation for large lambda.
 */
export function samplePoisson(lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    return Math.max(0, k - 1);
  }
  // Gaussian approximation for large lambda: N(lambda, sqrt(lambda))
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(lambda + z * Math.sqrt(lambda)));
}

/**
 * Obtain baseline consumption rate for a facility-medicine pair.
 */
function getFacilityMedicineBaseline(facilityId: string, medicineId: string, facilityType: string): number {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT AVG(daily_sum) AS avg_daily
      FROM (
        SELECT DATE(timestamp) as d, SUM(quantity) as daily_sum
        FROM inventory_events
        WHERE facilityId = ? AND medicineId = ? AND type = 'DISPENSED'
        GROUP BY DATE(timestamp)
      )
    `).get(facilityId, medicineId) as { avg_daily: number | null } | undefined;

    if (row?.avg_daily && row.avg_daily > 0) {
      return row.avg_daily;
    }
  } catch {
    // Fall back to facility type defaults
  }

  if (facilityType === 'district') return 45;
  if (facilityType === 'CHC') return 25;
  return 12;
}

export function stepSimulation(
  country: Country,
  scenario: 'normal' | 'surge' = 'normal',
): SimulationTickResult {
  const db = getDb();

  // Tick the logical simulation clock forward by 1 simulation day (86400000 ms)
  const clockNow = SimulationClock.tick(86400000);
  const timestamp = clockNow.toISOString();
  const dateString = clockNow.toISOString().split('T')[0];

  // Get facilities in this country
  const facilities = db.prepare('SELECT id, name, type FROM facilities WHERE country = ?').all(country) as {
    id: string;
    name: string;
    type: string;
  }[];

  if (facilities.length === 0) {
    return {
      country,
      scenario,
      eventsGenerated: 0,
      updatedPairs: 0,
      activeSurges: 0,
      timestamp,
    };
  }

  // Get medicines
  const medicines = db.prepare('SELECT id, name, category FROM medicines').all() as {
    id: string;
    name: string;
    category: string;
  }[];

  const newEvents: InventoryEvent[] = [];
  const affectedPairs = new Set<string>();

  // Pick a subset of facilities for this tick (3-6 facilities active per tick)
  const activeCount = Math.min(facilities.length, Math.floor(Math.random() * 4) + 3);
  const shuffledFacilities = [...facilities].sort(() => Math.random() - 0.5).slice(0, activeCount);

  // Multi-day surge management: if surge scenario, initiate or sustain a multi-day surge (3x-5x for 3-7 days)
  if (scenario === 'surge') {
    const targetFac = shuffledFacilities[0];
    if (!activeSurgesMap.has(targetFac.id)) {
      const multiplier = Math.round((3.0 + Math.random() * 2.0) * 10) / 10; // 3.0x to 5.0x
      const duration = Math.floor(Math.random() * 5) + 3; // 3 to 7 days
      activeSurgesMap.set(targetFac.id, {
        facilityId: targetFac.id,
        multiplier,
        remainingDays: duration,
      });
    }
  }

  for (const fac of shuffledFacilities) {
    // Pick 2-4 medicines per facility
    const medCount = Math.min(medicines.length, Math.floor(Math.random() * 3) + 2);
    const selectedMeds = [...medicines].sort(() => Math.random() - 0.5).slice(0, medCount);

    const activeSurge = activeSurgesMap.get(fac.id);
    const isSurgeTarget = Boolean(activeSurge);

    for (const med of selectedMeds) {
      const pairKey = `${fac.id}::${med.id}`;
      affectedPairs.add(pairKey);

      // Baseline consumption rate
      const baselineRate = getFacilityMedicineBaseline(fac.id, med.id, fac.type);

      // Apply surge multiplier if active surge is on this facility
      let lambda = baselineRate;
      if (activeSurge) {
        lambda *= activeSurge.multiplier;
      }

      // True stochastic Poisson sampling
      const dispensedQty = Math.max(1, samplePoisson(lambda));

      const sources: ('api' | 'barcode' | 'manual')[] = ['barcode', 'barcode', 'api', 'manual'];
      const source = sources[Math.floor(Math.random() * sources.length)];

      newEvents.push({
        id: crypto.randomUUID(),
        facilityId: fac.id,
        medicineId: med.id,
        type: 'DISPENSED',
        quantity: dispensedQty,
        timestamp,
        source,
        notes: isSurgeTarget
          ? `Multi-day surge (${activeSurge!.multiplier}x demand, ${activeSurge!.remainingDays}d remaining)`
          : 'Routine dispensary log',
      });

      // 15% chance of supplier replenishment
      if (Math.random() < 0.15) {
        const receivedQty = Math.floor(Math.random() * 200) + 100;
        newEvents.push({
          id: crypto.randomUUID(),
          facilityId: fac.id,
          medicineId: med.id,
          type: 'RECEIVED' as InventoryEventType,
          quantity: receivedQty,
          timestamp,
          source: 'api',
          notes: 'Warehouse batch delivery arrived',
        });
      }
    }
  }

  // Decrement remaining days for all active multi-day surges
  for (const [facId, surge] of activeSurgesMap.entries()) {
    surge.remainingDays -= 1;
    if (surge.remainingDays <= 0) {
      activeSurgesMap.delete(facId);
    }
  }

  // Insert events within a SQLite transaction
  const insertEvent = db.prepare(`
    INSERT INTO inventory_events (id, facilityId, medicineId, type, quantity, timestamp, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTxn = db.transaction((events: InventoryEvent[]) => {
    for (const e of events) {
      insertEvent.run(e.id, e.facilityId, e.medicineId, e.type, e.quantity, e.timestamp, e.source, e.notes ?? null);
    }
  });

  insertTxn(newEvents);

  // Prediction validation loop: if stock hits 0, validate most recent prediction against actual stockout date
  for (const pairKey of affectedPairs) {
    const [facId, medId] = pairKey.split('::');
    const currentStock = getCurrentStock(facId, medId);
    if (currentStock <= 0) {
      validatePredictionOnStockout(facId, medId, dateString);
    }
  }

  // Recalculate predictions for affected facility-medicine pairs
  const upsertPrediction = db.prepare(`
    INSERT INTO predictions (id, facilityId, medicineId, p10Date, p50Date, p90Date, confidenceScore, surgeFlag, createdAt, resolvedActualDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      p10Date = excluded.p10Date,
      p50Date = excluded.p50Date,
      p90Date = excluded.p90Date,
      confidenceScore = excluded.confidenceScore,
      surgeFlag = excluded.surgeFlag,
      createdAt = excluded.createdAt
  `);

  const predTxn = db.transaction(() => {
    for (const pairKey of affectedPairs) {
      const [facId, medId] = pairKey.split('::');
      try {
        const forecast = computeForecast(facId, medId);
        const meta = getLatestEventMeta(facId, medId);
        const src = meta?.source ?? 'barcode';
        const lastUpdated = meta?.timestamp ?? timestamp;

        const confidence = computeConfidence({
          source: src,
          lastEventTimestamp: lastUpdated,
          p10Days: forecast.p10Days,
          p50Days: forecast.p50Days,
          p90Days: forecast.p90Days,
          facilityId: facId,
        });

        // Compute future dates based on logical simulation clock
        const p10Date = new Date(clockNow.getTime() + forecast.p10Days * 86400000).toISOString().split('T')[0];
        const p50Date = new Date(clockNow.getTime() + forecast.p50Days * 86400000).toISOString().split('T')[0];
        const p90Date = new Date(clockNow.getTime() + forecast.p90Days * 86400000).toISOString().split('T')[0];

        // Find existing prediction ID or generate new
        const existing = db.prepare(
          'SELECT id FROM predictions WHERE facilityId = ? AND medicineId = ? ORDER BY createdAt DESC LIMIT 1'
        ).get(facId, medId) as { id: string } | undefined;

        const predId = existing?.id ?? crypto.randomUUID();

        upsertPrediction.run(
          predId,
          facId,
          medId,
          p10Date,
          p50Date,
          p90Date,
          confidence,
          forecast.surgeFlag ? 1 : 0,
          timestamp,
        );
      } catch {
        // Ignore single pair prediction computation errors
      }
    }
  });

  predTxn();

  // Get active surges count
  const surgeRow = db.prepare(`
    SELECT COUNT(DISTINCT facilityId) as count
    FROM predictions p
    JOIN facilities f ON f.id = p.facilityId
    WHERE f.country = ? AND p.surgeFlag = 1
  `).get(country) as { count: number };

  return {
    country,
    scenario,
    eventsGenerated: newEvents.length,
    updatedPairs: affectedPairs.size,
    activeSurges: surgeRow.count,
    timestamp,
  };
}
