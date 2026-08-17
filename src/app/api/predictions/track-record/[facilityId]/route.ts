import { type NextRequest } from 'next/server';
import { getTrackRecord } from '@/lib/predictions';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> },
) {
  const { facilityId } = await params;
  const record = getTrackRecord(facilityId);
  return Response.json(record);
}
