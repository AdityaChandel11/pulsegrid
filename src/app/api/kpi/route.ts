import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';
import { SimulationClock } from '@/lib/clock';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country');

  if (!country) {
    return Response.json({ error: 'country required' }, { status: 400 });
  }

  const db = getDb();
  const simDate = SimulationClock.getDateString();

  // Stockout lead-time gained: average p50 days across all active predictions
  const avgP50 = db.prepare(`
    SELECT AVG(
      MAX(0, CAST((julianday(p.p50Date) - julianday(?)) AS REAL))
    ) AS avgDays
    FROM predictions p
    JOIN facilities f ON f.id = p.facilityId
    WHERE f.country = ?
    AND p.createdAt = (
      SELECT MAX(p2.createdAt) FROM predictions p2
      WHERE p2.facilityId = p.facilityId AND p2.medicineId = p.medicineId
    )
  `).get(simDate, country) as { avgDays: number | null };

  // Count of completed paired redistributions (TRANSFERRED_IN events from API)
  const redistCount = db.prepare(`
    SELECT COUNT(*) AS cnt, COALESCE(SUM(quantity), 0) AS totalQty
    FROM inventory_events ie
    JOIN facilities f ON f.id = ie.facilityId
    WHERE f.country = ?
    AND ie.type = 'TRANSFERRED_IN'
    AND ie.source = 'api'
  `).get(country) as { cnt: number; totalQty: number };

  // Safe / protected facility-medicine pairs (p50 > 10 days horizon)
  const protectedPairs = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM predictions p
    JOIN facilities f ON f.id = p.facilityId
    WHERE f.country = ?
    AND p.createdAt = (
      SELECT MAX(p2.createdAt) FROM predictions p2
      WHERE p2.facilityId = p.facilityId AND p2.medicineId = p.medicineId
    )
    AND (julianday(p.p50Date) - julianday(?)) > 10
  `).get(country, simDate) as { cnt: number };

  // Total tracked pairs
  const totalTracked = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM predictions p
    JOIN facilities f ON f.id = p.facilityId
    WHERE f.country = ?
    AND p.createdAt = (
      SELECT MAX(p2.createdAt) FROM predictions p2
      WHERE p2.facilityId = p.facilityId AND p2.medicineId = p.medicineId
    )
  `).get(country) as { cnt: number };

  // Active surge count
  const surgeCount = db.prepare(`
    SELECT COUNT(DISTINCT p.facilityId) AS cnt
    FROM predictions p
    JOIN facilities f ON f.id = p.facilityId
    WHERE f.country = ?
    AND p.surgeFlag = 1
    AND p.createdAt = (
      SELECT MAX(p2.createdAt) FROM predictions p2
      WHERE p2.facilityId = p.facilityId AND p2.medicineId = p.medicineId
    )
  `).get(country) as { cnt: number };

  return Response.json({
    avgLeadTimeDays: Math.max(0, Math.round((avgP50?.avgDays ?? 0) * 10) / 10),
    redistributionsCompleted: redistCount.cnt,
    transferredUnits: redistCount.totalQty,
    protectedPairs: protectedPairs.cnt,
    totalTracked: totalTracked.cnt,
    activeSurges: surgeCount.cnt,
  });
}
