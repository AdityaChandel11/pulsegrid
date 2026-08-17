/**
 * PulseGrid — Redistribution Candidate Selection & Gemini Reasoning
 *
 * 1. Deterministic pre-filter: surplus > 0 AND confidence >= 60
 * 2. Gemini API for final pick + memo (with deterministic fallback)
 */

import { getDb } from '@/db/connection';
import { REDISTRIBUTION_MIN_CONFIDENCE } from '@/constants';
import { getCurrentStock, getMedicineIdsAtFacility } from './inventory';
import { computeForecast } from './forecast';
import { computeConfidence } from './confidence';
import { getLatestEventMeta } from './inventory';
import type { Facility } from '@/types';

interface Candidate {
  facilityId: string;
  facilityName: string;
  surplus: number;
  distanceKm: number;
  etaHours: number;
  confidence: number;
}

export interface Recommendation {
  sourceFacilityId: string;
  sourceFacilityName: string;
  quantity: number;
  distanceKm: number;
  etaHours: number;
  memoText: string;
}

/**
 * Haversine distance in km.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find redistribution candidates for a facility-medicine pair.
 */
export function findCandidates(
  facilityId: string,
  medicineId: string,
): Candidate[] {
  const db = getDb();

  // Get requesting facility
  const reqFac = db.prepare('SELECT * FROM facilities WHERE id = ?').get(facilityId) as Facility | undefined;
  if (!reqFac) return [];

  // Get all same-country facilities except the requester
  const peers = db.prepare(
    'SELECT * FROM facilities WHERE country = ? AND id != ?'
  ).all(reqFac.country, facilityId) as Facility[];

  const candidates: Candidate[] = [];

  for (const peer of peers) {
    // Check if peer has this medicine
    const medIds = getMedicineIdsAtFacility(peer.id);
    if (!medIds.includes(medicineId)) continue;

    const stock = getCurrentStock(peer.id, medicineId);
    const forecast = computeForecast(peer.id, medicineId);

    // Surplus: stock beyond what peer needs for its own safety stock
    const peerSafetyNeed = forecast.baselineMean * (peer.safetyStockDays ?? 14);
    const surplus = Math.floor(stock - peerSafetyNeed);
    if (surplus <= 0) continue;

    // Confidence check
    const meta = getLatestEventMeta(peer.id, medicineId);
    if (!meta) continue;

    const confidence = computeConfidence({
      source: meta.source,
      lastEventTimestamp: meta.timestamp,
      p10Days: forecast.p10Days,
      p50Days: forecast.p50Days,
      p90Days: forecast.p90Days,
      facilityId: peer.id,
    });

    if (confidence < REDISTRIBUTION_MIN_CONFIDENCE) continue;

    const distanceKm = Math.round(haversineKm(reqFac.lat, reqFac.lng, peer.lat, peer.lng) * 10) / 10;
    const etaHours = Math.round(Math.max(1, distanceKm / 30) * 10) / 10; // ~30 km/h average

    candidates.push({
      facilityId: peer.id,
      facilityName: peer.name,
      surplus,
      distanceKm,
      etaHours,
      confidence,
    });
  }

  // Sort by distance
  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  return candidates;
}

/**
 * Get recommendation: try Gemini, fall back to deterministic nearest-sufficient.
 */
export async function getRecommendation(
  facilityId: string,
  medicineId: string,
): Promise<Recommendation | null> {
  const db = getDb();
  const candidates = findCandidates(facilityId, medicineId);
  if (candidates.length === 0) return null;

  // Get the requesting facility and medicine names for memo
  const reqFac = db.prepare('SELECT name FROM facilities WHERE id = ?').get(facilityId) as { name: string } | undefined;
  const med = db.prepare('SELECT name FROM medicines WHERE id = ?').get(medicineId) as { name: string } | undefined;
  const reqFacName = reqFac?.name ?? facilityId;
  const medName = med?.name ?? medicineId;

  // Forecast for requesting facility
  const forecast = computeForecast(facilityId, medicineId);

  // Try Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      return await callGemini(apiKey, candidates, reqFacName, medName, forecast, facilityId, medicineId);
    } catch {
      // Fall through to deterministic fallback
    }
  }

  // Deterministic fallback: nearest sufficient candidate
  return deterministicPick(candidates, reqFacName, medName, forecast, facilityId, medicineId);
}

