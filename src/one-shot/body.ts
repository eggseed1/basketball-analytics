import { clamp, round1, type Rng } from "./rng";
import type { AthleticKey, Body, Growth, LifeState } from "./types";

/**
 * Body model. Height follows a hidden adult target and a puberty timing
 * offset; the UI only ever sees the current measurement and a projected range
 * that narrows with age. Parents are drawn from one global distribution:
 * birthplace never changes body or talent.
 *
 * Model parameters: parent heights N(180, 8) cm and N(167, 7.5) cm (a slightly
 * tall pool, since every life here is a basketball life), mid-parent target
 * with N(0, 6) cm individual variation.
 */

// Median male height fraction of adult height by age in years (from the shape
// of standard growth charts; model approximation).
const FRACTION: [number, number][] = [
  [0, 0.282], [1, 0.429], [2, 0.492], [3, 0.542], [4, 0.582], [5, 0.621], [6, 0.655], [7, 0.689],
  [8, 0.723], [9, 0.751], [10, 0.78], [11, 0.808], [12, 0.842], [13, 0.881], [14, 0.927], [15, 0.96],
  [16, 0.983], [17, 0.994], [18, 0.997], [19, 0.999], [20, 1], [30, 1],
];

function interp(table: [number, number][], x: number): number {
  if (x <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    const [x0, y0] = table[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1]![1];
}

/** Puberty offset matters between about 9 and 21. */
function effectiveAge(ageYears: number, offsetMonths: number): number {
  const w = ageYears < 8 ? 0 : ageYears < 12 ? (ageYears - 8) / 4 : ageYears < 17 ? 1 : ageYears < 21 ? (21 - ageYears) / 4 : 0;
  return Math.max(0, ageYears - (offsetMonths / 12) * w);
}

export function heightFraction(ageMonths: number, offsetMonths: number): number {
  return interp(FRACTION, effectiveAge(ageMonths / 12, offsetMonths));
}

// Athletic maturation curve, 0-1 of adult capacity.
const MATURE: [number, number][] = [[0, 0.05], [3, 0.15], [6, 0.3], [10, 0.45], [13, 0.6], [16, 0.82], [19, 0.95], [23, 1], [28, 1], [32, 0.95], [36, 0.86]];
export function maturation(ageMonths: number, offsetMonths: number): number {
  return interp(MATURE, effectiveAge(ageMonths / 12, offsetMonths));
}

const ATHLETIC: AthleticKey[] = ["strength", "acceleration", "lateral", "vertical", "stamina", "coordination", "durability"];

export function generateParents(rng: Rng) {
  return {
    fatherHeightCm: Math.round(clamp(rng.normal(180, 8), 155, 215)),
    motherHeightCm: Math.round(clamp(rng.normal(167, 7.5), 145, 200)),
  };
}

export function generateGrowth(rng: Rng, father: number, mother: number): Growth {
  const mid = (father + mother + 13) / 2;
  const adultHeightCm = round1(clamp(mid + rng.normal(0, 6), 158, 228));
  const pubertyOffsetMonths = Math.round(clamp(rng.normal(0, 13), -30, 30));
  const wingspanRatio = clamp(rng.normal(1.035, 0.025), 0.97, 1.11);
  const frameMassFactor = clamp(rng.normal(1, 0.07), 0.84, 1.18);
  // One shared athletic factor plus per-trait noise; size trades off against
  // quickness and favours strength.
  const g = rng.normal(0, 1);
  const tall = (adultHeightCm - 190) / 12;
  const ceil = (bias: number) => Math.round(clamp(64 + 9 * g + bias + rng.normal(0, 8), 30, 99));
  const athleticCeiling = {
    strength: ceil(4 * tall + 6 * (frameMassFactor - 1) * 10),
    acceleration: ceil(-4 * tall),
    lateral: ceil(-5 * tall),
    vertical: ceil(-2 * tall - 3 * (frameMassFactor - 1) * 10),
    stamina: ceil(0),
    coordination: ceil(0),
    durability: ceil(2 * (frameMassFactor - 1) * 10),
  } satisfies Record<AthleticKey, number>;
  return { adultHeightCm, pubertyOffsetMonths, wingspanRatio, athleticCeiling, frameMassFactor };
}

const BMI: [number, number][] = [[0, 13.5], [1, 17], [3, 16], [6, 15.5], [10, 17], [14, 19], [17, 21], [20, 22.5], [25, 23.5], [32, 24.5]];

export function bodyAt(ageMonths: number, growth: Growth, prev: Body | null, frame: Body["frame"]): Body {
  const frac = heightFraction(ageMonths, growth.pubertyOffsetMonths);
  const heightCm = round1(growth.adultHeightCm * frac);
  const m = maturation(ageMonths, growth.pubertyOffsetMonths);
  const strength = prev ? prev.strength : Math.round(growth.athleticCeiling.strength * m);
  const leanBonus = clamp((strength - 50) / 100, -0.1, 0.25);
  const bmi = interp(BMI, ageMonths / 12) * growth.frameMassFactor * (1 + leanBonus * 0.35);
  const weightKg = round1((heightCm / 100) ** 2 * bmi);
  const wingRatio = 1 + (growth.wingspanRatio - 1) * clamp((ageMonths / 12 - 4) / 12, 0.2, 1);
  const wingspanCm = round1(heightCm * wingRatio);
  const reachCm = round1(heightCm * 1.31 + (wingspanCm - heightCm) * 0.55);
  const athletic = Object.fromEntries(ATHLETIC.map((k) => [k, prev ? prev[k as keyof Body] : Math.round(growth.athleticCeiling[k] * m)])) as Record<AthleticKey, number>;
  const verticalCm = round1(8 + 0.62 * athletic.vertical * m);
  return {
    heightCm,
    weightKg,
    wingspanCm,
    reachCm,
    frame,
    verticalCm,
    vertical: athletic.vertical,
    strength: athletic.strength,
    acceleration: athletic.acceleration,
    lateral: athletic.lateral,
    stamina: athletic.stamina,
    coordination: athletic.coordination,
    durability: athletic.durability,
    measuredAtMonths: prev?.measuredAtMonths ?? null,
  };
}

/**
 * Monthly body step: measurements follow the hidden plan; athletic ratings
 * drift toward ceiling x maturation and take training gains.
 */
export function stepBody(state: LifeState, gains: Partial<Record<AthleticKey, number>>) {
  const { growth } = state;
  const m = maturation(state.ageMonths, growth.pubertyOffsetMonths);
  const prev = state.body;
  const next = bodyAt(state.ageMonths, growth, prev, prev.frame);
  for (const k of ATHLETIC) {
    const natural = growth.athleticCeiling[k] * m;
    const cur = prev[k as keyof Body] as number;
    // Natural maturation closes a share of the gap each month; training can
    // push up to 12 points above the untrained curve.
    let v = cur + (natural - cur) * 0.08 + (gains[k] ?? 0);
    v = Math.min(v, natural + 12, 99);
    (next as unknown as Record<string, number>)[k] = round1(Math.max(1, v));
  }
  next.verticalCm = round1(8 + 0.62 * next.vertical * m);
  state.body = next;
}

export function athleticComposite(b: Body): number {
  return (b.acceleration * 1.1 + b.lateral + b.vertical * 0.9 + b.strength * 0.8 + b.stamina * 0.6 + b.coordination * 0.8) / 5.2;
}

/** Projected adult height range from what an observer can know at this age. */
export function heightEstimate(state: LifeState): { low: number; high: number; mid: number } | null {
  const age = state.ageMonths / 12;
  if (age < 4) return null;
  const frac = heightFraction(state.ageMonths, 0);
  const mid = state.body.heightCm / frac;
  const sd = interp([[4, 7.5], [8, 6.5], [11, 6], [13, 5.5], [15, 4], [17, 2.2], [19, 1], [21, 0]], age);
  const parentPull = (state.family.fatherHeightCm + state.family.motherHeightCm + 13) / 2;
  const blend = interp([[4, 0.45], [10, 0.3], [14, 0.15], [17, 0]], age);
  const center = mid * (1 - blend) + parentPull * blend;
  return { low: Math.round(center - 1.3 * sd), high: Math.round(center + 1.3 * sd), mid: Math.round(center) };
}

export function fmtHeight(cm: number, units: "metric" | "imperial"): string {
  if (units === "metric") return `${Math.round(cm)} cm`;
  const inches = cm / 2.54;
  let ft = Math.floor(inches / 12);
  let inch = Math.round(inches - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return `${ft}′${inch}″`;
}

export function fmtWeight(kg: number, units: "metric" | "imperial"): string {
  return units === "metric" ? `${Math.round(kg)} kg` : `${Math.round(kg * 2.20462)} lb`;
}

export function fmtLength(cm: number, units: "metric" | "imperial"): string {
  return units === "metric" ? `${Math.round(cm)} cm` : `${round1(cm / 2.54)} in`;
}

export const FRAME_LABEL = ["", "Slight", "Lean", "Average", "Solid", "Broad"] as const;
