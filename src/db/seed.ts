/**
 * PulseGrid — Synthetic Seed Data Generator
 *
 * Generates realistic seed data for all tables defined in schema.sql.
 * Run with: npx tsx src/db/seed.ts
 */

import { initDb, closeDb } from './connection';
import { recordInventoryEvent } from '../services/inventoryService';
import type {
  Facility, Medicine, InventoryEvent, Bed, StaffRosterEntry, Prediction, CountrySignal,
} from '../types';
import type { InventoryEventType } from '../types';
import {
  SEED_FACILITIES_PER_COUNTRY, SEED_HISTORY_DAYS, SEED_SURGE_PAIRS_PER_COUNTRY,
} from '../constants';
import fs from 'fs';
import path from 'path';

// ---------- Deterministic PRNG (Mulberry32) ----------

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uuid(): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i++) {
    s += hex[Math.floor(rng() * 16)];
    if (i === 7 || i === 11 || i === 15 || i === 19) s += '-';
  }
  return s;
}

// ---------- Facility data by country ----------

interface FacilityTemplate {
  name: string;
  district: string;
  lat: number;
  lng: number;
  type: 'PHC' | 'CHC' | 'district';
}

const INDIA_FACILITIES: FacilityTemplate[] = [
  { name: 'PHC Bareilly-North', district: 'Bareilly', lat: 28.367, lng: 79.415, type: 'PHC' },
  { name: 'CHC Kanpur Dehat', district: 'Kanpur Dehat', lat: 26.449, lng: 79.981, type: 'CHC' },
  { name: 'District Hospital Lucknow', district: 'Lucknow', lat: 26.846, lng: 80.946, type: 'district' },
  { name: 'PHC Varanasi-South', district: 'Varanasi', lat: 25.318, lng: 83.010, type: 'PHC' },
  { name: 'CHC Allahabad Rural', district: 'Prayagraj', lat: 25.435, lng: 81.846, type: 'CHC' },
  { name: 'PHC Gorakhpur East', district: 'Gorakhpur', lat: 26.760, lng: 83.374, type: 'PHC' },
  { name: 'District Hospital Agra', district: 'Agra', lat: 27.180, lng: 78.024, type: 'district' },
  { name: 'PHC Meerut-West', district: 'Meerut', lat: 28.984, lng: 77.706, type: 'PHC' },
  { name: 'CHC Jhansi Block', district: 'Jhansi', lat: 25.448, lng: 78.568, type: 'CHC' },
  { name: 'PHC Sultanpur Central', district: 'Sultanpur', lat: 26.264, lng: 82.072, type: 'PHC' },
  { name: 'CHC Mathura Rural', district: 'Mathura', lat: 27.492, lng: 77.677, type: 'CHC' },
  { name: 'PHC Faizabad-North', district: 'Ayodhya', lat: 26.773, lng: 82.134, type: 'PHC' },
  { name: 'District Hospital Moradabad', district: 'Moradabad', lat: 28.838, lng: 78.777, type: 'district' },
  { name: 'PHC Aligarh South', district: 'Aligarh', lat: 27.882, lng: 78.078, type: 'PHC' },
  { name: 'CHC Rae Bareli', district: 'Rae Bareli', lat: 26.230, lng: 81.233, type: 'CHC' },
  { name: 'PHC Unnao Block-A', district: 'Unnao', lat: 26.547, lng: 80.488, type: 'PHC' },
  { name: 'CHC Sitapur Rural', district: 'Sitapur', lat: 27.570, lng: 80.682, type: 'CHC' },
  { name: 'PHC Hardoi Central', district: 'Hardoi', lat: 27.395, lng: 80.131, type: 'PHC' },
];

