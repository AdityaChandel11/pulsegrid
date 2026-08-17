import { type NextRequest } from 'next/server';
import { getRecommendation } from '@/lib/redistribution';

export async function GET(request: NextRequest) {
  const facilityId = request.nextUrl.searchParams.get('facilityId');
  const medicineId = request.nextUrl.searchParams.get('medicineId');

  if (!facilityId || !medicineId) {
    return Response.json({ error: 'facilityId and medicineId are required' }, { status: 400 });
  }

  const recommendation = await getRecommendation(facilityId, medicineId);

  if (!recommendation) {
    return Response.json({ error: 'No suitable redistribution candidates found' }, { status: 404 });
  }

  return Response.json(recommendation);
}
