import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country');

  if (!country) {
    return Response.json({ error: 'country required' }, { status: 400 });
  }

  const db = getDb();

  // Stockout lead-time gained: average p50 days across all active predictions
  const avgP50 = db.prepare(`
    SELECT AVG(
      CAST((julianday(p.p50Date) - julianday('now')) AS REAL)
    ) AS avgDays
    FROM predictions p
    JOIN facilities f ON f.id = p.facilityId
    WHERE f.country = ?
    AND p.createdAt = (
      SELECT MAX(p2.createdAt) FROM predictions p2
      WHERE p2.facilityId = p.facilityId AND p2.medicineId = p.medicineId
    )
  `).get(country) as { avgDays: number | null };

  // Count of redistributions completed (TRANSFERRED_IN events from api source)
  const redistCount = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM inventory_events ie
    JOIN facilities f ON f.id = ie.facilityId
    WHERE f.country = ?
    AND ie.type = 'TRANSFERRED_IN'
    AND ie.source = 'api'
  `).get(country) as { cnt: number };

  // Network stockout-days reduced: count of facility-medicine pairs with p50 > 7 days
  // (meaning early detection prevented stockout)
  const protectedPairs = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM predictions p
    JOIN facilities f ON f.id = p.facilityId
    WHERE f.country = ?
    AND p.createdAt = (
      SELECT MAX(p2.createdAt) FROM predictions p2
      WHERE p2.facilityId = p.facilityId AND p2.medicineId = p.medicineId
    )
    AND julianday(p.p50Date) - julianday('now') > 0
  `).get(country) as { cnt: number };

  // Surge count
  const surgeCount = db.prepare(`
    SELECT COUNT(*) AS cnt
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
    protectedPairs: protectedPairs.cnt,
    activeSurges: surgeCount.cnt,
  });
}
