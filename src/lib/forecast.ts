/**
 * PulseGrid — Medicine Forecasting Engine
 *
 * Monte Carlo simulation for days-to-stockout prediction.
 * Uses Mulberry32 PRNG for determinism (MONTE_CARLO_SEED).
 */

import {
  MONTE_CARLO_PATHS,
  MONTE_CARLO_SEED,
  FORECAST_HISTORY_DAYS,
  TREND_WINDOW_DAYS,
} from '@/constants';
import { getCurrentStock, getDailyDispensedSeries } from './inventory';
import { detectSurge } from './surge';

// ---------- Deterministic PRNG (Mulberry32) ----------

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Box-Muller for normal random variates
function normalRandom(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

export interface ForecastResult {
  p10Days: number;
  p50Days: number;
  p90Days: number;
  surgeFlag: boolean;
  currentStock: number;
  baselineMean: number;
  baselineStd: number;
  trendMultiplier: number;
}

/**
 * Run the full forecasting pipeline for a facility-medicine pair.
 */
export function computeForecast(facilityId: string, medicineId: string): ForecastResult {
  const currentStock = getCurrentStock(facilityId, medicineId);
  const dailySeries = getDailyDispensedSeries(facilityId, medicineId, FORECAST_HISTORY_DAYS);

  // Surge detection (modifies baseline window)
  const { surgeFlag, baselineWindowDays } = detectSurge(dailySeries);

  // Compute baseline mean/std over the effective window
  const baselineSlice = dailySeries.slice(-baselineWindowDays);

  let baselineMean: number;
  let baselineStd: number;

  if (baselineSlice.length === 0) {
    // No data — assume 1 unit/day consumption, no variance
    baselineMean = 1;
    baselineStd = 0.5;
  } else {
    baselineMean = baselineSlice.reduce((s, d) => s + d.qty, 0) / baselineSlice.length;
    const variance = baselineSlice.reduce((s, d) => s + (d.qty - baselineMean) ** 2, 0) / baselineSlice.length;
    baselineStd = Math.sqrt(variance);
    if (baselineMean === 0) baselineMean = 1;
    if (baselineStd === 0) baselineStd = baselineMean * 0.1;
  }

  // 7-day trend multiplier
  const trendMultiplier = computeTrendMultiplier(dailySeries);

  // Monte Carlo simulation
  const rng = mulberry32(MONTE_CARLO_SEED);
  const stockoutDays: number[] = [];
  const MAX_DAYS = 365;

  for (let path = 0; path < MONTE_CARLO_PATHS; path++) {
    let stock = currentStock;
    let day = 0;
    while (stock > 0 && day < MAX_DAYS) {
      day++;
      const dailyDemand = Math.max(0, (baselineMean + normalRandom(rng) * baselineStd) * trendMultiplier);
      stock -= dailyDemand;
    }
    stockoutDays.push(day);
  }

  // Sort and extract percentiles
  stockoutDays.sort((a, b) => a - b);
  const p10Days = stockoutDays[Math.floor(MONTE_CARLO_PATHS * 0.10)] ?? 0;
  const p50Days = stockoutDays[Math.floor(MONTE_CARLO_PATHS * 0.50)] ?? 0;
  const p90Days = stockoutDays[Math.floor(MONTE_CARLO_PATHS * 0.90)] ?? 0;

  return {
    p10Days,
    p50Days,
    p90Days,
    surgeFlag,
    currentStock,
    baselineMean,
    baselineStd,
    trendMultiplier,
  };
}

/**
 * Compute a 7-day trend multiplier.
 * Compares the mean of the last TREND_WINDOW_DAYS to the preceding window.
 */
function computeTrendMultiplier(dailySeries: { date: string; qty: number }[]): number {
  if (dailySeries.length < TREND_WINDOW_DAYS * 2) return 1.0;

  const recent = dailySeries.slice(-TREND_WINDOW_DAYS);
  const prior = dailySeries.slice(-TREND_WINDOW_DAYS * 2, -TREND_WINDOW_DAYS);

  const recentMean = recent.reduce((s, d) => s + d.qty, 0) / recent.length;
  const priorMean = prior.reduce((s, d) => s + d.qty, 0) / prior.length;

  if (priorMean === 0) return 1.0;

  // Clamp between 0.5 and 3.0 to avoid wild extrapolation
  return Math.max(0.5, Math.min(3.0, recentMean / priorMean));
}
