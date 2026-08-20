import { SimulationClock } from '@/lib/clock';

export async function GET() {
  const simulationTime = SimulationClock.getISO();
  return Response.json({ simulationTime });
}
