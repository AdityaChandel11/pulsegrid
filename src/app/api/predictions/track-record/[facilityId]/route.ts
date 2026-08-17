import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  const { facilityId } = await params;
  const db = getDb();

  const predictions = db.prepare(
    `SELECT p10Date, p50Date, p90Date, resolvedActualDate
     FROM predictions
     WHERE facilityId = ? AND resolvedActualDate IS NOT NULL`
  ).all(facilityId) as {
    p10Date: string; p50Date: string; p90Date: string; resolvedActualDate: string;
  }[];

  if (predictions.length === 0) {
    return Response.json({ accuracyScore: 0, avgErrorDays: 0, sampleSize: 0 });
  }

  let totalErrorDays = 0;
  let withinRange = 0;

  for (const p of predictions) {
    const actual = new Date(p.resolvedActualDate).getTime();
    const p10 = new Date(p.p10Date).getTime();
    const p90 = new Date(p.p90Date).getTime();
    const p50 = new Date(p.p50Date).getTime();

    if (actual >= p10 && actual <= p90) withinRange++;
    totalErrorDays += Math.abs(actual - p50) / (1000 * 60 * 60 * 24);
  }

  return Response.json({
    accuracyScore: Math.round((withinRange / predictions.length) * 100) / 100,
    avgErrorDays: Math.round((totalErrorDays / predictions.length) * 10) / 10,
    sampleSize: predictions.length,
  });
}
