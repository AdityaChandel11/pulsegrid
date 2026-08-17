import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country');
  const db = getDb();

  let rows;
  if (country) {
    rows = db.prepare('SELECT * FROM facilities WHERE country = ?').all(country);
  } else {
    rows = db.prepare('SELECT * FROM facilities').all();
  }

  return Response.json(rows);
}
