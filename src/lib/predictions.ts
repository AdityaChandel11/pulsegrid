/**
 * PulseGrid — Prediction Accuracy Tracking
 *
 * Compares resolved predictions (where resolvedActualDate is set) against
 * the p50 prediction to produce a rolling accuracy score.
 */

import { getDb } from '@/db/connection';

export interface TrackRecord {
  accuracyScore: number;   // 0-1 fraction of predictions within tolerance
  avgErrorDays: number;    // average |p50 - actual| in days
  sampleSize: number;
}

/**
 * Compute track record for all resolved predictions at a facility.
 * A prediction is "accurate" if |p50Date - resolvedActualDate| <= 3 days.
 */
export function getTrackRecord(facilityId: string): TrackRecord {
  const db = getDb();

  const rows = db.prepare(`
    SELECT p50Date, resolvedActualDate
    FROM predictions
    WHERE facilityId = ? AND resolvedActualDate IS NOT NULL
  `).all(facilityId) as { p50Date: string; resolvedActualDate: string }[];

  if (rows.length === 0) {
    return { accuracyScore: 0.5, avgErrorDays: 0, sampleSize: 0 };
  }

  let totalError = 0;
  let accurate = 0;
  const TOLERANCE_DAYS = 3;

  for (const row of rows) {
    const p50 = new Date(row.p50Date).getTime();
    const actual = new Date(row.resolvedActualDate).getTime();
    const errorDays = Math.abs(p50 - actual) / (1000 * 60 * 60 * 24);
    totalError += errorDays;
    if (errorDays <= TOLERANCE_DAYS) accurate++;
  }

  return {
    accuracyScore: Math.round((accurate / rows.length) * 100) / 100,
    avgErrorDays: Math.round((totalError / rows.length) * 10) / 10,
    sampleSize: rows.length,
  };
}

/**
 * Derive an accuracy multiplier (0.5 – 1.0) for confidence scoring.
 * With no data, defaults to 0.75 (neutral).
 */
export function getAccuracyMultiplier(facilityId: string): number {
  const record = getTrackRecord(facilityId);
  if (record.sampleSize === 0) return 0.75;
  // Scale: accuracyScore 0→0.5, 1→1.0
  return 0.5 + record.accuracyScore * 0.5;
}
