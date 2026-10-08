import { calendar, performanceLevel } from "./career";
import { peerName } from "./names";
import { clamp, hashString, rngOf, createStreams, Rng } from "./rng";
import { nbaTeam } from "./routes";
import { currentLevel, projectedCeiling } from "./skills";
import type { LifeState } from "./types";
import { PLAYABLE_COUNTRIES } from "./world";

/**
 * Draft model (game rules, simplified from the NBA CBA and not re-verified in
 * this snapshot): you may declare from the year you turn 19, if you are one
 * season past US high school; everyone is automatically in the pool the year
 * they turn 22. Two rounds, 60 picks. Prospects are fictional.
 */

export function ageInYear(state: LifeState, year: number) {
  return year - state.identity.birthYear;
}

export function canDeclare(state: LifeState, year: number): boolean {
  if (state.achievements.drafted || state.placement.node === "nba") return false;
  const a = ageInYear(state, year);
  if (a < 19) return false;
  const hsYear = typeof state.flags.hsGradYear === "number" ? state.flags.hsGradYear : null;
  if (hsYear !== null && year < hsYear + 1) return false;
  return a <= 24;
}

export function autoEligible(state: LifeState, year: number): boolean {
  const a = ageInYear(state, year);
  return a >= 22 && a <= 23 && !state.achievements.drafted && state.placement.node !== "nba";
}

/** How NBA teams value the player on draft night (model). */
export function draftValue(state: LifeState): number {
  const proj = projectedCeiling(state).mid;
  const lvl = currentLevel(state);
  const age = state.ageMonths / 12;
  return 0.55 * proj + 0.35 * lvl + 0.07 * state.exposure + clamp(21 - age, -3, 3) * 0.8;
}

export interface Prospect {
  name: string;
  countryId: string;
  value: number;
  isPlayer?: boolean;
}

/** A fictional draft class seeded from the life seed and year. */
export function draftClass(seed: number, year: number): Prospect[] {
  const streams = createStreams(hashString(`${seed}:draft:${year}`), 0);
  const rng = new Rng(streams, "draft");
  const out: Prospect[] = [];
  for (let i = 0; i < 80; i++) {
    const c = rng.weighted(PLAYABLE_COUNTRIES, (x) => Math.sqrt(x.draw.weight));
    out.push({ name: peerName(rng, c.id), countryId: c.id, value: rng.normal(66, 5) });
  }
  return out.sort((a, b) => b.value - a.value);
}

export interface DraftResult {
  pick: number | null;
  team: string | null;
  board: Prospect[];
}

export function runDraft(state: LifeState, year: number): DraftResult {
  const rng = rngOf(state.rng, "draft");
  const noise = rng.normal(0, 2.5 * (1 - state.exposure / 130));
  const teamU = rng.next();
  const me: Prospect = { name: state.identity.displayName, countryId: state.birthplace.countryId, value: draftValue(state) + noise, isPlayer: true };
  const board = [...draftClass(state.seed, year), me].sort((a, b) => b.value - a.value);
  const rank = board.indexOf(me) + 1;
  const pick = rank <= 60 ? rank : null;
  return { pick, team: pick ? nbaTeam((teamU + pick * 0.137) % 1) : null, board: board.slice(0, 60) };
}

/** First-round rookie salary by pick (model, USD). */
export function rookieSalary(pick: number): number {
  if (pick > 30) return 1_270_000;
  return Math.round((10_500_000 - (pick - 1) * 280_000) / 10_000) * 10_000;
}

/** Chance of an NBA call-up this month for a G League player (model). */
export function callUpChance(state: LifeState): number {
  const lvl = performanceLevel(state);
  const twoWay = state.placement.contract?.twoWay ? 1.6 : 1;
  const { month } = calendar(state);
  if (![11, 12, 1, 2, 3, 4].includes(month)) return 0;
  return clamp(((lvl - 66) / 30) * twoWay * (0.5 + state.exposure / 100), 0, 0.3);
}

export function nbaSeasonMonth(state: LifeState): boolean {
  return [10, 11, 12, 1, 2, 3, 4].includes(calendar(state).month);
}
