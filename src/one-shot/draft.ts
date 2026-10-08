import { calendar, performanceLevel } from "./career";
import { peerName } from "./names";
import { clamp, hashString, rngOf, createStreams, Rng } from "./rng";
import { NBA_TEAMS } from "./routes";
import { currentLevel, projectedCeiling } from "./skills";
import type { Combine, DraftPick, LifeState, TraitKey } from "./types";
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

/** Draft order for a year: the 30 teams reshuffled, the same order in both rounds (game rule, no lottery odds). */
export function draftOrder(seed: number, year: number): string[] {
  const rng = new Rng(createStreams(hashString(`${seed}:draft-order:${year}`), 0), "draft");
  const teams = [...NBA_TEAMS];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [teams[i], teams[j]] = [teams[j]!, teams[i]!];
  }
  return teams;
}

export function teamAtPick(order: string[], pick: number): string {
  return order[(pick - 1) % order.length]!;
}

/** Draft value with this cycle's combine, interview and workout results. */
export function stockedValue(state: LifeState): number {
  return draftValue(state) + state.draft.stock;
}

/** Where he would go if the draft were today, before draft-night noise. */
export function projectedRank(state: LifeState, year: number, shift = 0): number {
  const v = stockedValue(state) + shift;
  return draftClass(state.seed, year).filter((p) => p.value > v).length + 1;
}

/** Draft-value points he trails the 60th prospect by (negative when inside the top 60). */
export function gapToSixty(state: LifeState, year: number): number {
  return draftClass(state.seed, year)[59]!.value - stockedValue(state);
}

/** Draft-night spread in value points: wider when fewer scouts have seen him. */
export function draftSpread(state: LifeState): number {
  return 2.5 * (1 - state.exposure / 130);
}

export function projectedRange(state: LifeState, year: number) {
  const sd = draftSpread(state);
  return { best: projectedRank(state, year, sd), mid: projectedRank(state, year), worst: projectedRank(state, year, -sd) };
}

/** Combine invite, measurements and testing (model). About 75 prospects get invited. */
export function runCombine(state: LifeState, year: number, rng: Rng): Combine {
  const b = state.body;
  const invited = projectedRank(state, year) <= 75;
  const laneAgilitySec = Math.round((12.2 - b.lateral * 0.018 + rng.normal(0, 0.12)) * 100) / 100;
  const sprintSec = Math.round((3.55 - b.acceleration * 0.0045 + rng.normal(0, 0.03)) * 100) / 100;
  const z = (b.vertical - 62 + (b.lateral - 62) + (b.acceleration - 62)) / 36 + rng.normal(0, 0.3);
  const wing = clamp((b.wingspanCm - b.heightCm) / 8, -1, 1) * 0.5;
  const delta = invited ? clamp(Math.round((z * 0.9 + wing) * 10) / 10, -2.5, 2.5) : 0;
  return { year, invited, heightCm: b.heightCm, wingspanCm: b.wingspanCm, reachCm: b.reachCm, weightKg: b.weightKg, laneAgilitySec, sprintSec, delta };
}

export interface InterviewAnswer {
  label: string;
  hint: string;
  base: number;
  traits: Partial<Record<TraitKey, number>>;
}

export interface InterviewQuestion {
  id: string;
  text: string;
  answers: InterviewAnswer[];
}

