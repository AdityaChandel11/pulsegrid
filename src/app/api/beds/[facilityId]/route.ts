import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';
import { BED_WARNING_THRESHOLD, BED_CRITICAL_THRESHOLD } from '@/constants';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  const { facilityId } = await params;
  const db = getDb();

  const rows = db.prepare(
    'SELECT ward, total, occupied, updatedAt FROM beds WHERE facilityId = ?'
  ).all(facilityId) as { ward: string; total: number; occupied: number; updatedAt: string }[];

  const result = rows.map((r) => {
    const ratio = r.total > 0 ? r.occupied / r.total : 0;
    let status: 'normal' | 'warning' | 'critical' = 'normal';
    if (ratio >= BED_CRITICAL_THRESHOLD) status = 'critical';
    else if (ratio >= BED_WARNING_THRESHOLD) status = 'warning';
    return { ward: r.ward, total: r.total, occupied: r.occupied, status };
  });

  return Response.json(result);
}
