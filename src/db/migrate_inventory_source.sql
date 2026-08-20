-- PulseGrid — Schema Migration: Authoritative Event-Sourced Inventory Layer
-- Run once against any existing pulsegrid.db to bring it up to the new schema.
--
-- Strategy: create the new table first, INSERT with CASE-remapped source values,
-- then drop the old table. We never UPDATE the old table (which has the legacy CHECK),
-- so the old constraint is never violated during migration.

PRAGMA foreign_keys = OFF;

-- 1. Create new table with authoritative CHECK constraints
CREATE TABLE IF NOT EXISTS inventory_events_new (
  id          TEXT PRIMARY KEY,
  facilityId  TEXT NOT NULL REFERENCES facilities(id),
  medicineId  TEXT NOT NULL REFERENCES medicines(id),
  type        TEXT NOT NULL CHECK (type IN ('RECEIVED', 'DISPENSED', 'TRANSFERRED_OUT', 'TRANSFERRED_IN', 'EXPIRED', 'DAMAGED')),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  timestamp   TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('MANUAL', 'OCR_INVOICE', 'VOICE_LOG', 'BARCODE', 'SIMULATION')),
  batchNumber TEXT,
  expiryDate  TEXT,
  notes       TEXT
);

-- 2. Copy rows, remapping legacy source values via CASE in the SELECT
INSERT INTO inventory_events_new
  SELECT
    id,
    facilityId,
    medicineId,
    type,
    quantity,
    timestamp,
    CASE UPPER(source)
      WHEN 'API'     THEN 'SIMULATION'
      WHEN 'BARCODE' THEN 'BARCODE'
      WHEN 'MANUAL'  THEN 'MANUAL'
      ELSE source
    END AS source,
    NULL AS batchNumber,
    NULL AS expiryDate,
    notes
  FROM inventory_events;

-- 3. Swap tables
DROP TABLE inventory_events;
ALTER TABLE inventory_events_new RENAME TO inventory_events;

PRAGMA foreign_keys = ON;

-- 4. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_inventory_facility          ON inventory_events(facilityId);
CREATE INDEX IF NOT EXISTS idx_inventory_medicine          ON inventory_events(medicineId);
CREATE INDEX IF NOT EXISTS idx_inventory_facility_medicine ON inventory_events(facilityId, medicineId);
CREATE INDEX IF NOT EXISTS idx_inventory_timestamp         ON inventory_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_inventory_type              ON inventory_events(type);

