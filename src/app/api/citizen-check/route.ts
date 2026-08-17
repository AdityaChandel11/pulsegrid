import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

export async function GET(request: NextRequest) {
  const facilityId = request.nextUrl.searchParams.get('facilityId');
  const medicineId = request.nextUrl.searchParams.get('medicineId');

  if (!facilityId || !medicineId) {
    return Response.json({ error: 'facilityId and medicineId required' }, { status: 400 });
  }

  const db = getDb();

  // Calculate current stock
  const stockRow = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type IN ('RECEIVED','TRANSFERRED_IN') THEN quantity ELSE 0 END)
      - SUM(CASE WHEN type IN ('DISPENSED','TRANSFERRED_OUT','EXPIRED','DAMAGED') THEN quantity ELSE 0 END), 0) AS stock
    FROM inventory_events WHERE facilityId = ? AND medicineId = ?
  `).get(facilityId, medicineId) as { stock: number };

  // Get last event for freshness
  const lastEvent = db.prepare(
    `SELECT source, timestamp FROM inventory_events
     WHERE facilityId = ? AND medicineId = ?
     ORDER BY timestamp DESC LIMIT 1`
  ).get(facilityId, medicineId) as { source: string; timestamp: string } | undefined;

  let status: 'available' | 'low' | 'unavailable';
  if (stockRow.stock <= 0) status = 'unavailable';
  else if (stockRow.stock < 50) status = 'low';
  else status = 'available';

  let freshnessText = 'No recent data';
  if (lastEvent) {
    const minutesAgo = Math.round(
      (Date.now() - new Date(lastEvent.timestamp).getTime()) / 60000
    );
    const sourceLabel = lastEvent.source === 'barcode' ? 'barcode scan' :
      lastEvent.source === 'api' ? 'API sync' : 'manual entry';
    if (minutesAgo < 60) {
      freshnessText = `Confirmed ${minutesAgo} minutes ago (${sourceLabel})`;
    } else if (minutesAgo < 1440) {
      freshnessText = `Confirmed ${Math.round(minutesAgo / 60)} hours ago (${sourceLabel})`;
    } else {
      freshnessText = `Confirmed ${Math.round(minutesAgo / 1440)} days ago (${sourceLabel})`;
    }
  }

  return Response.json({ status, freshnessText });
}
