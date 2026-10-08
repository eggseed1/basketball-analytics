import { athleticComposite, heightEstimate } from "./body";
import { clamp, hashString, type Rng } from "./rng";
import type { Body, LifeState, SkillKey, TraitKey } from "./types";

export const SKILLS: { key: SkillKey; label: string; short: string }[] = [
  { key: "finishing", label: "Finishing", short: "FIN" },
  { key: "shooting", label: "Shooting", short: "SHT" },
  { key: "freeThrows", label: "Free throws", short: "FT" },
  { key: "handle", label: "Handle", short: "HND" },
  { key: "passing", label: "Passing", short: "PAS" },
  { key: "offBall", label: "Off-ball movement", short: "OFF" },
  { key: "perimeterD", label: "Perimeter defense", short: "PER" },
  { key: "interiorD", label: "Interior defense", short: "INT" },
  { key: "rebounding", label: "Rebounding", short: "REB" },
  { key: "iq", label: "Basketball IQ", short: "IQ" },
  { key: "decisions", label: "Decision-making", short: "DEC" },
];

export const TRAITS: { key: TraitKey; label: string }[] = [
  { key: "coachability", label: "Coachability" },
  { key: "confidence", label: "Confidence" },
  { key: "composure", label: "Composure" },
  { key: "discipline", label: "Discipline" },
  { key: "motivation", label: "Motivation" },
];

export const SKILL_KEYS = SKILLS.map((s) => s.key);

/**
 * Hidden skill ceilings. One talent factor shared across skills plus per-skill
 * variation (model: 72 + 11T + N(0, 9)). The draw uses the generation stream
 * only and has no country input.
 */
export function generatePotentials(rng: Rng): Record<SkillKey, number> {
  const t = rng.normal(0, 1);
  const out = {} as Record<SkillKey, number>;
  for (const k of SKILL_KEYS) out[k] = Math.round(clamp(72 + 11 * t + rng.normal(0, 9), 25, 99));
  return out;
}

export function generateTraits(rng: Rng): Record<TraitKey, number> {
  const out = {} as Record<TraitKey, number>;
  for (const { key } of TRAITS) out[key] = Math.round(clamp(rng.normal(56, 14), 15, 95));
  return out;
}

export function startingSkills(): Record<SkillKey, number> {
  return Object.fromEntries(SKILL_KEYS.map((k) => [k, 1])) as Record<SkillKey, number>;
}

export type Position = "G" | "W" | "F" | "C";

export function position(heightCm: number, skills: Record<SkillKey, number>): Position {
  const guardLean = (skills.handle + skills.passing) / 2 - (skills.rebounding + skills.interiorD) / 2;
  const h = heightCm - guardLean * 0.15;
  return h < 193 ? "G" : h < 201 ? "W" : h < 207 ? "F" : "C";
}

const POSITION_NEED: Record<Position, number> = { G: 191, W: 200, F: 205, C: 211 };
export const POSITION_LABEL: Record<Position, string> = { G: "Guard", W: "Wing", F: "Forward", C: "Center" };

const WEIGHTS: Record<Position, Partial<Record<SkillKey, number>>> = {
  G: { handle: 1.4, passing: 1.3, shooting: 1.3, finishing: 0.9, perimeterD: 1, decisions: 1.2, iq: 1, offBall: 0.6, freeThrows: 0.4, rebounding: 0.2, interiorD: 0.1 },
  W: { shooting: 1.3, finishing: 1.1, perimeterD: 1.2, offBall: 1, handle: 0.8, passing: 0.7, iq: 0.9, decisions: 0.8, rebounding: 0.5, interiorD: 0.4, freeThrows: 0.4 },
  F: { finishing: 1.2, rebounding: 1.1, interiorD: 1, perimeterD: 0.8, shooting: 0.9, iq: 0.9, decisions: 0.8, offBall: 0.8, passing: 0.6, handle: 0.4, freeThrows: 0.4 },
  C: { finishing: 1.3, rebounding: 1.4, interiorD: 1.5, iq: 0.8, decisions: 0.7, offBall: 0.6, passing: 0.5, shooting: 0.4, perimeterD: 0.4, freeThrows: 0.4, handle: 0.2 },
};

