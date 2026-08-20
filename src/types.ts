// PulseGrid — Shared Interface Contract
// Give this file, verbatim, to every account/module before any other code is written.
// Nobody implements against anything not defined here without updating this file first
// and re-sharing it with the other accounts.

// ---------- Core data shapes ----------

export interface Facility {
  id: string;
  name: string;
  country: 'india' | 'brazil' | 'south_africa';
  district: string;
  lat: number;
  lng: number;
  type: 'PHC' | 'CHC' | 'district';
  safetyStockDays: number;
}

export interface Medicine {
  id: string;
  name: string;
  category: string;
  unit: string; // e.g. "tablets", "vials", "units"
}

export type InventoryEventType =
  | 'RECEIVED' | 'DISPENSED' | 'TRANSFERRED_OUT' | 'TRANSFERRED_IN' | 'EXPIRED' | 'DAMAGED';

/** Canonical intake-source enum — every path through the system must use one of these. */
export type InventoryEventSource =
  | 'MANUAL'
  | 'OCR_INVOICE'
  | 'VOICE_LOG'
  | 'BARCODE'
  | 'SIMULATION';

export interface InventoryEvent {
  id: string;
  facilityId: string;
  medicineId: string;
  type: InventoryEventType;
  quantity: number;
  timestamp: string;        // ISO 8601
  source: InventoryEventSource;
  batchNumber?: string;     // optional — used by OCR / barcode intake
  expiryDate?: string;      // ISO 8601 date — used by barcode / OCR intake
  notes?: string;
}

export interface Bed {
  facilityId: string;
  ward: string;
  total: number;
  occupied: number;
  updatedAt: string;
}

export interface StaffRosterEntry {
  facilityId: string;
  role: 'doctor' | 'nurse' | 'pharmacist';
  required: number;
  available: number;
  updatedAt: string;
}

export interface Prediction {
  id: string;
  facilityId: string;
  medicineId: string;
  p10Date: string;
  p50Date: string;
  p90Date: string;
  confidenceScore: number; // 0-100
  surgeFlag: boolean;
  createdAt: string;
  resolvedActualDate: string | null;
}

export interface CountrySignal {
  country: 'india' | 'brazil' | 'south_africa';
  medicineCategory: string;
  demandTrendIndex: number; // e.g. 0.17 = 17% above 30-day baseline
  surgeActive: boolean;
  timestamp: string;
}

// ---------- API contract ----------
// Account A implements every route below exactly as shaped here.
// Account B calls these routes and must not reimplement the logic behind them.
// Every example is a REAL shape to build mocks against before A's routes exist.

// GET /api/facilities?country=india
// -> Facility[]

// GET /api/forecast/:facilityId/:medicineId
// -> {
//   p10Days: number; p50Days: number; p90Days: number;
//   confidenceScore: number; surgeFlag: boolean;
//   source: InventoryEventSource; lastUpdated: string;
// }
// Example:
// { "p10Days": 6, "p50Days": 9, "p90Days": 14, "confidenceScore": 72,
//   "surgeFlag": false, "source": "BARCODE", "lastUpdated": "2026-08-19T04:12:00Z" }

// GET /api/beds/:facilityId
// -> { ward: string; total: number; occupied: number; status: 'normal'|'warning'|'critical' }[]
// Example: [{ "ward": "General", "total": 20, "occupied": 18, "status": "warning" }]

// GET /api/staff/:facilityId
// -> { role: string; required: number; available: number; status: 'ok'|'shortage'|'critical' }[]
// Example: [{ "role": "doctor", "required": 4, "available": 2, "status": "critical" }]

// GET /api/redistribution/recommendations?facilityId=&medicineId=
// -> { sourceFacilityId: string; sourceFacilityName: string; quantity: number;
//      distanceKm: number; etaHours: number; memoText: string }
// Example:
// { "sourceFacilityId": "f_012", "sourceFacilityName": "CHC Kanpur Dehat",
//   "quantity": 300, "distanceKm": 18, "etaHours": 4,
//   "memoText": "PHC-14 projected to run out of Amoxicillin in 6 days..." }

// POST /api/redistribution/approve
// body: { facilityId: string; medicineId: string; sourceFacilityId: string; quantity: number }
// -> { success: true; newStockAtDestination: number; newStockAtSource: number }

// GET /api/citizen-check?facilityId=&medicineId=
// -> { status: 'available'|'low'|'unavailable'; freshnessText: string }
// Example: { "status": "available", "freshnessText": "Confirmed 12 minutes ago (barcode scan)" }

// GET /api/signals?country=india
// -> CountrySignal[]  // only the OTHER two countries' aggregated signals — never facility-level rows

// GET /api/predictions/track-record/:facilityId
// -> { accuracyScore: number; avgErrorDays: number; sampleSize: number }
// Example: { "accuracyScore": 0.74, "avgErrorDays": 1.8, "sampleSize": 10 }
