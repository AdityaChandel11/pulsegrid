import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';
import { STAFF_SHORTAGE_DEFICIT, STAFF_CRITICAL_DEFICIT } from '@/constants';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  const { facilityId } = await params;
  const db = getDb();

  const rows = db.prepare(
    'SELECT role, required, available, updatedAt FROM staff_roster WHERE facilityId = ?'
  ).all(facilityId) as { role: string; required: number; available: number; updatedAt: string }[];

  const result = rows.map((r) => {
    const deficit = r.required - r.available;
    let status: 'ok' | 'shortage' | 'critical' = 'ok';
    if (deficit >= STAFF_CRITICAL_DEFICIT) status = 'critical';
    else if (deficit >= STAFF_SHORTAGE_DEFICIT) status = 'shortage';
    return { role: r.role, required: r.required, available: r.available, status };
  });

  return Response.json(result);
}
