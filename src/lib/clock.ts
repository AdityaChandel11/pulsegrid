/**
 * PulseGrid — Global Simulation Clock
 *
 * Decouples the simulation, event generation, risk analysis, and forecasting
 * from real wall-clock time (Date.now() / new Date()).
 */

import { getDb } from '@/db/connection';

class SimulationClockState {
  private currentTime: Date | null = null;

  /**
   * Get the current simulation time.
   * If not initialized, loads the latest timestamp from inventory_events or falls back to baseline.
   */
  public now(): Date {
    if (!this.currentTime) {
      this.initFromDb();
    }
    return new Date(this.currentTime!.getTime());
  }

  public getISO(): string {
    return this.now().toISOString();
  }

  public getDateString(): string {
    return this.now().toISOString().split('T')[0];
  }

  public getTime(): number {
    return this.now().getTime();
  }

  /**
   * Set the simulation time explicitly.
   */
  public setTime(time: Date | string | number): void {
    this.currentTime = new Date(time);
  }

  /**
   * Advance the simulation clock by a duration in milliseconds (default: 1 simulation day = 86,400,000 ms).
   */
  public tick(advanceMs: number = 86400000): Date {
    const current = this.now();
    this.currentTime = new Date(current.getTime() + advanceMs);
    return new Date(this.currentTime.getTime());
  }

  private initFromDb(): void {
    try {
      const db = getDb();
      const row = db.prepare(`
        SELECT MAX(timestamp) AS latestTime FROM inventory_events
      `).get() as { latestTime: string | null } | undefined;

      if (row?.latestTime) {
        this.currentTime = new Date(row.latestTime);
      } else {
        this.currentTime = new Date('2026-08-20T00:00:00.000Z');
      }
    } catch {
      this.currentTime = new Date('2026-08-20T00:00:00.000Z');
    }
  }
}

export const SimulationClock = new SimulationClockState();
