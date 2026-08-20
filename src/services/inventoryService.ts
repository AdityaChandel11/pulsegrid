/**
 * PulseGrid — Authoritative Inventory Service
 *
 * Single transactional pipeline for ALL inventory event intake paths.
 * Every intake method (Manual, OCR/Invoice, Voice, Barcode, Simulation)
 * MUST call `recordInventoryEvent()`. No direct inserts into inventory_events
 * are permitted outside this module.
 *
 * Invariants enforced atomically inside a SQLite transaction:
 *   1. quantity > 0
 *   2. facility and medicine must exist
 *   3. Outflow events (DISPENSED, TRANSFERRED_OUT, EXPIRED, DAMAGED) are
 *      rejected when quantity > current_stock  →  throws InsufficientStockError
 *
 * Stock formula (event-sourced, no cache):
 *   stock = Σ(RECEIVED + TRANSFERRED_IN) − Σ(DISPENSED + TRANSFERRED_OUT + EXPIRED + DAMAGED)
 */

import { getDb } from '@/db/connection';
import type { InventoryEventType, InventoryEventSource } from '@/types';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK' as const;
  constructor(
    public readonly facilityId: string,
    public readonly medicineId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `Insufficient stock for medicine "${medicineId}" at facility "${facilityId}": ` +
        `requested ${requested}, available ${available}.`,
    );
    this.name = 'InsufficientStockError';
  }
}

export class InvalidQuantityError extends Error {
  readonly code = 'INVALID_QUANTITY' as const;
  constructor(quantity: number) {
    super(`Invalid quantity: ${quantity}. Must be a positive integer.`);
    this.name = 'InvalidQuantityError';
  }
}

export class FacilityNotFoundError extends Error {
  readonly code = 'FACILITY_NOT_FOUND' as const;
  constructor(facilityId: string) {
    super(`Facility "${facilityId}" not found.`);
    this.name = 'FacilityNotFoundError';
  }
}

export class MedicineNotFoundError extends Error {
  readonly code = 'MEDICINE_NOT_FOUND' as const;
  constructor(medicineId: string) {
    super(`Medicine "${medicineId}" not found.`);
    this.name = 'MedicineNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Input DTO — unified contract for all intake adapters
// ---------------------------------------------------------------------------

export interface CreateInventoryEventInput {
  facilityId: string;
  medicineId: string;
  eventType: InventoryEventType;
  quantity: number;
  /** One of the canonical source identifiers. All intake paths must supply this. */
  source: InventoryEventSource;
  /** ISO 8601. Defaults to SimulationClock.getISO() when omitted. */
  timestamp?: string;
  /** Lot / batch identifier — required for OCR and barcode intake where available. */
  batchNumber?: string;
  /** ISO 8601 date (YYYY-MM-DD). Expiry date of the stock unit being recorded. */
  expiryDate?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const OUTFLOW_TYPES = new Set<InventoryEventType>([
  'DISPENSED',
  'TRANSFERRED_OUT',
  'EXPIRED',
  'DAMAGED',
]);

// ---------------------------------------------------------------------------
// Stock derivation (no cache — always computed from the event ledger)
// ---------------------------------------------------------------------------

/**
 * Compute net stock for a facility-medicine pair directly from the event ledger.
 * This is the single authoritative stock computation; do not duplicate it.
 */
export function deriveCurrentStock(facilityId: string, medicineId: string): number {
  const db = getDb();

  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type IN ('RECEIVED','TRANSFERRED_IN') THEN quantity ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type IN ('DISPENSED','TRANSFERRED_OUT','EXPIRED','DAMAGED') THEN quantity ELSE 0 END), 0)
         AS net
       FROM inventory_events
       WHERE facilityId = ? AND medicineId = ?`,
    )
    .get(facilityId, medicineId) as { net: number };

  return row.net;
}

// ---------------------------------------------------------------------------
// Core ingestion function — the single entry point for all intake adapters
// ---------------------------------------------------------------------------

/**
 * Validate and commit one inventory event atomically.
 *
 * All intake paths (Manual, OCR_INVOICE, VOICE_LOG, BARCODE, SIMULATION)
 * MUST call this function. Direct inserts into `inventory_events` are forbidden.
 *
 * @throws {InvalidQuantityError}      quantity ≤ 0
 * @throws {FacilityNotFoundError}     facility does not exist
 * @throws {MedicineNotFoundError}     medicine does not exist
 * @throws {InsufficientStockError}    outflow quantity exceeds current stock
 */
export function recordInventoryEvent(
  input: CreateInventoryEventInput,
): { id: string; newStock: number } {
  const { facilityId, medicineId, eventType, quantity, source } = input;

  // --- Invariant 1: positive integer quantity ---
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new InvalidQuantityError(quantity);
  }

  const db = getDb();

  // --- Invariant 2: entity existence ---
  const facilityExists = db
    .prepare('SELECT 1 FROM facilities WHERE id = ?')
    .get(facilityId) as { 1: number } | undefined;
  if (!facilityExists) throw new FacilityNotFoundError(facilityId);

  const medicineExists = db
    .prepare('SELECT 1 FROM medicines WHERE id = ?')
    .get(medicineId) as { 1: number } | undefined;
  if (!medicineExists) throw new MedicineNotFoundError(medicineId);

  // All validation + insert runs inside a single SQLite transaction so the
  // stock check and the insert are atomic.
  const txn = db.transaction((): { id: string; newStock: number } => {
    // --- Invariant 3: outflow stock check (inside transaction for atomicity) ---
    if (OUTFLOW_TYPES.has(eventType)) {
      const currentStock = deriveCurrentStock(facilityId, medicineId);
      if (quantity > currentStock) {
        throw new InsufficientStockError(facilityId, medicineId, quantity, currentStock);
      }
    }

    const id = crypto.randomUUID();
    const timestamp = input.timestamp ?? new Date().toISOString();

    db.prepare(
      `INSERT INTO inventory_events
         (id, facilityId, medicineId, type, quantity, timestamp, source, batchNumber, expiryDate, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      facilityId,
      medicineId,
      eventType,
      quantity,
      timestamp,
      source,
      input.batchNumber ?? null,
      input.expiryDate ?? null,
      input.notes ?? null,
    );

    const newStock = deriveCurrentStock(facilityId, medicineId);
    return { id, newStock };
  });

  return txn();
}