const BRAZIL_FACILITIES: FacilityTemplate[] = [
  { name: 'UBS Vila Nova', district: 'São Paulo', lat: -23.550, lng: -46.633, type: 'PHC' },
  { name: 'UBS Jardim Esperança', district: 'Rio de Janeiro', lat: -22.906, lng: -43.172, type: 'PHC' },
  { name: 'USF Belo Horizonte Centro', district: 'Belo Horizonte', lat: -19.919, lng: -43.938, type: 'PHC' },
  { name: 'Hospital Distrital Salvador', district: 'Salvador', lat: -12.971, lng: -38.510, type: 'district' },
  { name: 'UBS Recife-Norte', district: 'Recife', lat: -8.054, lng: -34.871, type: 'PHC' },
  { name: 'USF Fortaleza Litoral', district: 'Fortaleza', lat: -3.717, lng: -38.543, type: 'CHC' },
  { name: 'UBS Manaus Oeste', district: 'Manaus', lat: -3.119, lng: -60.021, type: 'PHC' },
  { name: 'Hospital Distrital Curitiba', district: 'Curitiba', lat: -25.428, lng: -49.273, type: 'district' },
  { name: 'USF Porto Alegre Sul', district: 'Porto Alegre', lat: -30.033, lng: -51.230, type: 'CHC' },
  { name: 'UBS Belém Cidade Velha', district: 'Belém', lat: -1.456, lng: -48.502, type: 'PHC' },
  { name: 'USF Goiânia Leste', district: 'Goiânia', lat: -16.686, lng: -49.264, type: 'CHC' },
  { name: 'UBS Campinas Rural', district: 'Campinas', lat: -22.906, lng: -47.061, type: 'PHC' },
  { name: 'Hospital Distrital Natal', district: 'Natal', lat: -5.795, lng: -35.209, type: 'district' },
  { name: 'UBS São Luís Centro', district: 'São Luís', lat: -2.530, lng: -44.282, type: 'PHC' },
  { name: 'USF Maceió Ponta Verde', district: 'Maceió', lat: -9.666, lng: -35.735, type: 'CHC' },
  { name: 'UBS Teresina Norte', district: 'Teresina', lat: -5.089, lng: -42.802, type: 'PHC' },
];

const SOUTH_AFRICA_FACILITIES: FacilityTemplate[] = [
  { name: 'Khayelitsha CHC', district: 'Cape Town', lat: -34.044, lng: 18.677, type: 'CHC' },
  { name: 'Soweto District Hospital', district: 'Johannesburg', lat: -26.268, lng: 27.859, type: 'district' },
  { name: 'Umlazi Clinic', district: 'eThekwini', lat: -29.963, lng: 30.893, type: 'PHC' },
  { name: 'Mamelodi CHC', district: 'Tshwane', lat: -25.720, lng: 28.395, type: 'CHC' },
  { name: 'KwaMashu Clinic', district: 'eThekwini', lat: -29.748, lng: 30.974, type: 'PHC' },
  { name: 'Mitchells Plain CHC', district: 'Cape Town', lat: -34.049, lng: 18.617, type: 'CHC' },
  { name: 'Alexandra District Hospital', district: 'Johannesburg', lat: -26.102, lng: 28.098, type: 'district' },
  { name: 'Mdantsane Clinic', district: 'Buffalo City', lat: -32.963, lng: 27.744, type: 'PHC' },
  { name: 'Seshego CHC', district: 'Polokwane', lat: -23.862, lng: 29.392, type: 'CHC' },
  { name: 'Tembisa Clinic', district: 'Ekurhuleni', lat: -25.996, lng: 28.227, type: 'PHC' },
  { name: 'Mthatha District Hospital', district: "King Sabata Dalindyebo", lat: -31.589, lng: 28.784, type: 'district' },
  { name: 'Gugulethu Clinic', district: 'Cape Town', lat: -33.977, lng: 18.568, type: 'PHC' },
  { name: 'Atteridgeville CHC', district: 'Tshwane', lat: -25.777, lng: 28.081, type: 'CHC' },
  { name: 'Nkandla Clinic', district: 'King Cetshwayo', lat: -28.609, lng: 31.101, type: 'PHC' },
  { name: 'Thohoyandou Clinic', district: 'Vhembe', lat: -22.950, lng: 30.480, type: 'PHC' },
];

const COUNTRY_FACILITY_MAP: Record<string, FacilityTemplate[]> = {
  india: INDIA_FACILITIES,
  brazil: BRAZIL_FACILITIES,
  south_africa: SOUTH_AFRICA_FACILITIES,
};

// ---------- Medicine catalog ----------

interface MedicineTemplate {
  name: string;
  category: string;
  unit: string;
  dailyBaseline: number; // typical daily dispensed quantity
}

