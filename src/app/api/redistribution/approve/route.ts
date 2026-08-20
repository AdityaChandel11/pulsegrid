import { executeTransfer } from '@/lib/redistribution';

export async function POST(request: Request) {
  const body = await request.json() as {
    facilityId: string;
    medicineId: string;
    sourceFacilityId: string;
    quantity: number;
  };

  const { facilityId, medicineId, sourceFacilityId, quantity } = body;

  if (!facilityId || !medicineId || !sourceFacilityId || !quantity) {
    return Response.json({ error: 'facilityId, medicineId, sourceFacilityId, and quantity are required' }, { status: 400 });
  }

  if (quantity <= 0) {
    return Response.json({ error: 'quantity must be positive' }, { status: 400 });
  }

  try {
    const result = executeTransfer(sourceFacilityId, facilityId, medicineId, quantity);

    return Response.json({
      success: true,
      newStockAtDestination: result.newStockAtDestination,
      newStockAtSource: result.newStockAtSource,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Transfer failed' },
      { status: 400 },
    );
  }
}
