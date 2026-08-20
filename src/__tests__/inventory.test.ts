/**
 * PulseGrid — Authoritative Inventory & Operations Test Suite
 *
 * Verifies event-sourced integrity, safe transfer invariants, negative prevention,
 * batch/expiry tracking, simulation clock integration, and forecast recalculation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, initDb } from '../db/connection';
import {
  recordInventoryEvent,
  recordTransfer,
  deriveCurrentStock,
  InsufficientStockError,
  InvalidQuantityError,
  FacilityNotFoundError,
  MedicineNotFoundError,
} from '../services/inventoryService';
import { SimulationClock } from '../lib/clock';
import { computeForecast } from '../lib/forecast';
import { computeConfidence } from '../lib/confidence';
import type { InventoryEventSource } from '../types';

// Ensure DB is initialized before running tests
initDb();

test('1. Database seed integrity — facilities, medicines, events exist', () => {
  const db = getDb();
  const facCount = (db.prepare('SELECT COUNT(*) as count FROM facilities').get() as { count: number }).count;
  const medCount = (db.prepare('SELECT COUNT(*) as count FROM medicines').get() as { count: number }).count;
  const evCount = (db.prepare('SELECT COUNT(*) as count FROM inventory_events').get() as { count: number }).count;

  assert.ok(facCount > 0, 'Facilities table must contain records');
  assert.ok(medCount > 0, 'Medicines table must contain records');
  assert.ok(evCount > 0, 'Inventory events table must contain records');
});

test('2. Receive stock increases derived current stock', () => {
  const db = getDb();
  const fac = db.prepare('SELECT id FROM facilities LIMIT 1').get() as { id: string };
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  const initialStock = deriveCurrentStock(fac.id, med.id);
  const qtyToReceive = 150;

  const result = recordInventoryEvent({
    facilityId: fac.id,
    medicineId: med.id,
    eventType: 'RECEIVED',
    quantity: qtyToReceive,
    source: 'BARCODE',
    batchNumber: 'BT-TEST-001',
    expiryDate: '2028-12-31',
    notes: 'Unit test stock receive',
  });

  const updatedStock = deriveCurrentStock(fac.id, med.id);

  assert.equal(result.newStock, initialStock + qtyToReceive);
  assert.equal(updatedStock, initialStock + qtyToReceive);
});

test('3. Dispense stock decreases derived current stock', () => {
  const db = getDb();
  const fac = db.prepare('SELECT id FROM facilities LIMIT 1').get() as { id: string };
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  // First guarantee at least 50 units
  recordInventoryEvent({
    facilityId: fac.id,
    medicineId: med.id,
    eventType: 'RECEIVED',
    quantity: 50,
    source: 'MANUAL',
  });

  const stockBefore = deriveCurrentStock(fac.id, med.id);
  const qtyToDispense = 20;

  const result = recordInventoryEvent({
    facilityId: fac.id,
    medicineId: med.id,
    eventType: 'DISPENSED',
    quantity: qtyToDispense,
    source: 'MANUAL',
    notes: 'Unit test stock dispense',
  });

  const stockAfter = deriveCurrentStock(fac.id, med.id);

  assert.equal(result.newStock, stockBefore - qtyToDispense);
  assert.equal(stockAfter, stockBefore - qtyToDispense);
});

test('4. Dispensing more than available stock throws InsufficientStockError', () => {
  const db = getDb();
  const fac = db.prepare('SELECT id FROM facilities LIMIT 1').get() as { id: string };
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  const currentStock = deriveCurrentStock(fac.id, med.id);
  const excessiveQty = currentStock + 99999;

  assert.throws(
    () => {
      recordInventoryEvent({
        facilityId: fac.id,
        medicineId: med.id,
        eventType: 'DISPENSED',
        quantity: excessiveQty,
        source: 'MANUAL',
      });
    },
    (err: unknown) => {
      return err instanceof InsufficientStockError && err.code === 'INSUFFICIENT_STOCK';
    },
  );
});

test('5. Dual-sided transfer moves stock atomically between facilities', () => {
  const db = getDb();
  const facs = db.prepare('SELECT id FROM facilities LIMIT 2').all() as { id: string }[];
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  const donorId = facs[0].id;
  const recipientId = facs[1].id;

  // Ensure donor has stock
  recordInventoryEvent({
    facilityId: donorId,
    medicineId: med.id,
    eventType: 'RECEIVED',
    quantity: 100,
    source: 'MANUAL',
  });

  const donorBefore = deriveCurrentStock(donorId, med.id);
  const recipientBefore = deriveCurrentStock(recipientId, med.id);
  const transferQty = 30;

  const transferResult = recordTransfer({
    sourceFacilityId: donorId,
    destFacilityId: recipientId,
    medicineId: med.id,
    quantity: transferQty,
    source: 'MANUAL',
    notes: 'Test redistribution transfer',
  });

  const donorAfter = deriveCurrentStock(donorId, med.id);
  const recipientAfter = deriveCurrentStock(recipientId, med.id);

  assert.equal(donorAfter, donorBefore - transferQty);
  assert.equal(recipientAfter, recipientBefore + transferQty);
  assert.equal(transferResult.newStockAtSource, donorAfter);
  assert.equal(transferResult.newStockAtDestination, recipientAfter);
});

test('6. Transfer rejected when donor has insufficient stock', () => {
  const db = getDb();
  const facs = db.prepare('SELECT id FROM facilities LIMIT 2').all() as { id: string }[];
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  const donorId = facs[0].id;
  const recipientId = facs[1].id;

  const donorStock = deriveCurrentStock(donorId, med.id);

  assert.throws(
    () => {
      recordTransfer({
        sourceFacilityId: donorId,
        destFacilityId: recipientId,
        medicineId: med.id,
        quantity: donorStock + 50000,
      });
    },
    (err: unknown) => err instanceof InsufficientStockError,
  );
});

test('7. Negative quantity throws InvalidQuantityError', () => {
  const db = getDb();
  const fac = db.prepare('SELECT id FROM facilities LIMIT 1').get() as { id: string };
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  assert.throws(
    () => {
      recordInventoryEvent({
        facilityId: fac.id,
        medicineId: med.id,
        eventType: 'RECEIVED',
        quantity: -25,
        source: 'MANUAL',
      });
    },
    (err: unknown) => err instanceof InvalidQuantityError,
  );
});

test('8. Zero quantity throws InvalidQuantityError', () => {
  const db = getDb();
  const fac = db.prepare('SELECT id FROM facilities LIMIT 1').get() as { id: string };
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  assert.throws(
    () => {
      recordInventoryEvent({
        facilityId: fac.id,
        medicineId: med.id,
        eventType: 'RECEIVED',
        quantity: 0,
        source: 'MANUAL',
      });
    },
    (err: unknown) => err instanceof InvalidQuantityError,
  );
});

test('9. Invalid facility or medicine throws EntityNotFound error', () => {
  const db = getDb();
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  assert.throws(
    () => {
      recordInventoryEvent({
        facilityId: 'non_existent_facility_999',
        medicineId: med.id,
        eventType: 'RECEIVED',
        quantity: 10,
        source: 'MANUAL',
      });
    },
    (err: unknown) => err instanceof FacilityNotFoundError,
  );

  const fac = db.prepare('SELECT id FROM facilities LIMIT 1').get() as { id: string };
  assert.throws(
    () => {
      recordInventoryEvent({
        facilityId: fac.id,
        medicineId: 'non_existent_med_999',
        eventType: 'RECEIVED',
        quantity: 10,
        source: 'MANUAL',
      });
    },
    (err: unknown) => err instanceof MedicineNotFoundError,
  );
});

test('10. Batch number and Expiry Date are persisted on RECEIVED events', () => {
  const db = getDb();
  const fac = db.prepare('SELECT id FROM facilities LIMIT 1').get() as { id: string };
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  const batch = 'BT-TEST-BATCH-777';
  const expiry = '2029-05-15';

  const res = recordInventoryEvent({
    facilityId: fac.id,
    medicineId: med.id,
    eventType: 'RECEIVED',
    quantity: 40,
    source: 'OCR_INVOICE',
    batchNumber: batch,
    expiryDate: expiry,
    notes: 'Invoice OCR lot test',
  });

  const row = db
    .prepare('SELECT batchNumber, expiryDate, source FROM inventory_events WHERE id = ?')
    .get(res.id) as { batchNumber: string; expiryDate: string; source: string };

  assert.equal(row.batchNumber, batch);
  assert.equal(row.expiryDate, expiry);
  assert.equal(row.source, 'OCR_INVOICE');
});

test('11. EXPIRED event decreases stock without going negative', () => {
  const db = getDb();
  const fac = db.prepare('SELECT id FROM facilities LIMIT 1').get() as { id: string };
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  // Guarantee stock
  recordInventoryEvent({
    facilityId: fac.id,
    medicineId: med.id,
    eventType: 'RECEIVED',
    quantity: 25,
    source: 'MANUAL',
  });

  const stockBefore = deriveCurrentStock(fac.id, med.id);

  recordInventoryEvent({
    facilityId: fac.id,
    medicineId: med.id,
    eventType: 'EXPIRED',
    quantity: 10,
    source: 'MANUAL',
    notes: 'Quarantined expired lots',
  });

  const stockAfter = deriveCurrentStock(fac.id, med.id);
  assert.equal(stockAfter, stockBefore - 10);
});

test('12. SimulationClock advances deterministically via tick()', () => {
  const initialISO = SimulationClock.getISO();
  const initialTime = new Date(initialISO).getTime();

  // Tick by 1 simulation day (86400000 ms)
  const newDate = SimulationClock.tick(86400000);
  const newTime = newDate.getTime();

  assert.equal(newTime - initialTime, 86400000);
});

test('13. Forecast and confidence recalculate after new inventory events', () => {
  const db = getDb();
  const fac = db.prepare('SELECT id FROM facilities LIMIT 1').get() as { id: string };
  const med = db.prepare('SELECT id FROM medicines LIMIT 1').get() as { id: string };

  const fcBefore = computeForecast(fac.id, med.id);

  // Ingest large supply batch
  recordInventoryEvent({
    facilityId: fac.id,
    medicineId: med.id,
    eventType: 'RECEIVED',
    quantity: 1000,
    source: 'BARCODE',
  });

  const fcAfter = computeForecast(fac.id, med.id);
  assert.ok(fcAfter.p50Days >= fcBefore.p50Days, 'P50 days must increase or stay stable after receiving large stock');

  const conf = computeConfidence({
    source: 'BARCODE',
    lastEventTimestamp: SimulationClock.getISO(),
    p10Days: fcAfter.p10Days,
    p50Days: fcAfter.p50Days,
    p90Days: fcAfter.p90Days,
    facilityId: fac.id,
  });

  assert.ok(conf >= 0 && conf <= 100, 'Confidence must be between 0 and 100');
});

test('14. Canonical source enum enforcement — only uppercase valid sources exist in DB', () => {
  const db = getDb();
  const sources = db
    .prepare('SELECT DISTINCT source FROM inventory_events')
    .all() as { source: string }[];

  const validSet = new Set<InventoryEventSource>([
    'MANUAL',
    'OCR_INVOICE',
    'VOICE_LOG',
    'BARCODE',
    'SIMULATION',
  ]);

  for (const s of sources) {
    assert.ok(
      validSet.has(s.source as InventoryEventSource),
      `Source "${s.source}" must be one of the canonical uppercase values`,
    );
  }
});
