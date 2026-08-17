/**
 * PulseGrid — Surge Detection
 *
 * Rolling z-score of daily dispensed qty vs baseline.
 * z > SURGE_ZSCORE_THRESHOLD for SURGE_CONSECUTIVE_DAYS consecutive days → surgeFlag = true.
 */

import {
  SURGE_ZSCORE_THRESHOLD,
  SURGE_CONSECUTIVE_DAYS,
  SURGE_BASELINE_WINDOW_DAYS,
  NORMAL_BASELINE_WINDOW_DAYS,
} from '@/constants';

/**
 * Detect surge from a daily dispensed series.
 * Returns { surgeFlag, baselineWindowDays } so the forecaster can adjust.
 */
export function detectSurge(
  dailySeries: { date: string; qty: number }[],
): { surgeFlag: boolean; baselineWindowDays: number } {
  if (dailySeries.length < NORMAL_BASELINE_WINDOW_DAYS) {
    return { surgeFlag: false, baselineWindowDays: NORMAL_BASELINE_WINDOW_DAYS };
  }

  // Compute baseline mean/std over the normal window (excluding the last SURGE_CONSECUTIVE_DAYS)
  const baselineEnd = dailySeries.length - SURGE_CONSECUTIVE_DAYS;
  const baselineStart = Math.max(0, baselineEnd - NORMAL_BASELINE_WINDOW_DAYS);
  const baselineSlice = dailySeries.slice(baselineStart, baselineEnd);

  if (baselineSlice.length < 3) {
    return { surgeFlag: false, baselineWindowDays: NORMAL_BASELINE_WINDOW_DAYS };
  }

  const mean = baselineSlice.reduce((s, d) => s + d.qty, 0) / baselineSlice.length;
  const variance = baselineSlice.reduce((s, d) => s + (d.qty - mean) ** 2, 0) / baselineSlice.length;
  const std = Math.sqrt(variance);

  if (std === 0) {
    return { surgeFlag: false, baselineWindowDays: NORMAL_BASELINE_WINDOW_DAYS };
  }

  // Check the last SURGE_CONSECUTIVE_DAYS for consecutive z > threshold
  const tail = dailySeries.slice(-SURGE_CONSECUTIVE_DAYS);
  const allAbove = tail.every(d => {
    const z = (d.qty - mean) / std;
    return z > SURGE_ZSCORE_THRESHOLD;
  });

  if (allAbove) {
    return { surgeFlag: true, baselineWindowDays: SURGE_BASELINE_WINDOW_DAYS };
  }

  return { surgeFlag: false, baselineWindowDays: NORMAL_BASELINE_WINDOW_DAYS };
}
