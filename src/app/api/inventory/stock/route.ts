import { NextRequest } from 'next/server';
import { getDb } from '@/db/connection';
import { deriveCurrentStock } from '@/services/inventoryService';

interface BatchRow {
  batchNumber: string | null;
  expiryDate: string | null;
  totalReceived: number;
  totalConsumed: number;
}

/**
 * GET /api/inventory/stock?facilityId=&medicineId=
 *
 * Returns current stock level and batch breakdown for a facility-medicine pair.
 * Batches include expiry status: 'expired', 'expiring_soon' (≤30d), 'ok'.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const facilityId = searchParams.get('facilityId');
  const medicineId = searchParams.get('medicineId');

  if (!facilityId || !medicineId) {
    return Response.json({ error: 'facilityId and medicineId are required' }, { status: 400 });
  }

  try {
    const db = getDb();
    const currentStock = deriveCurrentStock(facilityId, medicineId);

    // Aggregate batches from RECEIVED events
    const batchRows = db.prepare(`
      SELECT
        batchNumber,
        expiryDate,
        SUM(CASE WHEN type = 'RECEIVED' THEN quantity ELSE 0 END) AS totalReceived,
        SUM(CASE WHEN type IN ('DISPENSED','EXPIRED','DAMAGED') THEN quantity ELSE 0 END) AS totalConsumed
      FROM inventory_events
      WHERE facilityId = ? AND medicineId = ? AND batchNumber IS NOT NULL
      GROUP BY batchNumber, expiryDate
      ORDER BY expiryDate ASC NULLS LAST
    `).all(facilityId, medicineId) as BatchRow[];

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysOut = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const batches = batchRows.map((b) => {
      const netQty = Math.max(0, b.totalReceived - b.totalConsumed);
      let expiryStatus: 'ok' | 'expiring_soon' | 'expired' = 'ok';
      if (b.expiryDate) {
        if (b.expiryDate <= today) expiryStatus = 'expired';
        else if (b.expiryDate <= thirtyDaysOut) expiryStatus = 'expiring_soon';
      }
      return {
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        estimatedQuantity: netQty,
        expiryStatus,
      };
    });

    const activeBatches = batches.filter((b) => b.expiryStatus !== 'expired');
    const earliestExpiry = activeBatches.find((b) => b.expiryDate)?.expiryDate ?? null;

    return Response.json({
      facilityId,
      medicineId,
      currentStock,
      batches,
      activeBatchCount: activeBatches.length,
      earliestExpiry,
    });
  } catch (err) {
    console.error('[/api/inventory/stock]', err);
    return Response.json({ error: 'Failed to fetch stock data' }, { status: 500 });
  }
}
