// PulseGrid — Shared Constants & Config
// Used by both backend and frontend.

export const COUNTRIES = ['india', 'brazil', 'south_africa'] as const;
export type Country = (typeof COUNTRIES)[number];

export const FACILITY_TYPES = ['PHC', 'CHC', 'district'] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export const INVENTORY_EVENT_TYPES = [
  'RECEIVED', 'DISPENSED', 'TRANSFERRED_OUT', 'TRANSFERRED_IN', 'EXPIRED', 'DAMAGED',
] as const;

export const EVENT_SOURCES = ['MANUAL', 'OCR_INVOICE', 'VOICE_LOG', 'BARCODE', 'SIMULATION'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const STAFF_ROLES = ['doctor', 'nurse', 'pharmacist'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// ---------- Threshold constants ----------

/** Bed occupancy thresholds */
export const BED_WARNING_THRESHOLD = 0.90;
export const BED_CRITICAL_THRESHOLD = 1.00;

/** Staff deficit thresholds */
export const STAFF_SHORTAGE_DEFICIT = 1;
export const STAFF_CRITICAL_DEFICIT = 2;

/** Source weight for confidence scoring */
export const SOURCE_WEIGHTS: Record<EventSource, number> = {
  BARCODE:    0.95,  // highest fidelity — hardware scan
  OCR_INVOICE: 0.85, // structured document extraction
  MANUAL:     0.65,  // human entry, prone to error
  VOICE_LOG:  0.60,  // transcription artefacts possible
  SIMULATION: 0.70,  // stochastic model — no real-world verification
};

/** Recency decay parameters */
export const RECENCY_DECAY_HALF_LIFE_HOURS = 24;
export const RECENCY_DECAY_FLOOR = 0.1;
export const RECENCY_DECAY_MAX_HOURS = 96;

/** Surge detection */
export const SURGE_ZSCORE_THRESHOLD = 2.5;
export const SURGE_CONSECUTIVE_DAYS = 2;
export const SURGE_BASELINE_WINDOW_DAYS = 3; // shortened window during surge
export const NORMAL_BASELINE_WINDOW_DAYS = 14;

/** Redistribution */
export const REDISTRIBUTION_MIN_CONFIDENCE = 60;

/** Monte Carlo simulation */
export const MONTE_CARLO_PATHS = 300;
export const MONTE_CARLO_SEED = 42;

/** Forecasting windows */
export const FORECAST_HISTORY_DAYS = 45;
export const TREND_WINDOW_DAYS = 7;

/** Default safety stock */
export const DEFAULT_SAFETY_STOCK_DAYS = 14;

/** Seed data parameters */
export const SEED_FACILITIES_PER_COUNTRY = { india: 18, brazil: 16, south_africa: 15 };
export const SEED_MEDICINES_COUNT = 12;
export const SEED_HISTORY_DAYS = 45;
export const SEED_SURGE_PAIRS_PER_COUNTRY = 2;