const MEDICINE_CATALOG: MedicineTemplate[] = [
  { name: 'Amoxicillin 500mg', category: 'antibiotic', unit: 'tablets', dailyBaseline: 40 },
  { name: 'ORS Packets', category: 'rehydration', unit: 'packets', dailyBaseline: 25 },
  { name: 'Paracetamol 500mg', category: 'analgesic', unit: 'tablets', dailyBaseline: 60 },
  { name: 'Insulin (Regular)', category: 'endocrine', unit: 'vials', dailyBaseline: 8 },
  { name: 'Metformin 500mg', category: 'endocrine', unit: 'tablets', dailyBaseline: 35 },
  { name: 'Oxygen Cylinders', category: 'emergency', unit: 'units', dailyBaseline: 3 },
  { name: 'IV Fluids (Normal Saline)', category: 'emergency', unit: 'bags', dailyBaseline: 12 },
  { name: 'Anti-Snake Venom', category: 'emergency', unit: 'vials', dailyBaseline: 1 },
  { name: 'Platelet Concentrate', category: 'emergency', unit: 'units', dailyBaseline: 2 },
  { name: 'Azithromycin 250mg', category: 'antibiotic', unit: 'tablets', dailyBaseline: 20 },
  { name: 'Iron + Folic Acid', category: 'supplement', unit: 'tablets', dailyBaseline: 50 },
  { name: 'Chloroquine Phosphate', category: 'antimalarial', unit: 'tablets', dailyBaseline: 15 },
];

// ---------- Ward templates ----------

const WARD_TEMPLATES = [
  { ward: 'General', totalRange: [15, 30] as [number, number] },
  { ward: 'Pediatric', totalRange: [8, 15] as [number, number] },
  { ward: 'Maternity', totalRange: [6, 12] as [number, number] },
  { ward: 'Emergency', totalRange: [4, 10] as [number, number] },
];

// ---------- Generator ----------

function generateFacilities(): Facility[] {
  const facilities: Facility[] = [];
  let counter = 0;

  for (const [country, templates] of Object.entries(COUNTRY_FACILITY_MAP)) {
    const count = SEED_FACILITIES_PER_COUNTRY[country as keyof typeof SEED_FACILITIES_PER_COUNTRY];
    const selected = templates.slice(0, count);
    for (const t of selected) {
      counter++;
      facilities.push({
        id: `f_${String(counter).padStart(3, '0')}`,
        name: t.name,
        country: country as Facility['country'],
        district: t.district,
        lat: t.lat + (rng() - 0.5) * 0.01,
        lng: t.lng + (rng() - 0.5) * 0.01,
        type: t.type,
        safetyStockDays: t.type === 'district' ? 21 : t.type === 'CHC' ? 14 : 10,
      });
    }
  }
  return facilities;
}

function generateMedicines(): Medicine[] {
  return MEDICINE_CATALOG.map((m, i) => ({
    id: `m_${String(i + 1).padStart(3, '0')}`,
    name: m.name,
    category: m.category,
    unit: m.unit,
  }));
}

