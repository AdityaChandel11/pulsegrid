import { type NextRequest } from 'next/server';
import { getDb } from '@/db/connection';

export async function GET(request: NextRequest) {
  const facilityId = request.nextUrl.searchParams.get('facilityId');
  const medicineId = request.nextUrl.searchParams.get('medicineId');

  if (!facilityId || !medicineId) {
    return Response.json({ error: 'facilityId and medicineId required' }, { status: 400 });
  }

  const db = getDb();

  // Find the facility
  const facility = db.prepare('SELECT name, country, district FROM facilities WHERE id = ?').get(facilityId) as {
    name: string; country: string; district: string;
  } | undefined;

  if (!facility) {
    return Response.json({ error: 'Facility not found' }, { status: 404 });
  }

  // Find a nearby facility with surplus stock
  const candidates = db.prepare(`
    SELECT f.id, f.name, f.lat, f.lng,
      (SELECT COALESCE(SUM(CASE WHEN ie.type IN ('RECEIVED','TRANSFERRED_IN') THEN ie.quantity ELSE 0 END)
        - SUM(CASE WHEN ie.type IN ('DISPENSED','TRANSFERRED_OUT','EXPIRED','DAMAGED') THEN ie.quantity ELSE 0 END), 0)
       FROM inventory_events ie WHERE ie.facilityId = f.id AND ie.medicineId = ?) AS stock
    FROM facilities f
    WHERE f.country = ? AND f.id != ?
    ORDER BY stock DESC
    LIMIT 1
  `).get(medicineId, facility.country, facilityId) as {
    id: string; name: string; lat: number; lng: number; stock: number;
  } | undefined;

  if (!candidates || candidates.stock <= 0) {
    return Response.json({ error: 'No suitable source found' }, { status: 404 });
  }

  const destFacility = db.prepare('SELECT lat, lng FROM facilities WHERE id = ?').get(facilityId) as { lat: number; lng: number };
  const distanceKm = Math.round(
    haversine(destFacility.lat, destFacility.lng, candidates.lat, candidates.lng)
  );
  const quantity = Math.min(300, Math.floor(candidates.stock * 0.3));
  const etaHours = Math.max(1, Math.round(distanceKm / 40));

  const medicine = db.prepare('SELECT name FROM medicines WHERE id = ?').get(medicineId) as { name: string };

  return Response.json({
    sourceFacilityId: candidates.id,
    sourceFacilityName: candidates.name,
    quantity,
    distanceKm,
    etaHours,
    memoText: `${facility.name} projected to run low on ${medicine.name}. ${candidates.name} has surplus stock (${candidates.stock} units). Recommend transferring ${quantity} units (${distanceKm}km, ~${etaHours}h ETA).`,
  });
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
