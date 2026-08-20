import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';
import { SimulationClock } from '@/lib/clock';
import type { InventoryEventSource } from '@/types';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country');

  if (!country) {
    return Response.json({ error: 'country required' }, { status: 400 });
  }

  const db = getDb();

  // Get all predictions for facilities in this country, with latest prediction per facility-medicine pair
  const rows = db.prepare(`
    SELECT p.facilityId, p.medicineId, p.p10Date, p.p50Date, p.p90Date,
           p.confidenceScore, p.surgeFlag, p.createdAt,
           f.name AS facilityName, f.type AS facilityType, f.district,
           m.name AS medicineName, m.category AS medicineCategory,
           (
             SELECT ie.source FROM inventory_events ie
             WHERE ie.facilityId = p.facilityId AND ie.medicineId = p.medicineId
             ORDER BY ie.timestamp DESC LIMIT 1
           ) AS latestSource,
           (
             SELECT ie.timestamp FROM inventory_events ie
             WHERE ie.facilityId = p.facilityId AND ie.medicineId = p.medicineId
             ORDER BY ie.timestamp DESC LIMIT 1
           ) AS latestTimestamp
    FROM predictions p
    JOIN facilities f ON f.id = p.facilityId
    JOIN medicines m ON m.id = p.medicineId
    WHERE f.country = ?
    AND p.createdAt = (
      SELECT MAX(p2.createdAt) FROM predictions p2
      WHERE p2.facilityId = p.facilityId AND p2.medicineId = p.medicineId
    )
    ORDER BY p.p50Date ASC
  `).all(country) as {
    facilityId: string;
    medicineId: string;
    p10Date: string;
    p50Date: string;
    p90Date: string;
    confidenceScore: number;
    surgeFlag: number;
    createdAt: string;
    facilityName: string;
    facilityType: string;
    district: string;
    medicineName: string;
    medicineCategory: string;
    latestSource: InventoryEventSource | null;
    latestTimestamp: string | null;
  }[];

  const now = SimulationClock.getTime();

  const result = rows.map((r) => {
    const p50Days = Math.max(0, Math.round((new Date(r.p50Date).getTime() - now) / (1000 * 60 * 60 * 24)));
    const p10Days = Math.max(0, Math.round((new Date(r.p10Date).getTime() - now) / (1000 * 60 * 60 * 24)));
    const p90Days = Math.max(0, Math.round((new Date(r.p90Date).getTime() - now) / (1000 * 60 * 60 * 24)));
    const surgeFlag = Boolean(r.surgeFlag);

    // Risk score: lower p50 = higher risk, boosted by surge, weighted by confidence
    const surgeMult = surgeFlag ? 0.6 : 1.0;
    const confidenceWeight = Math.max(r.confidenceScore / 100, 0.2);
    const riskScore = (p50Days * surgeMult) / confidenceWeight;

    // Source label & freshness
    const source: InventoryEventSource = r.latestSource || 'BARCODE';
    const lastUpdated = r.latestTimestamp || r.createdAt;
    const updatedMs = Math.max(0, now - new Date(lastUpdated).getTime());
    const updatedMins = Math.floor(updatedMs / 60000);
    const updatedHours = Math.floor(updatedMins / 60);

    let freshnessText: string;
    if (updatedMins < 60) {
      freshnessText = `${Math.max(1, updatedMins)}m ago`;
    } else if (updatedHours < 24) {
      freshnessText = `${updatedHours}h ago`;
    } else {
      freshnessText = `${Math.floor(updatedHours / 24)}d ago`;
    }

    return {
      facilityId: r.facilityId,
      medicineId: r.medicineId,
      facilityName: r.facilityName,
      facilityType: r.facilityType,
      district: r.district,
      medicineName: r.medicineName,
      medicineCategory: r.medicineCategory,
      p10Days,
      p50Days,
      p90Days,
      confidenceScore: r.confidenceScore,
      surgeFlag,
      riskScore,
      source,
      lastUpdated,
      freshnessText,
    };
  });

  // Sort by risk score ascending (most urgent first)
  result.sort((a, b) => a.riskScore - b.riskScore);

  return Response.json(result);
}