function generateInventoryEvents(
  facilities: Facility[],
  medicines: Medicine[],
): InventoryEvent[] {
  const events: InventoryEvent[] = [];
  const now = new Date('2026-08-17T12:00:00Z');

  // Pick surge pairs per country
  const surgePairs = new Set<string>();
  for (const country of ['india', 'brazil', 'south_africa']) {
    const countryFacs = facilities.filter(f => f.country === country);
    const shuffledFacs = shuffle(countryFacs);
    for (let i = 0; i < SEED_SURGE_PAIRS_PER_COUNTRY; i++) {
      const fac = shuffledFacs[i % shuffledFacs.length];
      const med = medicines[randInt(0, 3)]; // first few common medicines
      surgePairs.add(`${fac.id}:${med.id}`);
    }
  }

  // Select 8-12 medicines per facility
  for (const facility of facilities) {
    const medCount = randInt(8, 12);
    const selectedMeds = shuffle(medicines).slice(0, medCount);

    // Initial RECEIVED event (stock on hand at start of period)
    for (const med of selectedMeds) {
      const template = MEDICINE_CATALOG.find(m => m.name === med.name)!;
      const initialStock = template.dailyBaseline * randInt(45, 90);
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - SEED_HISTORY_DAYS - 7);

      events.push({
        id: uuid(),
        facilityId: facility.id,
        medicineId: med.id,
        type: 'RECEIVED',
        quantity: initialStock,
        timestamp: startDate.toISOString(),
        source: 'SIMULATION',
        notes: 'Initial stock',
      });

      // Periodic resupply every ~15 days
      for (let d = 15; d < SEED_HISTORY_DAYS; d += randInt(12, 18)) {
        const resupplyDate = new Date(now);
        resupplyDate.setDate(resupplyDate.getDate() - SEED_HISTORY_DAYS + d);
        resupplyDate.setHours(randInt(6, 10), randInt(0, 59));

        events.push({
          id: uuid(),
          facilityId: facility.id,
          medicineId: med.id,
          type: 'RECEIVED',
          quantity: Math.round(template.dailyBaseline * randInt(10, 20)),
          timestamp: resupplyDate.toISOString(),
          source: 'SIMULATION',
          notes: 'Routine resupply',
        });
      }

      // Daily DISPENSED events for SEED_HISTORY_DAYS days
      const isSurge = surgePairs.has(`${facility.id}:${med.id}`);

      for (let d = 0; d < SEED_HISTORY_DAYS; d++) {
        const eventDate = new Date(now);
        eventDate.setDate(eventDate.getDate() - SEED_HISTORY_DAYS + d);
        eventDate.setHours(randInt(8, 18), randInt(0, 59));

        let qty = template.dailyBaseline;

        // Add realistic noise: +/- 30%
        const noise = 1 + (rng() - 0.5) * 0.6;
        qty = Math.max(1, Math.round(qty * noise));

        // Inject surge in last 5-7 days
        if (isSurge && d >= SEED_HISTORY_DAYS - randInt(5, 7)) {
          const surgeMultiplier = 2.5 + rng() * 1.5; // 2.5x to 4x
          qty = Math.round(qty * surgeMultiplier);
        }

        // Determine source with stagger:
        // Recent (last 3 days): 50% api, 30% barcode, 20% manual
        // Semi-recent (4-10 days): mixed
        // Older: more manual
        const daysAgo = SEED_HISTORY_DAYS - d;
        let source: 'SIMULATION' | 'BARCODE' | 'MANUAL';
        const r = rng();
        if (daysAgo <= 3) {
          source = r < 0.50 ? 'SIMULATION' : r < 0.80 ? 'BARCODE' : 'MANUAL';
        } else if (daysAgo <= 10) {
          source = r < 0.30 ? 'SIMULATION' : r < 0.60 ? 'BARCODE' : 'MANUAL';
        } else {
          source = r < 0.15 ? 'SIMULATION' : r < 0.35 ? 'BARCODE' : 'MANUAL';
        }

        // Adjust timestamps for staleness
        if (source === 'MANUAL') {
          eventDate.setDate(eventDate.getDate() - randInt(3, 5));
        } else if (source === 'BARCODE') {
          eventDate.setHours(eventDate.getHours() - randInt(4, 24));
        }

        // Ensure event timestamp is strictly after initial delivery
        if (eventDate <= startDate) {
          eventDate.setTime(startDate.getTime() + (d + 1) * 3600000 * 2);
        }

        events.push({
          id: uuid(),
          facilityId: facility.id,
          medicineId: med.id,
          type: 'DISPENSED',
          quantity: qty,
          timestamp: eventDate.toISOString(),
          source,
        });
      }

      // Occasional EXPIRED / DAMAGED events
      if (rng() < 0.15) {
        const expDate = new Date(now);
        expDate.setDate(expDate.getDate() - randInt(5, 30));
        events.push({
          id: uuid(),
          facilityId: facility.id,
          medicineId: med.id,
          type: 'EXPIRED' as InventoryEventType,
          quantity: randInt(5, 30),
          timestamp: expDate.toISOString(),
          source: 'MANUAL',
          notes: 'Expired batch removed',
        });
      }
      if (rng() < 0.08) {
        const dmgDate = new Date(now);
        dmgDate.setDate(dmgDate.getDate() - randInt(3, 20));
        events.push({
          id: uuid(),
          facilityId: facility.id,
          medicineId: med.id,
          type: 'DAMAGED' as InventoryEventType,
          quantity: randInt(2, 15),
          timestamp: dmgDate.toISOString(),
          source: 'MANUAL',
          notes: 'Water damage / broken packaging',
        });
      }
    }
  }

  return events;
}

function generateBeds(facilities: Facility[]): Bed[] {
  const beds: Bed[] = [];
  const now = new Date('2026-08-17T12:00:00Z');

  for (const fac of facilities) {
    // PHC: fewer wards; district: all wards
    const wardCount = fac.type === 'PHC' ? 2 : fac.type === 'CHC' ? 3 : 4;
    const wards = WARD_TEMPLATES.slice(0, wardCount);

    for (const w of wards) {
      const total = randInt(w.totalRange[0], w.totalRange[1]);
      const occupancyRate = 0.5 + rng() * 0.55; // 50% to 105%
      const occupied = Math.min(total, Math.round(total * occupancyRate));
      const updatedAt = new Date(now);
      updatedAt.setHours(updatedAt.getHours() - randInt(0, 12));

      beds.push({
        facilityId: fac.id,
        ward: w.ward,
        total,
        occupied,
        updatedAt: updatedAt.toISOString(),
      });
    }
  }
  return beds;
}

