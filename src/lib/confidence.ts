/**
 * PulseGrid — Confidence Scoring
 *
 * confidence = 100 * sourceWeight * recencyDecay * spreadPenalty * accuracyMultiplier
 */

import {
  SOURCE_WEIGHTS,
  RECENCY_DECAY_HALF_LIFE_HOURS,
  RECENCY_DECAY_FLOOR,
  RECENCY_DECAY_MAX_HOURS,
} from '@/constants';
import type { EventSource } from '@/constants';
import { getAccuracyMultiplier } from './predictions';

/**
 * Compute confidence score (0-100) for a forecast.
 */
export function computeConfidence(params: {
  source: EventSource;
  lastEventTimestamp: string;
  p10Days: number;
  p50Days: number;
  p90Days: number;
  facilityId: string;
}): number {
  const { source, lastEventTimestamp, p10Days, p50Days, p90Days, facilityId } = params;

  const sourceWeight = SOURCE_WEIGHTS[source];
  const recency = computeRecencyDecay(lastEventTimestamp);
  const spread = computeSpreadPenalty(p10Days, p50Days, p90Days);
  const accuracy = getAccuracyMultiplier(facilityId);

  const raw = 100 * sourceWeight * recency * spread * accuracy;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * Exponential decay based on how stale the most recent event is.
 * Half-life of 24 hours, floor of 0.1, maxes out at 96 hours.
 */
function computeRecencyDecay(lastEventTimestamp: string): number {
  const ageMs = Date.now() - new Date(lastEventTimestamp).getTime();
  const ageHours = Math.max(0, ageMs / (1000 * 60 * 60));

  if (ageHours >= RECENCY_DECAY_MAX_HOURS) return RECENCY_DECAY_FLOOR;

  const decay = Math.pow(0.5, ageHours / RECENCY_DECAY_HALF_LIFE_HOURS);
  return Math.max(RECENCY_DECAY_FLOOR, decay);
}

/**
 * Penalize wide prediction bands. As the p10-p90 spread grows relative
 * to the p50 value, confidence decreases.
 */
function computeSpreadPenalty(p10Days: number, p50Days: number, p90Days: number): number {
  if (p50Days <= 0) return 0.5;

  const spread = p90Days - p10Days;
  const ratio = spread / p50Days;

  // ratio of 0 → penalty 1.0 (perfect); ratio >= 2 → penalty 0.3
  if (ratio <= 0) return 1.0;
  if (ratio >= 2) return 0.3;

  return 1.0 - 0.35 * ratio;
}
