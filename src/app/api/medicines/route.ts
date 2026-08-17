import { getDb } from '@/db/connection';

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM medicines').all();
  return Response.json(rows);
}