function generateStaffRoster(facilities: Facility[]): StaffRosterEntry[] {
  const roster: StaffRosterEntry[] = [];
  const now = new Date('2026-08-17T12:00:00Z');

  const staffReqs: Record<string, Record<string, number>> = {
    PHC: { doctor: 2, nurse: 4, pharmacist: 1 },
    CHC: { doctor: 4, nurse: 8, pharmacist: 2 },
    district: { doctor: 8, nurse: 16, pharmacist: 3 },
  };

  for (const fac of facilities) {
    const reqs = staffReqs[fac.type];
    for (const [role, required] of Object.entries(reqs)) {
      // Some deficit: 70% chance full, 20% shortage, 10% critical
      const r = rng();
      let available: number;
      if (r < 0.70) {
        available = required;
      } else if (r < 0.90) {
        available = Math.max(0, required - 1);
      } else {
        available = Math.max(0, required - randInt(2, 3));
      }

      const updatedAt = new Date(now);
      updatedAt.setHours(updatedAt.getHours() - randInt(0, 48));

      roster.push({
        facilityId: fac.id,
        role: role as StaffRosterEntry['role'],
        required,
        available,
        updatedAt: updatedAt.toISOString(),
      });
    }
  }
  return roster;
}

function generatePredictions(facilities: Facility[], medicines: Medicine[]): Prediction[] {
  const predictions: Prediction[] = [];
  const now = new Date('2026-08-17T12:00:00Z');

  // Generate a few historical predictions per facility for track record
  for (const fac of facilities) {
    const medCount = randInt(3, 5);
    const selectedMeds = shuffle(medicines).slice(0, medCount);

    for (const med of selectedMeds) {
      const p50Days = randInt(5, 25);
      const spread = randInt(3, 8);
      const p10Date = new Date(now);
      p10Date.setDate(p10Date.getDate() + p50Days - spread);
      const p50Date = new Date(now);
      p50Date.setDate(p50Date.getDate() + p50Days);
      const p90Date = new Date(now);
      p90Date.setDate(p90Date.getDate() + p50Days + spread);

      const createdAt = new Date(now);
      createdAt.setDate(createdAt.getDate() - randInt(1, 7));

      predictions.push({
        id: uuid(),
        facilityId: fac.id,
        medicineId: med.id,
        p10Date: p10Date.toISOString().split('T')[0],
        p50Date: p50Date.toISOString().split('T')[0],
        p90Date: p90Date.toISOString().split('T')[0],
        confidenceScore: randInt(40, 95),
        surgeFlag: rng() < 0.12,
        createdAt: createdAt.toISOString(),
        resolvedActualDate: rng() < 0.3
          ? new Date(now.getTime() + (p50Days + randInt(-3, 3)) * 86400000).toISOString().split('T')[0]
          : null,
      });
    }
  }
  return predictions;
}

function generateCountrySignals(): CountrySignal[] {
  const signals: CountrySignal[] = [];
  const now = new Date('2026-08-17T12:00:00Z');
  const categories = ['antibiotic', 'rehydration', 'analgesic', 'endocrine', 'emergency', 'supplement', 'antimalarial'];

  for (const country of ['india', 'brazil', 'south_africa'] as const) {
    for (const cat of categories) {
      const trend = rng() * 0.4 - 0.1; // -10% to +30%
      const surgeActive = trend > 0.2;
      const ts = new Date(now);
      ts.setHours(ts.getHours() - randInt(0, 6));

      signals.push({
        country,
        medicineCategory: cat,
        demandTrendIndex: Math.round(trend * 100) / 100,
        surgeActive,
        timestamp: ts.toISOString(),
      });
    }
  }
  return signals;
}

// ---------- Main ----------

