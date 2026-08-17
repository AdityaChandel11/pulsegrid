import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string; medicineId: string }> }
) {
  const { facilityId, medicineId } = await params;
  const db = getDb();

  const prediction = db.prepare(
    `SELECT p10Date, p50Date, p90Date, confidenceScore, surgeFlag, createdAt
     FROM predictions
     WHERE facilityId = ? AND medicineId = ?
     ORDER BY createdAt DESC LIMIT 1`
  ).get(facilityId, medicineId) as {
    p10Date: string; p50Date: string; p90Date: string;
    confidenceScore: number; surgeFlag: number; createdAt: string;
  } | undefined;

  if (!prediction) {
    return Response.json({ error: 'No forecast found' }, { status: 404 });
  }

  const lastEvent = db.prepare(
    `SELECT source, timestamp FROM inventory_events
     WHERE facilityId = ? AND medicineId = ?
     ORDER BY timestamp DESC LIMIT 1`
  ).get(facilityId, medicineId) as { source: string; timestamp: string } | undefined;

  const now = new Date();
  const p10Date = new Date(prediction.p10Date);
  const p50Date = new Date(prediction.p50Date);
  const p90Date = new Date(prediction.p90Date);

  const p10Days = Math.max(0, Math.round((p10Date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const p50Days = Math.max(0, Math.round((p50Date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const p90Days = Math.max(0, Math.round((p90Date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return Response.json({
    p10Days,
    p50Days,
    p90Days,
    confidenceScore: prediction.confidenceScore,
    surgeFlag: Boolean(prediction.surgeFlag),
    source: lastEvent?.source ?? 'manual',
    lastUpdated: lastEvent?.timestamp ?? prediction.createdAt,
  });
}