export function skillComposite(skills: Record<SkillKey, number>, pos: Position): number {
  const w = WEIGHTS[pos];
  let sum = 0;
  let tot = 0;
  for (const k of SKILL_KEYS) {
    const wk = w[k] ?? 0.3;
    sum += skills[k] * wk;
    tot += wk;
  }
  return sum / tot;
}

/**
 * Playing level on the game's 0-100 scale. A league's rotation level is
 * 0.8 x its model strength (NBA rotation about 80, NBA fringe about 70).
 */
export function playingLevel(skills: Record<SkillKey, number>, body: Body, heightCm = body.heightCm, sizeWeight = 1): number {
  const pos = position(heightCm, skills);
  // Height matters in absolute terms (tall players are rare and valued) and relative to position.
  const absolute = clamp((heightCm - 189) * 0.75, -22, 15) - Math.max(0, 178 - heightCm) * 0.3;
  const fit = clamp((heightCm - POSITION_NEED[pos]) / 3, -4, 3);
  const size = absolute + fit + clamp((body.wingspanCm - body.heightCm) / 3, -3, 4);
  return clamp(0.7 * skillComposite(skills, pos) + 0.3 * athleticComposite(body) + size * sizeWeight, 0, 100);
}

export function currentLevel(state: LifeState): number {
  const injuryPenalty = state.condition.injury ? 6 * state.condition.injury.severity : 0;
  return Math.max(0, playingLevel(state.skills, state.body) - injuryPenalty);
}

/** True projected peak: uses hidden ceilings. Never shown directly. */
export function trueCeiling(state: LifeState): number {
  const peakBody: Body = { ...state.body, heightCm: state.growth.adultHeightCm, wingspanCm: state.growth.adultHeightCm * state.growth.wingspanRatio };
  for (const k of ["strength", "acceleration", "lateral", "vertical", "stamina", "coordination", "durability"] as const) {
    peakBody[k] = Math.max(state.body[k], state.growth.athleticCeiling[k]);
  }
  const skills = { ...state.skills };
  for (const k of SKILL_KEYS) skills[k] = Math.max(state.skills[k], state.potentials[k] * 0.92);
  return playingLevel(skills, peakBody, state.growth.adultHeightCm);
}

/**
 * Observer's projection of peak level: true ceiling plus deterministic,
 * shrinking error derived from the seed and year. No stream is consumed.
 */
export function projectedCeiling(state: LifeState): { mid: number; spread: number } {
  const age = state.ageMonths / 12;
  const spread = clamp(14 - age * 0.55 - state.exposure * 0.06, 2, 14);
  const h = hashString(`${state.seed}:proj:${Math.floor(age)}`) / 4294967296;
  const err = (h - 0.5) * spread;
  const mid = clamp(trueCeiling(state) * 0.6 + currentLevel(state) * 0.4 + (trueCeiling(state) - currentLevel(state)) * 0.25 + err, 0, 100);
  return { mid, spread };
}

export type ReadinessBand = "too-early" | "long-way" | "pro-prospect" | "radar" | "draft-range" | "nba-ready";

export const READINESS_LABEL: Record<ReadinessBand, string> = {
  "too-early": "Too early to tell",
  "long-way": "Long way off",
  "pro-prospect": "Pro prospect",
  radar: "On the NBA radar",
  "draft-range": "Draft range",
  "nba-ready": "NBA-ready",
};

export const READINESS_ORDER: ReadinessBand[] = ["too-early", "long-way", "pro-prospect", "radar", "draft-range", "nba-ready"];

