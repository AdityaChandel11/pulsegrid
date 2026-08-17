import { type NextRequest } from 'next/server';
import { getBedStatus } from '@/lib/beds';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> },
) {
  const { facilityId } = await params;
  const beds = getBedStatus(facilityId);
  return Response.json(beds);
}
