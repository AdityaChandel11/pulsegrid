import { type NextRequest } from 'next/server';
import { getSignalsExcluding } from '@/lib/signals';
import type { Country } from '@/constants';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country') as Country | null;

  if (!country) {
    return Response.json({ error: 'country parameter is required' }, { status: 400 });
  }

  const signals = getSignalsExcluding(country);
  return Response.json(signals);
}
