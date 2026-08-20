import { NextRequest } from 'next/server';
import {
  recordInventoryEvent,
  InsufficientStockError,
  InvalidQuantityError,
  FacilityNotFoundError,
  MedicineNotFoundError,
} from '@/services/inventoryService';
import { SimulationClock } from '@/lib/clock';

/**
 * POST /api/inventory/dispense
 *
 * Records a DISPENSED inventory event.
 * Body: { facilityId, medicineId, quantity, batchNumber?, notes? }
 *
 * Returns: { success, eventId, newStock }
 * Rejects: 400 if quantity > current stock (InsufficientStockError)
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { facilityId, medicineId, quantity, batchNumber, notes } = body as Record<string, unknown>;

  if (!facilityId || typeof facilityId !== 'string') {
    return Response.json({ error: 'facilityId is required' }, { status: 400 });
  }
  if (!medicineId || typeof medicineId !== 'string') {
    return Response.json({ error: 'medicineId is required' }, { status: 400 });
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
    return Response.json({ error: 'quantity must be a positive integer' }, { status: 400 });
  }

  try {
    const result = recordInventoryEvent({
      facilityId,
      medicineId,
      eventType: 'DISPENSED',
      quantity: quantity as number,
      source: 'MANUAL',
      timestamp: SimulationClock.getISO(),
      batchNumber: typeof batchNumber === 'string' ? batchNumber : undefined,
      notes: typeof notes === 'string' ? notes : undefined,
    });

    return Response.json({
      success: true,
      eventId: result.id,
      newStock: result.newStock,
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return Response.json({
        error: err.message,
        code: err.code,
        requested: err.requested,
        available: err.available,
      }, { status: 409 });
    }
    if (err instanceof InvalidQuantityError) {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof FacilityNotFoundError) {
      return Response.json({ error: err.message, code: err.code }, { status: 404 });
    }
    if (err instanceof MedicineNotFoundError) {
      return Response.json({ error: err.message, code: err.code }, { status: 404 });
    }
    console.error('[/api/inventory/dispense]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