export function readiness(state: LifeState): ReadinessBand {
  const age = state.ageMonths / 12;
  if (age < 12) return "too-early";
  const lvl = currentLevel(state);
  if (age >= 18 && lvl >= 71) return "nba-ready";
  const { mid } = projectedCeiling(state);
  if (mid >= 70) return "draft-range";
  if (mid >= 65) return "radar";
  if (mid >= 56) return "pro-prospect";
  return "long-way";
}

export function archetype(state: LifeState): string {
  const s = state.skills;
  const b = state.body;
  const pos = position(b.heightCm, s);
  if (state.ageMonths < 10 * 12) return "Still finding a game";
  const top = [...SKILL_KEYS].sort((a, c) => s[c] - s[a]);
  const has = (k: SkillKey, n = 3) => top.slice(0, n).includes(k);
  if (pos === "G") {
    if (has("passing") && has("decisions", 4)) return "Floor general";
    if (has("shooting") && has("handle", 4)) return "Shot creator";
    if (has("perimeterD")) return "Point-of-attack defender";
    if (has("finishing")) return "Downhill slasher";
    return "Combo guard";
  }
  if (pos === "W") {
    if (has("shooting") && has("perimeterD", 4)) return "3-and-D wing";
    if (has("handle") || has("passing")) return "Playmaking wing";
    if (has("finishing")) return "Slashing wing";
    return "Two-way wing";
  }
  if (pos === "F") {
    if (has("shooting")) return "Stretch forward";
    if (has("passing")) return "Point forward";
    if (has("rebounding")) return "Glass-cleaning forward";
    return "Energy forward";
  }
  if (has("shooting")) return "Stretch big";
  if (has("interiorD")) return "Rim protector";
  if (has("passing")) return "Hub big";
  return "Interior big";
}

export interface ScoutingReport {
  strengths: string[];
  concerns: string[];
  roles: string[];
  evidence: string[];
  uncertainty: string;
  band: ReadinessBand;
}

export function scoutingReport(state: LifeState): ScoutingReport {
  const age = state.ageMonths / 12;
  const band = readiness(state);
  const evidence = [...state.evidence].sort((a, b) => b.weight - a.weight).slice(0, 3).map((e) => e.text);
  if (age < 8) {
    return { strengths: [], concerns: [], roles: [], evidence, uncertainty: "No scouting at this age.", band };
  }
  const sorted = [...SKILLS].sort((a, b) => state.skills[b.key] - state.skills[a.key]);
  const strengths = sorted.slice(0, 3).map((s) => `${s.label} (${Math.round(state.skills[s.key])})`);
  const concerns = sorted.slice(-2).map((s) => `${s.label} (${Math.round(state.skills[s.key])})`);
  const est = heightEstimate(state);
  if (est && age < 19) {
    if (est.mid >= 198) strengths.push("Projects to be tall for any position");
    else if (est.mid <= 180) concerns.push("Projects to be undersized");
  }
  if (state.body.wingspanCm - state.body.heightCm >= 8 && age >= 12) strengths.push("Long wingspan for his height");
  if (state.condition.injuryHistory >= 3) concerns.push(`Injury history (${state.condition.injuryHistory} injuries)`);
  if (state.traits.discipline < 35) concerns.push("Discipline questions");
  const pos = position(state.body.heightCm, state.skills);
  const roles = [archetype(state), POSITION_LABEL[pos]];
  const { spread } = projectedCeiling(state);
  const uncertainty = spread >= 10 ? "Wide. Few scouts have seen him play." : spread >= 6 ? "Moderate. The film is building." : "Narrow. Scouts have a clear picture.";
  return { strengths, concerns, roles, evidence, uncertainty, band };
}

export function skillBar(state: LifeState): number {
  return skillComposite(state.skills, position(state.body.heightCm, state.skills));
}

export function athleticismBar(state: LifeState): number {
  return athleticComposite(state.body);
}
