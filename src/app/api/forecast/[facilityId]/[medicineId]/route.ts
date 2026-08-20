import { type NextRequest } from 'next/server';
import { computeForecast } from '@/lib/forecast';
import { computeConfidence } from '@/lib/confidence';
import { getLatestEventMeta } from '@/lib/inventory';
import { SimulationClock } from '@/lib/clock';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string; medicineId: string }> },
) {
  const { facilityId, medicineId } = await params;

  const forecast = computeForecast(facilityId, medicineId);
  const meta = getLatestEventMeta(facilityId, medicineId);

  const source = meta?.source ?? 'MANUAL';

  const lastUpdated = meta?.timestamp ?? SimulationClock.getISO();

  const confidenceScore = computeConfidence({
    source,
    lastEventTimestamp: lastUpdated,
    p10Days: forecast.p10Days,
    p50Days: forecast.p50Days,
    p90Days: forecast.p90Days,
    facilityId,
  });

  return Response.json({
    p10Days: forecast.p10Days,
    p50Days: forecast.p50Days,
    p90Days: forecast.p90Days,
    confidenceScore,
    surgeFlag: forecast.surgeFlag,
    source,
    lastUpdated,
  });
}
