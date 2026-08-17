import { type NextRequest } from 'next/server';
import { getStaffStatus } from '@/lib/staff';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> },
) {
  const { facilityId } = await params;
  const staff = getStaffStatus(facilityId);
  return Response.json(staff);
}
