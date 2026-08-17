import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';
import type { Facility } from '@/types';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country');
  const db = getDb();

  let facilities: Facility[];
  if (country) {
    facilities = db.prepare('SELECT * FROM facilities WHERE country = ?').all(country) as Facility[];
  } else {
    facilities = db.prepare('SELECT * FROM facilities').all() as Facility[];
  }

  return Response.json(facilities);
}
