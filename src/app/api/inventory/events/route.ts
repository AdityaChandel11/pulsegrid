import { NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

/**
 * GET /api/inventory/events?facilityId=&medicineId=&limit=50
 *
 * Returns paginated inventory events for a facility (and optionally a specific medicine),
 * newest-first, with medicine name joined.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const facilityId = searchParams.get('facilityId');
  const medicineId = searchParams.get('medicineId');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);

  if (!facilityId) {
    return Response.json({ error: 'facilityId is required' }, { status: 400 });
  }

  try {
    const db = getDb();

    const sql = medicineId
      ? `SELECT
           e.id, e.facilityId, e.medicineId, e.type, e.quantity,
           e.timestamp, e.source, e.batchNumber, e.expiryDate, e.notes,
           m.name AS medicineName, m.unit AS medicineUnit, m.category AS medicineCategory
         FROM inventory_events e
         JOIN medicines m ON m.id = e.medicineId
         WHERE e.facilityId = ? AND e.medicineId = ?
         ORDER BY e.timestamp DESC
         LIMIT ?`
      : `SELECT
           e.id, e.facilityId, e.medicineId, e.type, e.quantity,
           e.timestamp, e.source, e.batchNumber, e.expiryDate, e.notes,
           m.name AS medicineName, m.unit AS medicineUnit, m.category AS medicineCategory
         FROM inventory_events e
         JOIN medicines m ON m.id = e.medicineId
         WHERE e.facilityId = ?
         ORDER BY e.timestamp DESC
         LIMIT ?`;

    const rows = medicineId
      ? db.prepare(sql).all(facilityId, medicineId, limit)
      : db.prepare(sql).all(facilityId, limit);

    return Response.json(rows);
  } catch (err) {
    console.error('[/api/inventory/events]', err);
    return Response.json({ error: 'Failed to fetch inventory events' }, { status: 500 });
  }
}