/**
 * Deterministic fallback: pick nearest candidate, template memo.
 */
function deterministicPick(
  candidates: Candidate[],
  reqFacName: string,
  medName: string,
  forecast: { p50Days: number },
  _facilityId: string,
  _medicineId: string,
): Recommendation {
  const best = candidates[0]; // already sorted by distance
  return {
    sourceFacilityId: best.facilityId,
    sourceFacilityName: best.facilityName,
    quantity: Math.min(best.surplus, Math.ceil(best.surplus * 0.5)), // transfer up to half surplus
    distanceKm: best.distanceKm,
    etaHours: best.etaHours,
    memoText: `${reqFacName} projected to run out of ${medName} in ${forecast.p50Days} days. ` +
      `${best.facilityName} has ${best.surplus} units surplus (confidence: ${best.confidence}%). ` +
      `Distance: ${best.distanceKm} km, ETA: ${best.etaHours} hours.`,
  };
}

/**
 * Call Gemini API for the final pick and a memo.
 */
async function callGemini(
  apiKey: string,
  candidates: Candidate[],
  reqFacName: string,
  medName: string,
  forecast: { p50Days: number },
  facilityId: string,
  medicineId: string,
): Promise<Recommendation> {
  const candidateDesc = candidates.slice(0, 5).map(c =>
    `${c.facilityName} (id: ${c.facilityId}): surplus=${c.surplus}, dist=${c.distanceKm}km, eta=${c.etaHours}h, confidence=${c.confidence}%`
  ).join('\n');

  const prompt = `You are a health supply chain logistics AI for PulseGrid.

${reqFacName} (id: ${facilityId}) is projected to run out of ${medName} (id: ${medicineId}) in ${forecast.p50Days} days.

Candidate source facilities:
${candidateDesc}

Pick the best source facility considering distance, surplus, and confidence.
Respond ONLY with valid JSON (no markdown):
{
  "sourceFacilityId": "...",
  "sourceFacilityName": "...",
  "quantity": <number>,
  "distanceKm": <number>,
  "etaHours": <number>,
  "memoText": "<brief reasoning memo>"
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    },
  );

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Parse JSON from response (strip any markdown fences)
  const jsonMatch = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonMatch) as Recommendation;

  // Validate required fields
  if (!parsed.sourceFacilityId || !parsed.sourceFacilityName || !parsed.quantity) {
    throw new Error('Invalid Gemini response');
  }

  return parsed;
}

/**
 * Execute a transfer: write TRANSFERRED_OUT + TRANSFERRED_IN events.
 * Returns new stock at both facilities.
 */
export function executeTransfer(
  sourceFacilityId: string,
  destFacilityId: string,
  medicineId: string,
  quantity: number,
): { newStockAtSource: number; newStockAtDestination: number } {
  const db = getDb();
  const now = new Date().toISOString();

  const id1 = crypto.randomUUID();
  const id2 = crypto.randomUUID();

  const insert = db.prepare(`
    INSERT INTO inventory_events (id, facilityId, medicineId, type, quantity, timestamp, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    insert.run(id1, sourceFacilityId, medicineId, 'TRANSFERRED_OUT', quantity, now, 'api', `Transfer to ${destFacilityId}`);
    insert.run(id2, destFacilityId, medicineId, 'TRANSFERRED_IN', quantity, now, 'api', `Transfer from ${sourceFacilityId}`);
  });

  txn();

  return {
    newStockAtSource: getCurrentStock(sourceFacilityId, medicineId),
    newStockAtDestination: getCurrentStock(destFacilityId, medicineId),
  };
}
