/**
 * POST /api/intake/ocr-demo
 *
 * Simulated OCR/Invoice scan adapter.
 * Returns deterministic parsed intake data — clearly labelled as a demo simulation.
 * No live AI/OCR API is called in this phase.
 *
 * In production, this would call an OCR service to parse invoice images.
 */
import { getDb } from '@/db/connection';

const DEMO_MEDICINES = [
  { id: 'paracetamol', name: 'Paracetamol 500mg', unit: 'tablets' },
  { id: 'amoxicillin', name: 'Amoxicillin 250mg', unit: 'capsules' },
  { id: 'metformin', name: 'Metformin 500mg', unit: 'tablets' },
  { id: 'ors-sachets', name: 'ORS Sachets', unit: 'sachets' },
  { id: 'insulin-regular', name: 'Regular Insulin', unit: 'vials' },
];

export async function POST() {
  // Pick a deterministic demo medicine based on current hour
  const hourIndex = new Date().getHours() % DEMO_MEDICINES.length;
  const med = DEMO_MEDICINES[hourIndex];

  // Try to resolve real medicine ID from DB
  let medicineId = med.id;
  let medicineName = med.name;
  try {
    const db = getDb();
    const row = db.prepare(
      `SELECT id, name FROM medicines WHERE name LIKE ? LIMIT 1`,
    ).get(`%${med.name.split(' ')[0]}%`) as { id: string; name: string } | undefined;
    if (row) {
      medicineId = row.id;
      medicineName = row.name;
    }
  } catch { /* use defaults */ }

  const batchNumber = `BT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const expiryDate = new Date(Date.now() + 365 * 86400000 * (1.5 + (new Date().getMinutes() % 2))).toISOString().split('T')[0];
  const quantity = 200 + (new Date().getMinutes() % 5) * 50;

  return Response.json({
    _demo: true,
    _note: '[SIMULATED] This is a deterministic demo of OCR invoice parsing. No real OCR API was called.',
    parsedData: {
      medicineId,
      medicineName,
      quantity,
      batchNumber,
      expiryDate,
      unit: med.unit,
      source: 'OCR_INVOICE' as const,
      invoiceRef: `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      parsedAt: new Date().toISOString(),
      confidence: 0.93,
    },
  });
}
