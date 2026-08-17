import { type NextRequest } from 'next/server';
import { getCurrentStock, getLatestEventMeta } from '@/lib/inventory';
import { computeForecast } from '@/lib/forecast';

export async function GET(request: NextRequest) {
  const facilityId = request.nextUrl.searchParams.get('facilityId');
  const medicineId = request.nextUrl.searchParams.get('medicineId');

  if (!facilityId || !medicineId) {
    return Response.json({ error: 'facilityId and medicineId are required' }, { status: 400 });
  }

  const stock = getCurrentStock(facilityId, medicineId);
  const forecast = computeForecast(facilityId, medicineId);
  const meta = getLatestEventMeta(facilityId, medicineId);

  // Determine status
  let status: 'available' | 'low' | 'unavailable';
  if (stock <= 0) {
    status = 'unavailable';
  } else if (forecast.p50Days <= 7) {
    status = 'low';
  } else {
    status = 'available';
  }

  // Build freshness text
  let freshnessText: string;
  if (meta) {
    const ageMs = Date.now() - new Date(meta.timestamp).getTime();
    const ageMinutes = Math.floor(ageMs / (1000 * 60));
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    const sourceLabel = meta.source === 'api' ? 'API sync' :
      meta.source === 'barcode' ? 'barcode scan' : 'manual entry';

    if (ageMinutes < 60) {
      freshnessText = `Confirmed ${ageMinutes} minutes ago (${sourceLabel})`;
    } else if (ageHours < 24) {
      freshnessText = `Confirmed ${ageHours} hours ago (${sourceLabel})`;
    } else {
      freshnessText = `Confirmed ${ageDays} days ago (${sourceLabel})`;
    }
  } else {
    freshnessText = 'No recent data available';
  }

  return Response.json({ status, freshnessText });
}
