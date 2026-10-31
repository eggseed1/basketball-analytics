import { clamp, round1, type Rng } from "./rng";
import type { AthleticKey, Body, Growth, LifeState } from "./types";
import { adultHeights } from "./world";

/**
 * Body model. Height follows a hidden adult target and a puberty timing
 * offset; the UI only ever sees the current measurement and a projected range
 * that narrows with age.
 *
 * Parents are drawn around their country's measured adult mean (NCD-RisC,
 * 1996 cohort) with within-country SDs of 7 cm (men) and 6.5 cm (women), plus a
 * small family bias because every life here is a basketball life. The son's
 * adult target is a basketball build (guard, wing, forward, or big), shifted by
 * his parents; tall builds are rare by design. Food, sleep, and a few choices
 * can still move that target while the growth plates are open. Birthplace never
 * touches skill talent.
 */
export const HEIGHT_SD = { male: 7, female: 6.5 } as const;
export const FAMILY_BIAS = { male: 2, female: 1.5 } as const;
export const TARGET_SD = 6;

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

export function generateParents(rng: Rng, countryId: string) {
  const nat = adultHeights(countryId);
  return {
    fatherHeightCm: Math.round(clamp(rng.normal(nat.maleCm + FAMILY_BIAS.male, HEIGHT_SD.male), 150, 215)),
    motherHeightCm: Math.round(clamp(rng.normal(nat.femaleCm + FAMILY_BIAS.female, HEIGHT_SD.female), 140, 200)),
  };
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Percentile (1-99) of an adult height among adults of that sex in a country. */
export function heightPercentile(cm: number, sex: "male" | "female", countryId: string): number {
  const nat = adultHeights(countryId);
  const mean = sex === "male" ? nat.maleCm : nat.femaleCm;
  return Math.round(clamp(normalCdf((cm - mean) / HEIGHT_SD[sex]) * 100, 1, 99));
}

/** Share of adults of that sex in a country at or above a height, from the national mean and SD (no family boost). */
export function shareAtLeast(cm: number, sex: "male" | "female", countryId: string): number {
  const nat = adultHeights(countryId);
  const mean = sex === "male" ? nat.maleCm : nat.femaleCm;
  return 1 - normalCdf((cm - mean) / HEIGHT_SD[sex]);
}

/** Mid-parent target and the range that holds about 95% of sons in this model. */
export function parentTarget(father: number, mother: number): { mid: number; low: number; high: number } {
  const mid = (father + mother + 13) / 2;
  return { mid: Math.round(mid), low: Math.round(mid - 1.96 * TARGET_SD), high: Math.round(mid + 1.96 * TARGET_SD) };
}

/** Spots a basketball life can grow into. Weights are the share of new lives. */
const BUILD_SPOTS = [
  { id: "guard", weight: 0.3, mean: 188, sd: 4 },
  { id: "wing", weight: 0.28, mean: 198, sd: 3.6 },
  { id: "forward", weight: 0.24, mean: 206, sd: 3.2 },
  { id: "big", weight: 0.18, mean: 214, sd: 3.2 },
] as const;
/** Mid-parent height the spot means were written around. */
const PARENT_ANCHOR = 181;
const HEIGHT_BONUS_CAP = 14;
const MASS_BONUS_CAP = 0.16;

export function frameFromMass(frameMassFactor: number): Body["frame"] {
  return (frameMassFactor < 0.92 ? 1 : frameMassFactor < 0.97 ? 2 : frameMassFactor < 1.04 ? 3 : frameMassFactor < 1.1 ? 4 : 5) as Body["frame"];
}

/** Where sons of these parents usually land, before food and sleep. */
export function buildOutlook(father: number, mother: number): { low: number; high: number; mid: number } {
  const shift = 0.45 * ((father + mother + 13) / 2 - PARENT_ANCHOR);
  const mid = BUILD_SPOTS.reduce((sum, spot) => sum + spot.weight * spot.mean, 0) + shift;
  const low = BUILD_SPOTS[0]!.mean - 2 * BUILD_SPOTS[0]!.sd + shift;
  const high = BUILD_SPOTS[BUILD_SPOTS.length - 1]!.mean + 2 * BUILD_SPOTS[BUILD_SPOTS.length - 1]!.sd + shift;
  return { low: Math.round(clamp(low, 168, 228)), high: Math.round(clamp(high, 168, 228)), mid: Math.round(clamp(mid, 168, 228)) };
}

/** How much of a height choice still lands. Near zero once he is done growing. */
function heightWindow(ageYears: number): number {
  if (ageYears < 8) return 0.4;
  if (ageYears < 12) return 1;
  if (ageYears < 15) return 1;
  if (ageYears < 17) return 0.7;
  if (ageYears < 19) return 0.35;
  if (ageYears < 21) return 0.08;
  return 0;
}

function syncMeasurements(state: LifeState) {
  const measured = bodyAt(state.ageMonths, state.growth, state.body, state.body.frame);
  state.body.heightCm = measured.heightCm;
  state.body.weightKg = measured.weightKg;
  state.body.wingspanCm = measured.wingspanCm;
  state.body.reachCm = measured.reachCm;
}

/**
 * Raise the hidden adult height. Returns the centimeters actually added.
 * Choices share a cap so milk, sleep, and everything else cannot stack without limit.
 */
export function raiseAdultHeight(state: LifeState, centimeters: number): number {
  const used = typeof state.flags.heightBonus === "number" ? state.flags.heightBonus : 0;
  const want = Math.max(0, centimeters) * heightWindow(state.ageMonths / 12);
  const before = state.growth.adultHeightCm;
  const next = round1(clamp(before + Math.min(want, Math.max(0, HEIGHT_BONUS_CAP - used)), 168, 228));
  const got = round1(next - before);
  if (got <= 0) return 0;
  state.growth.adultHeightCm = next;
  state.flags.heightBonus = round1(used + got);
  const d = got / 10;
  state.body.strength = clamp(round1(state.body.strength + 1.5 * d), 1, 99);
  state.body.acceleration = clamp(round1(state.body.acceleration - d), 1, 99);
  state.body.lateral = clamp(round1(state.body.lateral - 1.2 * d), 1, 99);
  syncMeasurements(state);
  return got;
}

/** Add body mass that sticks. Returns kilograms gained, or 0 when he is already at the cap. */
export function addMass(state: LifeState, factor: number): number {
  const used = typeof state.flags.massBonus === "number" ? state.flags.massBonus : 0;
  const gain = Math.min(Math.max(0, factor), Math.max(0, MASS_BONUS_CAP - used));
  if (gain < 0.004) return 0;
  const before = state.body.weightKg;
  state.growth.frameMassFactor = clamp(state.growth.frameMassFactor + gain, 0.84, 1.22);
  state.flags.massBonus = Math.round((used + gain) * 1000) / 1000;
  state.body.frame = frameFromMass(state.growth.frameMassFactor);
  syncMeasurements(state);
  return Math.max(0, round1(state.body.weightKg - before));
}

export function generateGrowth(rng: Rng, father: number, mother: number): Growth {
  const mid = (father + mother + 13) / 2;
  const spot = rng.weighted(BUILD_SPOTS, (p) => p.weight);
  const adultHeightCm = round1(clamp(spot.mean + 0.45 * (mid - PARENT_ANCHOR) + rng.normal(0, spot.sd), 168, 228));
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
  const fade = state.ageMonths >= 28 * 12 ? 0.05 : 0.015;
  for (const k of ATHLETIC) {
    const natural = growth.athleticCeiling[k] * m;
    const cur = prev[k as keyof Body] as number;
    // Maturation closes a share of the gap below the untrained curve each
    // month. Trained gains above it fade slowly, faster after 28, and can
    // reach 18 points above it.
    let v = cur + (natural - cur) * (cur < natural ? 0.08 : fade) + (gains[k] ?? 0);
    v = Math.min(v, natural + 18, 99);
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
  const outlook = buildOutlook(state.family.fatherHeightCm, state.family.motherHeightCm).mid;
  const blend = interp([[4, 0.22], [10, 0.1], [14, 0.04], [17, 0]], age);
  const center = mid * (1 - blend) + outlook * blend;
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
