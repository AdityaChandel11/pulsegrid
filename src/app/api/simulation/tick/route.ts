import { type NextRequest } from 'next/server';
import { stepSimulation } from '@/lib/simulation';
import type { Country } from '@/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const country = (body.country || 'india') as Country;
    const scenario = (body.scenario || 'normal') as 'normal' | 'surge';

    const result = stepSimulation(country, scenario);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Simulation tick failed' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const country = (request.nextUrl.searchParams.get('country') || 'india') as Country;
    const scenario = (request.nextUrl.searchParams.get('scenario') || 'normal') as 'normal' | 'surge';

    const result = stepSimulation(country, scenario);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Simulation tick failed' },
      { status: 500 },
    );
  }
}
