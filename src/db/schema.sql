-- PulseGrid — SQLite Schema
-- Matches the interfaces in /src/types.ts exactly.

CREATE TABLE IF NOT EXISTS facilities (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  country         TEXT NOT NULL CHECK (country IN ('india', 'brazil', 'south_africa')),
  district        TEXT NOT NULL,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('PHC', 'CHC', 'district')),
  safetyStockDays INTEGER NOT NULL DEFAULT 14
);

CREATE TABLE IF NOT EXISTS medicines (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL,
  unit     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_events (
  id           TEXT PRIMARY KEY,
  facilityId   TEXT NOT NULL REFERENCES facilities(id),
  medicineId   TEXT NOT NULL REFERENCES medicines(id),
  type         TEXT NOT NULL CHECK (type IN ('RECEIVED', 'DISPENSED', 'TRANSFERRED_OUT', 'TRANSFERRED_IN', 'EXPIRED', 'DAMAGED')),
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  timestamp    TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('MANUAL', 'OCR_INVOICE', 'VOICE_LOG', 'BARCODE', 'SIMULATION')),
  batchNumber  TEXT,
  expiryDate   TEXT,
  notes        TEXT
);

CREATE TABLE IF NOT EXISTS beds (
  facilityId TEXT NOT NULL REFERENCES facilities(id),
  ward       TEXT NOT NULL,
  total      INTEGER NOT NULL,
  occupied   INTEGER NOT NULL,
  updatedAt  TEXT NOT NULL,
  PRIMARY KEY (facilityId, ward)
);

CREATE TABLE IF NOT EXISTS staff_roster (
  facilityId TEXT NOT NULL REFERENCES facilities(id),
  role       TEXT NOT NULL CHECK (role IN ('doctor', 'nurse', 'pharmacist')),
  required   INTEGER NOT NULL,
  available  INTEGER NOT NULL,
  updatedAt  TEXT NOT NULL,
  PRIMARY KEY (facilityId, role)
);

CREATE TABLE IF NOT EXISTS predictions (
  id                 TEXT PRIMARY KEY,
  facilityId         TEXT NOT NULL REFERENCES facilities(id),
  medicineId         TEXT NOT NULL REFERENCES medicines(id),
  p10Date            TEXT NOT NULL,
  p50Date            TEXT NOT NULL,
  p90Date            TEXT NOT NULL,
  confidenceScore    INTEGER NOT NULL,
  surgeFlag          INTEGER NOT NULL DEFAULT 0,
  createdAt          TEXT NOT NULL,
  resolvedActualDate TEXT
);

CREATE TABLE IF NOT EXISTS country_signals (
  country          TEXT NOT NULL CHECK (country IN ('india', 'brazil', 'south_africa')),
  medicineCategory TEXT NOT NULL,
  demandTrendIndex REAL NOT NULL,
  surgeActive      INTEGER NOT NULL DEFAULT 0,
  timestamp        TEXT NOT NULL,
  PRIMARY KEY (country, medicineCategory, timestamp)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_inventory_facility ON inventory_events(facilityId);
CREATE INDEX IF NOT EXISTS idx_inventory_medicine ON inventory_events(medicineId);
CREATE INDEX IF NOT EXISTS idx_inventory_facility_medicine ON inventory_events(facilityId, medicineId);
CREATE INDEX IF NOT EXISTS idx_inventory_timestamp ON inventory_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory_events(type);
CREATE INDEX IF NOT EXISTS idx_predictions_facility ON predictions(facilityId);
CREATE INDEX IF NOT EXISTS idx_predictions_facility_medicine ON predictions(facilityId, medicineId);
CREATE INDEX IF NOT EXISTS idx_facilities_country ON facilities(country);
CREATE INDEX IF NOT EXISTS idx_country_signals_country ON country_signals(country);
