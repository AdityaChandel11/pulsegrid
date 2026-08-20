import { NextRequest } from 'next/server';
import {
  recordInventoryEvent,
  InvalidQuantityError,
  FacilityNotFoundError,
  MedicineNotFoundError,
} from '@/services/inventoryService';
import { SimulationClock } from '@/lib/clock';
import type { InventoryEventSource } from '@/types';

const VALID_SOURCES = new Set<InventoryEventSource>([
  'MANUAL', 'OCR_INVOICE', 'VOICE_LOG', 'BARCODE', 'SIMULATION',
]);

/**
 * POST /api/inventory/receive
 *
 * Records a RECEIVED inventory event for a facility-medicine pair.
 * Body: { facilityId, medicineId, quantity, source, batchNumber?, expiryDate?, notes? }
 *
 * Returns: { success, eventId, newStock }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    facilityId,
    medicineId,
    quantity,
    source,
    batchNumber,
    expiryDate,
    notes,
  } = body as Record<string, unknown>;

  // Validate required fields
  if (!facilityId || typeof facilityId !== 'string') {
    return Response.json({ error: 'facilityId is required' }, { status: 400 });
  }
  if (!medicineId || typeof medicineId !== 'string') {
    return Response.json({ error: 'medicineId is required' }, { status: 400 });
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
    return Response.json({ error: 'quantity must be a positive integer' }, { status: 400 });
  }
  if (!source || !VALID_SOURCES.has(source as InventoryEventSource)) {
    return Response.json({
      error: `source must be one of: ${[...VALID_SOURCES].join(', ')}`,
    }, { status: 400 });
  }
  if (expiryDate && typeof expiryDate === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
    return Response.json({ error: 'expiryDate must be YYYY-MM-DD format' }, { status: 400 });
  }

  try {
    const result = recordInventoryEvent({
      facilityId,
      medicineId,
      eventType: 'RECEIVED',
      quantity: quantity as number,
      source: source as InventoryEventSource,
      timestamp: SimulationClock.getISO(),
      batchNumber: typeof batchNumber === 'string' ? batchNumber : undefined,
      expiryDate: typeof expiryDate === 'string' ? expiryDate : undefined,
      notes: typeof notes === 'string' ? notes : undefined,
    });

    return Response.json({
      success: true,
      eventId: result.id,
      newStock: result.newStock,
    });
  } catch (err) {
    if (err instanceof InvalidQuantityError) {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof FacilityNotFoundError) {
      return Response.json({ error: err.message, code: err.code }, { status: 404 });
    }
    if (err instanceof MedicineNotFoundError) {
      return Response.json({ error: err.message, code: err.code }, { status: 404 });
    }
    console.error('[/api/inventory/receive]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
