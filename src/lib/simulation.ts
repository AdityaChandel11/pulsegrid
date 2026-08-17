/**
 * PulseGrid — Live Demo Simulation Engine
 *
 * Generates continuous deterministic hospital inventory events (RECEIVED, DISPENSED)
 * and updates predictions and stock levels in real time in SQLite.
 */

import { getDb } from '@/db/connection';
import { computeForecast } from './forecast';
import { computeConfidence } from './confidence';
import { getLatestEventMeta } from './inventory';
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

export function stepSimulation(
  country: Country,
  scenario: 'normal' | 'surge' = 'normal',
): SimulationTickResult {
  const db = getDb();
  const now = new Date();
  const timestamp = now.toISOString();

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

  // If surge scenario, designate one primary surge facility
  const surgeFacilityId = scenario === 'surge' ? shuffledFacilities[0].id : null;

  for (const fac of shuffledFacilities) {
    // Pick 2-4 medicines per facility
    const medCount = Math.min(medicines.length, Math.floor(Math.random() * 3) + 2);
    const selectedMeds = [...medicines].sort(() => Math.random() - 0.5).slice(0, medCount);

    for (const med of selectedMeds) {
      const isSurgeTarget = fac.id === surgeFacilityId;
      const pairKey = `${fac.id}::${med.id}`;
      affectedPairs.add(pairKey);

      // Determine dispense quantity
      let dispensedQty: number;
      if (isSurgeTarget) {
        // High surge burst: 45 - 90 units
        dispensedQty = Math.floor(Math.random() * 46) + 45;
      } else if (scenario === 'surge') {
        // Elevated demand: 15 - 35 units
        dispensedQty = Math.floor(Math.random() * 21) + 15;
      } else {
        // Normal demand: 4 - 18 units
        dispensedQty = Math.floor(Math.random() * 15) + 4;
      }

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
        notes: isSurgeTarget ? 'Surge patient influx consumption' : 'Routine clinic dispensary log',
      });

      // 15% chance of supplier batch replenishment if normal, or emergency restock
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

        // Compute future dates
        const p10Date = new Date(now.getTime() + forecast.p10Days * 86400000).toISOString().split('T')[0];
        const p50Date = new Date(now.getTime() + forecast.p50Days * 86400000).toISOString().split('T')[0];
        const p90Date = new Date(now.getTime() + forecast.p90Days * 86400000).toISOString().split('T')[0];

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
