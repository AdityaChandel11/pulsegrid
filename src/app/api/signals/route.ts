import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country');

  if (!country) {
    return Response.json({ error: 'country required' }, { status: 400 });
  }

  const db = getDb();

  // Return signals from the OTHER two countries
  const rows = db.prepare(`
    SELECT cs.country, cs.medicineCategory, cs.demandTrendIndex, cs.surgeActive, cs.timestamp
    FROM country_signals cs
    WHERE cs.country != ?
    AND cs.timestamp = (
      SELECT MAX(cs2.timestamp)
      FROM country_signals cs2
      WHERE cs2.country = cs.country AND cs2.medicineCategory = cs.medicineCategory
    )
    ORDER BY cs.country, cs.medicineCategory
  `).all(country) as {
    country: string; medicineCategory: string; demandTrendIndex: number;
    surgeActive: number; timestamp: string;
  }[];

  const result = rows.map((r) => ({
    country: r.country,
    medicineCategory: r.medicineCategory,
    demandTrendIndex: r.demandTrendIndex,
    surgeActive: Boolean(r.surgeActive),
    timestamp: r.timestamp,
  }));

  return Response.json(result);
}