function main() {
  console.log('PulseGrid seed: generating data...');

  const facilities = generateFacilities();
  const medicines = generateMedicines();
  const inventoryEvents = generateInventoryEvents(facilities, medicines);
  const beds = generateBeds(facilities);
  const staffRoster = generateStaffRoster(facilities);
  const predictions = generatePredictions(facilities, medicines);
  const countrySignals = generateCountrySignals();

  console.log(`  Facilities:        ${facilities.length}`);
  console.log(`  Medicines:         ${medicines.length}`);
  console.log(`  Inventory Events:  ${inventoryEvents.length}`);
  console.log(`  Bed Records:       ${beds.length}`);
  console.log(`  Staff Roster:      ${staffRoster.length}`);
  console.log(`  Predictions:       ${predictions.length}`);
  console.log(`  Country Signals:   ${countrySignals.length}`);

  // Initialize DB and insert
  const db = initDb();

  // Clear existing data
  db.exec('DELETE FROM country_signals');
  db.exec('DELETE FROM predictions');
  db.exec('DELETE FROM staff_roster');
  db.exec('DELETE FROM beds');
  db.exec('DELETE FROM inventory_events');
  db.exec('DELETE FROM medicines');
  db.exec('DELETE FROM facilities');

  // Insert facilities
  const insertFacility = db.prepare(
    'INSERT INTO facilities (id, name, country, district, lat, lng, type, safetyStockDays) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const f of facilities) {
    insertFacility.run(f.id, f.name, f.country, f.district, f.lat, f.lng, f.type, f.safetyStockDays);
  }

  // Insert medicines
  const insertMedicine = db.prepare(
    'INSERT INTO medicines (id, name, category, unit) VALUES (?, ?, ?, ?)'
  );
  for (const m of medicines) {
    insertMedicine.run(m.id, m.name, m.category, m.unit);
  }

  // Insert inventory events via authoritative inventory service
  // Chronological sort ensures all receipts and resupplies precede dispensations
  inventoryEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const insertEvents = db.transaction((events: InventoryEvent[]) => {
    for (const e of events) {
      recordInventoryEvent({
        facilityId: e.facilityId,
        medicineId: e.medicineId,
        eventType: e.type,
        quantity: e.quantity,
        timestamp: e.timestamp,
        source: e.source,
        batchNumber: e.batchNumber,
        expiryDate: e.expiryDate,
        notes: e.notes,
      });
    }
  });
  insertEvents(inventoryEvents);

  // Insert beds
  const insertBed = db.prepare(
    'INSERT INTO beds (facilityId, ward, total, occupied, updatedAt) VALUES (?, ?, ?, ?, ?)'
  );
  for (const b of beds) {
    insertBed.run(b.facilityId, b.ward, b.total, b.occupied, b.updatedAt);
  }

  // Insert staff roster
  const insertStaff = db.prepare(
    'INSERT INTO staff_roster (facilityId, role, required, available, updatedAt) VALUES (?, ?, ?, ?, ?)'
  );
  for (const s of staffRoster) {
    insertStaff.run(s.facilityId, s.role, s.required, s.available, s.updatedAt);
  }

  // Insert predictions
  const insertPrediction = db.prepare(
    'INSERT INTO predictions (id, facilityId, medicineId, p10Date, p50Date, p90Date, confidenceScore, surgeFlag, createdAt, resolvedActualDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const p of predictions) {
    insertPrediction.run(p.id, p.facilityId, p.medicineId, p.p10Date, p.p50Date, p.p90Date, p.confidenceScore, p.surgeFlag ? 1 : 0, p.createdAt, p.resolvedActualDate);
  }

  // Insert country signals
  const insertSignal = db.prepare(
    'INSERT INTO country_signals (country, medicineCategory, demandTrendIndex, surgeActive, timestamp) VALUES (?, ?, ?, ?, ?)'
  );
  for (const s of countrySignals) {
    insertSignal.run(s.country, s.medicineCategory, s.demandTrendIndex, s.surgeActive ? 1 : 0, s.timestamp);
  }

  closeDb();

  // Export seed data to JSON
  const exportData = {
    _generatedAt: new Date().toISOString(),
    _description: 'PulseGrid synthetic seed data export. Inspect this file for real example rows.',
    facilities,
    medicines,
    inventoryEvents: inventoryEvents.slice(0, 200), // sample for readability
    inventoryEventsTotal: inventoryEvents.length,
    beds,
    staffRoster,
    predictions,
    countrySignals,
  };

  const exportDir = path.join(process.cwd(), 'src', 'data');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(exportDir, 'seed-export.json'),
    JSON.stringify(exportData, null, 2),
    'utf-8',
  );

  console.log('\nSeed complete. Database: pulsegrid.db');
  console.log('Export: src/data/seed-export.json');
}

main();
