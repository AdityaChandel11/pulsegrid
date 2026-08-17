/**
 * PulseGrid — Country Signal Exchange
 *
 * Returns aggregated CountrySignal rows for the OTHER two countries only.
 * Never exposes facility-level or patient-level data cross-country.
 */

import { getDb } from '@/db/connection';
import type { CountrySignal } from '@/types';
import type { Country } from '@/constants';

/**
 * Get the latest signals for countries OTHER than the specified one.
 */
export function getSignalsExcluding(country: Country): CountrySignal[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT cs.country, cs.medicineCategory, cs.demandTrendIndex, cs.surgeActive, cs.timestamp
    FROM country_signals cs
    INNER JOIN (
      SELECT country, medicineCategory, MAX(timestamp) AS maxTs
      FROM country_signals
      WHERE country != ?
      GROUP BY country, medicineCategory
    ) latest
    ON cs.country = latest.country
      AND cs.medicineCategory = latest.medicineCategory
      AND cs.timestamp = latest.maxTs
    ORDER BY cs.country, cs.medicineCategory
  `).all(country) as {
    country: CountrySignal['country'];
    medicineCategory: string;
    demandTrendIndex: number;
    surgeActive: number;
    timestamp: string;
  }[];

  return rows.map(r => ({
    country: r.country,
    medicineCategory: r.medicineCategory,
    demandTrendIndex: r.demandTrendIndex,
    surgeActive: r.surgeActive === 1,
    timestamp: r.timestamp,
  }));
}
