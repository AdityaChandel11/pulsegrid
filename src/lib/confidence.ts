/**
 * PulseGrid — Confidence Scoring
 *
 * Deterministic weighted formula:
 * Confidence = (WeightA * FreshnessScore) + (WeightB * HistoricalAccuracy)
 * Freshness = SimulationClock - last_event_timestamp
 */

import {
  SOURCE_WEIGHTS,
  RECENCY_DECAY_HALF_LIFE_HOURS,
  RECENCY_DECAY_FLOOR,
  RECENCY_DECAY_MAX_HOURS,
} from '@/constants';
import type { EventSource } from '@/constants';
import { getTrackRecord } from './predictions';
import { SimulationClock } from './clock';

export const CONFIDENCE_WEIGHT_A = 0.6; // Weight for FreshnessScore
export const CONFIDENCE_WEIGHT_B = 0.4; // Weight for HistoricalAccuracy

/**
 * Compute freshness score (0-100) strictly from SimulationClock - last_event_timestamp.
 */
export function computeFreshnessScore(
  lastEventTimestamp: string,
  source: EventSource = 'BARCODE',
): number {
  const clockMs = SimulationClock.getTime();
  const eventMs = new Date(lastEventTimestamp).getTime();
  const ageMs = Math.max(0, clockMs - eventMs);
  const ageHours = ageMs / (1000 * 60 * 60);

  const sourceWeight = SOURCE_WEIGHTS[source] ?? 0.8;

  let decay: number;
  if (ageHours >= RECENCY_DECAY_MAX_HOURS) {
    decay = RECENCY_DECAY_FLOOR;
  } else {
    decay = Math.max(RECENCY_DECAY_FLOOR, Math.pow(0.5, ageHours / RECENCY_DECAY_HALF_LIFE_HOURS));
  }

  return Math.max(0, Math.min(100, 100 * decay * sourceWeight));
}

/**
 * Compute confidence score (0-100) for a forecast.
 * Formula: Confidence = (WeightA * FreshnessScore) + (WeightB * HistoricalAccuracy)
 */
export function computeConfidence(params: {
  source?: EventSource;
  lastEventTimestamp: string;
  p10Days?: number;
  p50Days?: number;
  p90Days?: number;
  facilityId: string;
}): number {
  const { source = 'BARCODE', lastEventTimestamp, facilityId } = params;

  const freshnessScore = computeFreshnessScore(lastEventTimestamp, source);
  const trackRecord = getTrackRecord(facilityId);
  const historicalAccuracy = trackRecord.accuracyScore * 100; // 0-100 scale

  const confidence = (CONFIDENCE_WEIGHT_A * freshnessScore) +
                     (CONFIDENCE_WEIGHT_B * historicalAccuracy);

  return Math.round(Math.max(0, Math.min(100, confidence)));
}
