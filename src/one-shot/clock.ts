import type { Pacing, Speed } from "./types";

/** Months of life per real second at 1x. */
export const PACE_RATE: Record<Pacing, number> = { short: 1.5, standard: 1, extended: 0.75 };
export const TICK_MS = 250;
/** Upper bound on months simulated in one timer tick. */
export const MAX_BATCH = 4;

/**
 * One timer tick. `acc` carries fractional months between ticks and is capped,
 * so a stalled tab never catches up on missed time.
 */
export function tick(acc: number, pacing: Pacing, speed: Speed, tickMs = TICK_MS): { months: number; acc: number } {
  const next = Math.min(acc + (PACE_RATE[pacing] * speed * tickMs) / 1000, MAX_BATCH);
  const months = Math.floor(next);
  return { months, acc: next - months };
}
