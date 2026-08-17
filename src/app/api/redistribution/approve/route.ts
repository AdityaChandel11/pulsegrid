import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    facilityId: string; medicineId: string; sourceFacilityId: string; quantity: number;
  };

  const { facilityId, medicineId, sourceFacilityId, quantity } = body;

  if (!facilityId || !medicineId || !sourceFacilityId || !quantity) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Insert TRANSFERRED_OUT from source
  db.prepare(`INSERT INTO inventory_events (id, facilityId, medicineId, type, quantity, timestamp, source, notes)
    VALUES (?, ?, ?, 'TRANSFERRED_OUT', ?, ?, 'api', 'Redistribution approval')`
  ).run(`evt_${Date.now()}_out`, sourceFacilityId, medicineId, quantity, now);

  // Insert TRANSFERRED_IN to destination
  db.prepare(`INSERT INTO inventory_events (id, facilityId, medicineId, type, quantity, timestamp, source, notes)
    VALUES (?, ?, ?, 'TRANSFERRED_IN', ?, ?, 'api', 'Redistribution approval')`
  ).run(`evt_${Date.now()}_in`, facilityId, medicineId, quantity, now);

  // Calculate new stocks
  const calcStock = (fId: string) => {
    const row = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type IN ('RECEIVED','TRANSFERRED_IN') THEN quantity ELSE 0 END)
        - SUM(CASE WHEN type IN ('DISPENSED','TRANSFERRED_OUT','EXPIRED','DAMAGED') THEN quantity ELSE 0 END), 0) AS stock
      FROM inventory_events WHERE facilityId = ? AND medicineId = ?
    `).get(fId, medicineId) as { stock: number };
    return row.stock;
  };

  return Response.json({
    success: true,
    newStockAtDestination: calcStock(facilityId),
    newStockAtSource: calcStock(sourceFacilityId),
  });
}