// ---------------------------------------------------------------------------
// Atomic Transfer Ingestion — dual-sided transfer pipeline
// ---------------------------------------------------------------------------

export interface TransferInventoryInput {
  sourceFacilityId: string;
  destFacilityId: string;
  medicineId: string;
  quantity: number;
  /** Defaults to 'MANUAL' (human-approved transfer). */
  source?: InventoryEventSource;
  /** ISO 8601 timestamp. Defaults to now. */
  timestamp?: string;
  notes?: string;
}

/**
 * Execute an atomic dual-sided inventory transfer between two facilities.
 * Emits TRANSFERRED_OUT at donor facility and TRANSFERRED_IN at recipient facility.
 * Rejects if donor has insufficient stock or invalid quantity/facility/medicine.
 * Atomically commits or rolls back both sides.
 */
export function recordTransfer(input: TransferInventoryInput): {
  outflowEventId: string;
  inflowEventId: string;
  newStockAtSource: number;
  newStockAtDestination: number;
} {
  const { sourceFacilityId, destFacilityId, medicineId, quantity } = input;
  const source = input.source ?? 'MANUAL';
  const timestamp = input.timestamp ?? new Date().toISOString();

  const db = getDb();
  const txn = db.transaction((): {
    outflowEventId: string;
    inflowEventId: string;
    newStockAtSource: number;
    newStockAtDestination: number;
  } => {
    const outflow = recordInventoryEvent({
      facilityId: sourceFacilityId,
      medicineId,
      eventType: 'TRANSFERRED_OUT',
      quantity,
      timestamp,
      source,
      notes: input.notes ?? `Transfer to ${destFacilityId}`,
    });

    const inflow = recordInventoryEvent({
      facilityId: destFacilityId,
      medicineId,
      eventType: 'TRANSFERRED_IN',
      quantity,
      timestamp,
      source,
      notes: input.notes ?? `Transfer from ${sourceFacilityId}`,
    });

    return {
      outflowEventId: outflow.id,
      inflowEventId: inflow.id,
      newStockAtSource: outflow.newStock,
      newStockAtDestination: inflow.newStock,
    };
  });

  return txn();
}

