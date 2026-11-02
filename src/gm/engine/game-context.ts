import { clamp, createRng } from "@/gm/engine/rng";

/**
 * All contextual randomness comes from a separate seeded stream. Changing game
 * timing must not accidentally alter how every shooter performs or how many
 * possessions a game has.
 */
function bell(rng: () => number): number {
  // Unit-variance Irwin-Hall approximation, bounded to avoid huge outliers.
  let n = 0;
  for (let i = 0; i < 6; i++) n += rng();
  return clamp((n - 3) * Math.SQRT2, -2.4, 2.4);
}

export type MatchForm = { shot: number; volume: number; tempo: number };
export type PlayerNight = { shot: number; volume: number };

export function teamMatchForm(seed: number, side: number): MatchForm {
  const rng = createRng((seed ^ (side ? 0x51633e2d : 0x2c0a62f9)) >>> 0);
  return {
    shot: bell(rng) * 0.016,
    volume: clamp(1 + bell(rng) * 0.018, 0.95, 1.05),
    tempo: bell(rng) * 1.5,
  };
}

export function playerNightForm(seed: number, id: string): PlayerNight {
  let h = (seed ^ 2166136261) >>> 0;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const rng = createRng(h);
  return {
    shot: bell(rng) * 0.027,
    volume: clamp(1 + bell(rng) * 0.115, 0.75, 1.33),
  };
}

/**
 * Half-court actions generally run 9–24s. Transition plays and offensive
 * putbacks happen more quickly, while dead-ball stoppages fill the remainder
 * of the period. Clock positions are non-uniform, ascending and within the
 * active substitution frame. The 2-minute shift book remains authoritative.
 */
export function frameActionTimes(
  start: number,
  duration: number,
  count: number,
  rng: () => number
): number[] {
  if (count <= 0) return [];
  const gaps: number[] = [];
  for (let i = 0; i < count; i++) {
    const transition = rng() < 0.18;
    gaps.push(transition ? 5 + rng() * 6 : 10 + (rng() + rng()) * 6.5);
  }
  const sum = gaps.reduce((a, b) => a + b, 0);
  let cumulative = 0;
  return gaps.map(g => {
    const time = start + duration * (cumulative + g * 0.7) / sum;
    cumulative += g;
    return clamp(time, start + 0.04, start + duration - 0.04);
  });
}
