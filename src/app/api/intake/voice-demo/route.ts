/**
 * POST /api/intake/voice-demo
 *
 * Simulated voice log adapter.
 * Returns deterministic parsed intake data — clearly labelled as a demo simulation.
 * No live speech-to-text API is called in this phase.
 *
 * In production, this would call a speech recognition service to parse voice entries.
 */
import { getDb } from '@/db/connection';

const VOICE_SCENARIOS = [
  { keyword: 'Paracetamol', qty: 150, action: 'received' },
  { keyword: 'Amoxicillin', qty: 80, action: 'received' },
  { keyword: 'ORS', qty: 500, action: 'received' },
  { keyword: 'Metformin', qty: 200, action: 'received' },
  { keyword: 'Insulin', qty: 30, action: 'received' },
];

export async function POST() {
  const scenario = VOICE_SCENARIOS[new Date().getMinutes() % VOICE_SCENARIOS.length];
  const batchNumber = `BT-VOICE-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 999) + 100)}`;

  // Try to resolve real medicine ID from DB
  let medicineId = scenario.keyword.toLowerCase().replace(/\s/g, '-');
  let medicineName = scenario.keyword;
  try {
    const db = getDb();
    const row = db.prepare(
      `SELECT id, name FROM medicines WHERE name LIKE ? LIMIT 1`,
    ).get(`%${scenario.keyword}%`) as { id: string; name: string } | undefined;
    if (row) {
      medicineId = row.id;
      medicineName = row.name;
    }
  } catch { /* use defaults */ }

  const transcribedText = `Received ${scenario.qty} units of ${scenario.keyword}, batch number ${batchNumber}, expiry March 2027`;

  return Response.json({
    _demo: true,
    _note: '[SIMULATED] This is a deterministic demo of voice log parsing. No real speech-to-text API was called.',
    transcription: transcribedText,
    parsedData: {
      medicineId,
      medicineName,
      quantity: scenario.qty,
      batchNumber,
      expiryDate: '2027-03-31',
      source: 'VOICE_LOG' as const,
      transcribedAt: new Date().toISOString(),
      confidence: 0.87,
    },
  });
}
