import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

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
           m.name AS medicineName
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
    facilityId: string; medicineId: string;
    p10Date: string; p50Date: string; p90Date: string;
    confidenceScore: number; surgeFlag: number; createdAt: string;
    facilityName: string; facilityType: string; district: string;
    medicineName: string;
  }[];

  const now = Date.now();

  const result = rows.map((r) => {
    const p50Days = Math.max(0, Math.round((new Date(r.p50Date).getTime() - now) / (1000 * 60 * 60 * 24)));
    const p10Days = Math.max(0, Math.round((new Date(r.p10Date).getTime() - now) / (1000 * 60 * 60 * 24)));
    const p90Days = Math.max(0, Math.round((new Date(r.p90Date).getTime() - now) / (1000 * 60 * 60 * 24)));
    const surgeFlag = Boolean(r.surgeFlag);

    // Risk score: lower p50 = higher risk, boosted by surge, weighted by confidence
    const surgeMult = surgeFlag ? 0.5 : 1.0;
    const confidenceWeight = r.confidenceScore / 100;
    const riskScore = p50Days * surgeMult / Math.max(confidenceWeight, 0.1);

    return {
      facilityId: r.facilityId,
      medicineId: r.medicineId,
      facilityName: r.facilityName,
      facilityType: r.facilityType,
      district: r.district,
      medicineName: r.medicineName,
      p10Days,
      p50Days,
      p90Days,
      confidenceScore: r.confidenceScore,
      surgeFlag,
      riskScore,
    };
  });

  // Sort by risk score ascending (most at-risk first)
  result.sort((a, b) => a.riskScore - b.riskScore);

  return Response.json(result);
}