/** `{weak}` is replaced with his weakest skill. */
export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: "bench",
    text: "A coach benches you for a month. What do you do?",
    answers: [
      { label: "Ask him what to fix", hint: "Coachable.", base: 0.6, traits: { coachability: 0.6 } },
      { label: "Keep working and say nothing", hint: "Quiet.", base: 0.3, traits: { discipline: 0.5 } },
      { label: "Have my agent look into a trade", hint: "Some teams hate this.", base: -0.6, traits: { confidence: 0.3 } },
    ],
  },
  {
    id: "best",
    text: "Who is the best player in this draft?",
    answers: [
      { label: "Me", hint: "Works if you believe it.", base: 0, traits: { confidence: 1 } },
      { label: "Someone else, and here is why", hint: "Shows you watch the game.", base: 0.3, traits: { composure: 0.4 } },
      { label: "I don't follow that stuff", hint: "A shrug.", base: -0.2, traits: {} },
    ],
  },
  {
    id: "late",
    text: "We heard you were out late before a big game. True?",
    answers: [
      { label: "Yes. It won't happen again.", hint: "Owns it.", base: 0.4, traits: { discipline: 0.5 } },
      { label: "No, that's a rumor", hint: "Depends how calm you sound.", base: 0, traits: { composure: 0.8 } },
      { label: "Who told you that?", hint: "Defensive.", base: -0.8, traits: {} },
    ],
  },
  {
    id: "role",
    text: "Would you take a bench role as a rookie?",
    answers: [
      { label: "Whatever the team needs", hint: "Easy to coach.", base: 0.5, traits: { coachability: 0.4 } },
      { label: "Yes, and I plan to earn more", hint: "Hungry.", base: 0.4, traits: { motivation: 0.6 } },
      { label: "I see myself as a starter", hint: "Bold.", base: -0.2, traits: { confidence: 0.7 } },
    ],
  },
  {
    id: "miss",
    text: "You miss a game-winner on national TV. What happens next?",
    answers: [
      { label: "I want the next one", hint: "Nerve.", base: 0.2, traits: { confidence: 0.5, composure: 0.4 } },
      { label: "I watch the film that night", hint: "Work ethic.", base: 0.4, traits: { motivation: 0.5 } },
      { label: "Honestly, it would stay with me", hint: "Honest, maybe too honest.", base: 0, traits: { coachability: 0.3 } },
    ],
  },
  {
    id: "money",
    text: "What is the first thing you do with your rookie contract?",
    answers: [
      { label: "Take care of my family", hint: "Grounded.", base: 0.3, traits: {} },
      { label: "Save most of it", hint: "Disciplined.", base: 0.3, traits: { discipline: 0.5 } },
      { label: "Buy a car", hint: "Teams notice.", base: -0.3, traits: { confidence: 0.3 } },
    ],
  },
  {
    id: "weak",
    text: "What is the weakest part of your game?",
    answers: [
      { label: "My {weak}, and here is my plan", hint: "Self-aware.", base: 0.6, traits: { coachability: 0.4 } },
      { label: "I don't really have one", hint: "Scouts have film.", base: -0.6, traits: { confidence: 0.4 } },
      { label: "Probably defense", hint: "A safe dodge.", base: 0, traits: {} },
    ],
  },
  {
    id: "coach",
    text: "What would your last coach say about you?",
    answers: [
      { label: "That I listen", hint: "Coachable.", base: 0.3, traits: { coachability: 0.5 } },
      { label: "That I outwork everyone", hint: "They will call him.", base: 0.2, traits: { motivation: 0.5 } },
      { label: "Ask him yourself", hint: "Cocky.", base: -0.1, traits: { confidence: 0.5, composure: -0.2 } },
    ],
  },
];

/**
 * Every prospect arrives coached, so a polished answer barely moves teams;
 * `base` is relative to that and `interviewDelta` subtracts the polish.
 */
/** Three questions and three teams for a draft year, picked by seed. */
export function interviewPlan(state: LifeState, year: number): { questions: InterviewQuestion[]; teams: string[] } {
  const rng = new Rng(createStreams(hashString(`${state.seed}:interviews:${year}`), 0), "draft");
  const pool = [...INTERVIEW_QUESTIONS];
  const questions: InterviewQuestion[] = [];
  for (let i = 0; i < 3; i++) questions.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!);
  const order = draftOrder(state.seed, year);
  const mid = Math.min(projectedRank(state, year), 60);
  const teams: string[] = [];
  for (let k = 0; teams.length < 3; k++) {
    const t = teamAtPick(order, Math.max(1, mid - 3 + Math.floor(rng.next() * 7)) + k);
    if (!teams.includes(t)) teams.push(t);
  }
  return { questions, teams };
}

export function interviewDelta(state: LifeState, a: InterviewAnswer, roll: number): number {
  let d = a.base - 0.4 + (roll - 0.5) * 0.6;
  for (const [k, w] of Object.entries(a.traits) as [TraitKey, number][]) d += (w * (state.traits[k] - 50)) / 50;
  return clamp(Math.round(d * 10) / 10, -1.5, 1.5);
}

export interface DraftResult {
  pick: number | null;
  team: string | null;
  board: DraftPick[];
  promiseKept: boolean;
}

export function runDraft(state: LifeState, year: number): DraftResult {
  const rng = rngOf(state.rng, "draft");
  const noise = rng.normal(0, draftSpread(state));
  const me: Prospect = { name: state.identity.displayName, countryId: state.birthplace.countryId, value: stockedValue(state) + noise, isPlayer: true };
  const board = [...draftClass(state.seed, year), me].sort((a, b) => b.value - a.value);
  const promise = state.draft.promise;
  const natural = board.indexOf(me) + 1;
  const promiseKept = Boolean(promise && natural > promise.pick);
  if (promiseKept) {
    board.splice(natural - 1, 1);
    board.splice(promise!.pick - 1, 0, me);
  }
  const order = draftOrder(state.seed, year);
  const picks: DraftPick[] = board.slice(0, 60).map((p, i) => ({ pick: i + 1, team: teamAtPick(order, i + 1), name: p.name, countryId: p.countryId, ...(p.isPlayer ? { isPlayer: true } : {}) }));
  const rank = board.indexOf(me) + 1;
  const pick = rank <= 60 ? rank : null;
  return { pick, team: pick ? teamAtPick(order, pick) : null, board: picks, promiseKept };
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
