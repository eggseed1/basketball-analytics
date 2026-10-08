import { bodyAt, generateGrowth, generateParents } from "./body";
import {
  addBox,
  calendar,
  gamesThisMonth,
  levelOf,
  newSeason,
  nodeLabel,
  perGame,
  performanceLevel,
  roleFor,
  ROLE_LABEL,
  seasonMonthIndex,
  simulateGame,
  stageOf,
  STAGE_LABEL,
  type Level,
} from "./career";
import {
  autoEligible,
  callUpChance,
  canDeclare,
  draftOrder,
  draftValue,
  gapToSixty,
  INTERVIEW_QUESTIONS,
  interviewDelta,
  interviewPlan,
  nbaSeasonMonth,
  projectedRange,
  projectedRank,
  rookieSalary,
  runCombine,
  runDraft,
  teamAtPick,
} from "./draft";
import { EVENT_BY_ID, eligibleEvents, eventRate, type EventTemplate } from "./events";
import { canOpen, LADDER, rungCost, rungCountry, rungPay, takeJob, trackOptions, TRACK_LABEL, yearInJob } from "./after";
import { applyMoney, charge, makeAgent, newFinance, stepFinance, type MoneyAction } from "./finance";
import { evaluate, KIND_EXPOSURE, nationalTeam, playTournament, tournamentsFor, type Selection } from "./international";
import { allStarPick, conference, monthHonor, nbaHonors, risingStar, threePointInvite } from "./league";
import { gameScoreTotal } from "./stats";
import { drawName, formatName, poolFor, townName } from "./names";
import { createPeers, stepPeersYear } from "./peers";
import { clamp, createStreams, hashString, rngOf } from "./rng";
import { NBA_TEAMS, nbaTeam, offerBlocked, offseasonOffers, overseasPossible, salaryFor } from "./routes";
import { currentLevel, generatePotentials, generateTraits, readiness, READINESS_LABEL, SKILLS, startingSkills } from "./skills";
import { FOCUS_BY_ID, focusAvailable, stepTraining } from "./training";
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type BoxScore,
  type DecisionChoice,
  type FocusId,
  type HistoryEntry,
  type LifeState,
  type NewLifeOptions,
  type Offer,
  type PendingDecision,
  type PlayoffRun,
  type Role,
  type SeasonLine,
  type Track,
  type Workload,
  type Workouts,
} from "./types";
import { country, maybeLeague, PLAYABLE_COUNTRIES, WORLD_VERSION } from "./world";

export const SNAPSHOT_YEAR = 2026;

const LOCALITY_WEIGHTS: Record<string, [number, number, number, number]> = {
  HIC: [25, 40, 25, 10],
  UMC: [20, 35, 25, 20],
  LMC: [15, 30, 25, 30],
  LIC: [12, 23, 25, 40],
  INX: [18, 32, 25, 25],
};
const MEANS_WEIGHTS: Record<string, number[]> = {
  HIC: [5, 15, 40, 28, 12],
  UMC: [12, 28, 35, 18, 7],
  LMC: [25, 35, 25, 11, 4],
  LIC: [38, 34, 18, 7, 3],
  INX: [20, 30, 30, 15, 5],
};
const MONTHLY_BUDGET = [20, 45, 90, 180, 400];

export const MEANS_LABEL = ["", "Struggling", "Tight", "Steady", "Comfortable", "Well-off"] as const;

/* --------------------------------------------------------------- birth */

export function createLife(opts: NewLifeOptions): LifeState {
  const streams = createStreams(opts.seed);
  const gen = rngOf(streams, "generation");
  const growthRng = rngOf(streams, "growth");
  const birth = gen.weighted(PLAYABLE_COUNTRIES, (c) => (opts.draw === "equal" ? 1 : c.draw.weight));
  const income = birth.income.level;
  const kinds = ["capital", "city", "town", "rural"] as const;
  const lw = LOCALITY_WEIGHTS[income]!;
  const localityKind = gen.weighted(kinds, (k) => lw[kinds.indexOf(k)]!);
  const pool = poolFor(birth.id);
  const town = townName(gen, pool);
  const locality = localityKind === "capital" ? (birth.capital ?? "the capital") : localityKind === "rural" ? (town ? `a village near ${town}` : "a rural village") : (town ?? (localityKind === "city" ? "a mid-size city" : "a small town"));
  const mw = MEANS_WEIGHTS[income]!;
  const means = gen.weighted([1, 2, 3, 4, 5] as const, (m) => mw[m - 1]!);
  const support = gen.weighted(["low", "medium", "high"] as const, (s) => ({ low: 20, medium: 50, high: 30 })[s]);
  const courtScore = means + { capital: 2, city: 1.5, town: 1, rural: 0 }[localityKind] + gen.next() * 3;
  const courtAccess = courtScore >= 7 ? "excellent" : courtScore >= 5 ? "good" : courtScore >= 3 ? "fair" : "poor";
  const parents = generateParents(gen, birth.id);
  const growth = generateGrowth(growthRng, parents.fatherHeightCm, parents.motherHeightCm);
  const potentials = generatePotentials(gen);
  const traits = generateTraits(gen);
  const name = drawName(gen, pool);
  const birthMonthOfYear = gen.int(1, 12);
  const hand = gen.chance(0.1) ? "left" : "right";
  const look = { skin: gen.int(0, 5), hair: gen.int(0, 4), hairColor: gen.int(0, 3), eyes: gen.int(0, 2) };
  const frame = (growth.frameMassFactor < 0.92 ? 1 : growth.frameMassFactor < 0.97 ? 2 : growth.frameMassFactor < 1.04 ? 3 : growth.frameMassFactor < 1.1 ? 4 : 5) as 1 | 2 | 3 | 4 | 5;
  const budget = Math.round(MONTHLY_BUDGET[means - 1]! * birth.model.costIndex);
  const academics = Math.round(clamp(gen.normal(55, 12), 15, 90));
  const place = { countryId: birth.id, locality, localityKind };
  const state: LifeState = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    worldSnapshotVersion: WORLD_VERSION,
    runId: opts.runId ?? `r${opts.seed.toString(36)}`,
    seed: opts.seed,
    mode: opts.mode,
    draw: opts.draw,
    pacing: opts.pacing,
    dailyDate: opts.dailyDate ?? null,
    ageMonths: 0,
    clock: { paused: true, pauseReason: "user", speed: 1, autoDecisions: false },
    identity: { ...name, namePool: pool, birthMonthOfYear, birthYear: SNAPSHOT_YEAR, hand, look },
    birthplace: place,
    residence: { ...place },
    citizenships: [birth.citizenship],
    family: { means, support, courtAccess, ...parents, savings: budget * 6, monthlyBudget: budget, siblings: 0 },
    education: { level: "none", academics, ncaaEligible: true, amateur: true, graduatedHighSchool: false, universityYears: 0 },
    body: bodyAt(0, growth, null, frame),
    growth,
    skills: startingSkills(),
    potentials,
    traits,
    condition: { health: 90, energy: 100, injury: null, injuryHistory: 0 },
    plan: { primary: "free-play", secondary: null, workload: "balanced" },
    placement: { node: "home", countryId: birth.id, leagueId: null, teamName: null, role: "none", coaching: birth.model.coachingAccess * 0.5, since: 0, contract: null, costPerYear: 0 },
    season: null,
    seasons: [],
    lastGame: null,
    bestGame: null,
    gameLog: [],
    finance: newFinance(means),
    international: { countryId: null, caps: 0, tournaments: [], declined: 0 },
    exposure: 0,
    evidence: [],
    offers: [],
    pendingDecision: null,
    history: [],
    cooldowns: {},
    flags: {},
    scheduled: [],
    earnings: 0,
    nbaGames: 0,
    peers: createPeers(streams),
    achievements: { nbaCaliber: null, campInvite: null, drafted: null, rosterSpot: null, nbaDebut: null },
    draft: { declaredYear: null, classSeed: null, result: null, withdrewYears: [], stock: 0, combine: null, interviews: [], workouts: null, promise: null, board: null },
    rng: streams,
    counters: { entry: 0, decision: 0, offer: 0 },
    ended: null,
    keepPlaying: false,
    after: null,
  };
  log(state, "birth", `Born in ${locality}, ${birth.name}.`, null, "neutral");
  return state;
}

/* --------------------------------------------------------------- helpers */

export function log(s: LifeState, kind: HistoryEntry["kind"], text: string, causeId: string | null = null, tone: HistoryEntry["tone"] = "neutral"): string {
  const id = `h${++s.counters.entry}`;
  s.history.push({ id, month: s.ageMonths, kind, text, causeId, tone });
  return id;
}

function decide(s: LifeState, d: Omit<PendingDecision, "id" | "rolls" | "createdAt">) {
  const rng = rngOf(s.rng, "events");
  s.pendingDecision = { ...d, id: `d${++s.counters.decision}`, rolls: [rng.next(), rng.next(), rng.next(), rng.next()], createdAt: s.ageMonths };
  s.clock.pauseReason = "decision";
}

const clone = (s: LifeState): LifeState => structuredClone(s);

/* --------------------------------------------------------------- clock */

export interface AdvanceOptions {
  auto?: boolean;
  stopAtDecision?: boolean;
}

/**
 * Advance up to `months` fixed monthly steps. Results depend only on the
 * state and the choices made, never on how the months are batched.
 */
export function advance(state: LifeState, months: number, opts: AdvanceOptions = {}): LifeState {
  const s = clone(state);
  let done = 0;
  while (done < months && !s.ended) {
    if (s.pendingDecision) {
      if (!opts.auto) break;
      resolveInPlace(s, autoChoice(s));
      continue;
    }
    stepMonth(s);
    done++;
  }
  if (opts.auto) {
    while (s.pendingDecision && !s.ended) resolveInPlace(s, autoChoice(s));
  }
  return s;
}

/** Run until the first required decision (or `limit` months). */
export function advanceToDecision(state: LifeState, limit = 600): LifeState {
  const s = clone(state);
  let n = 0;
  while (!s.pendingDecision && !s.ended && n < limit) {
    stepMonth(s);
    n++;
  }
  return s;
}

export function stepMonth(s: LifeState) {
  s.ageMonths += 1;
  const age = s.ageMonths / 12;
  if (s.ageMonths % 12 === 0) birthday(s);
  if (typeof s.flags.restoreAt === "number" && s.ageMonths >= s.flags.restoreAt) {
    if (s.plan.workload === "low" && typeof s.flags.restoreWorkload === "string") {
      s.plan.workload = s.flags.restoreWorkload as Workload;
      log(s, "info", `Workload back to ${s.plan.workload}.`);
    }
    delete s.flags.restoreAt;
    delete s.flags.restoreWorkload;
  }
  if (s.after) {
    afterMonth(s);
    endChecks(s);
    return;
  }
  stepTraining(s);
  money(s);
  if (age >= 18 && s.achievements.nbaCaliber === null && currentLevel(s) >= 70) {
    s.achievements.nbaCaliber = s.ageMonths;
    log(s, "milestone", "Scouts would call this an NBA-level player now.", null, "good");
  }
  seasonStep(s);
  intlStep(s);
  if (!s.pendingDecision) calendarStep(s);
  if (!s.pendingDecision) scheduledStep(s);
  if (!s.pendingDecision) agentStep(s);
  if (!s.pendingDecision) randomEvent(s);
  endChecks(s);
}

function birthday(s: LifeState) {
  const age = s.ageMonths / 12;
  const prevStage = stageOf(s.ageMonths - 12);
  const stage = stageOf(s.ageMonths);
  if (stage !== prevStage) log(s, "milestone", `${STAGE_LABEL[stage]} begins.`);
  if (age === 3) log(s, "info", "Old enough to pick a focus. Free play is the default.");
  if (age === 6) {
    s.education.level = "primary";
    if (s.placement.node === "home") s.placement = { ...s.placement, node: "playground", teamName: null, coaching: country(s.residence.countryId).model.coachingAccess * 0.4, since: s.ageMonths };
  }
  if (age === 12) s.education.level = "secondary";
  if (age === 18 && s.education.level === "secondary") {
    s.education.graduatedHighSchool = s.education.academics >= 25;
    s.education.level = "done";
    if (!s.education.graduatedHighSchool) s.education.ncaaEligible = false;
    if (s.flags.usHS) s.flags.hsGradYear = calendar(s).year;
    log(s, "milestone", s.education.graduatedHighSchool ? "Finished secondary school." : "Left school without a diploma. NCAA route closes (game rule).", null, s.education.graduatedHighSchool ? "good" : "bad");
  }
  stepPeersYear(s.rng, s.peers, Math.round(age), s.ageMonths);
  for (const slot of ["primary", "secondary"] as const) {
    const id = s.plan[slot];
    if (id && !focusAvailable(FOCUS_BY_ID[id], age)) {
      const next: FocusId | null = slot === "primary" ? "fundamentals" : null;
      if (slot === "primary") s.plan.primary = next!;
      else s.plan.secondary = null;
      log(s, "info", `${FOCUS_BY_ID[id].label} no longer fits your age. ${slot === "primary" ? "Primary focus is now Fundamentals." : "Secondary focus cleared."}`);
    }
  }
}

function money(s: LifeState) {
  s.family.savings += s.family.monthlyBudget;
  if (s.placement.costPerYear > 0) s.family.savings = Math.max(0, s.family.savings - s.placement.costPerYear / 12);
  stepFinance(s);
}

/* --------------------------------------------------------------- seasons */

function seasonStep(s: LifeState) {
  playoffStep(s);
  const level = levelOf(s);
  const { month } = calendar(s);
  if (!level) {
    if (s.season) finalizeSeason(s, null);
    if ((month === 7 || s.flags.reviewSoon) && s.ageMonths >= 72) {
      delete s.flags.reviewSoon;
      offseasonReview(s);
    }
    s.exposure = Math.max(0, s.exposure - 0.4);
    return;
  }
  const idx = seasonMonthIndex(s, level);
  if (idx === null) {
    if (s.season) finalizeSeason(s, level);
    s.exposure = Math.max(0, s.exposure - 0.35);
    if (s.flags.reviewSoon && typeof s.flags.poKey !== "string") {
      delete s.flags.reviewSoon;
      offseasonReview(s);
    }
    return;
  }
  const nba = s.placement.node === "nba";
  if (!s.season) {
    s.placement.role = roleFor(performanceLevel(s) + (nba ? trustOf(s) : 0), level.need);
    s.season = newSeason(s, level);
    if (nba) startNbaSeason(s, s.season);
  }
  const n = gamesThisMonth(level.model.games, level.model.season.months, idx);
  const rng = rngOf(s.rng, "games");
  const played: BoxScore[] = [];
  let minutes = 0;
  for (let g = 0; g < n; g++) {
    const box = simulateGame(s, level, rng, s.condition.injury ? 0 : undefined, undefined, nba ? (s.season.teamEdge ?? 0) : 0);
    if (nba) box.opponent = nbaOpponent(s, s.placement.teamName);
    box.seasonKey = s.season.key;
    addBox(s.season, box);
    s.lastGame = box;
    pushGame(s, box);
    played.push(box);
    minutes += box.min;
    const score = box.pts + box.reb * 1.2 + box.ast * 1.5;
    const best = s.bestGame ? s.bestGame.pts + s.bestGame.reb * 1.2 + s.bestGame.ast * 1.5 : -1;
    if (box.min > 0 && score > best && s.ageMonths >= 96) s.bestGame = { ...box, label: `${level.label}, age ${Math.floor(s.ageMonths / 12)}` };
    if (nba && box.min > 0) {
      s.nbaGames += 1;
      if (s.achievements.nbaDebut === null) recordDebut(s, `${s.placement.teamName}: ${box.min} minutes, ${box.pts} points.`);
      nbaGameMilestones(s, box);
    }
  }
  const share = n > 0 ? minutes / (n * level.model.minutesCap) : 0;
  const perf = clamp(0.6 + (performanceLevel(s) - level.need) / 30, 0.2, 1.6);
  s.exposure = clamp(s.exposure + (level.model.exposure / 100) * share * perf * 1.8 - 0.15, 0, 100);
  const last = idx === level.model.season.months - 1;
  if (nba) nbaMonth(s, level, played, last);
  if (last) {
    finalizeSeason(s, level);
    if (typeof s.flags.poKey === "string") s.flags.reviewSoon = true;
    else if (!s.pendingDecision) offseasonReview(s);
  }
}

function finalizeSeason(s: LifeState, level: Level | null) {
  const season = s.season;
  if (!season) return;
  s.season = null;
  const awards = seasonAwards(s, season, level);
  if (awards.length) {
    season.awards = [...(season.awards ?? []), ...awards];
    log(s, "milestone", `${season.levelLabel} honors: ${awards.join(", ")}.`, null, "good");
    s.evidence.push({ month: s.ageMonths, text: `${awards[0]} (${season.levelLabel}, age ${season.ageYears})`, weight: ((level?.model.exposure ?? 10) / 10) * 1.2 });
  }
  if (season.gp > 0 || season.wins + season.losses > 0) s.seasons.push(season);
  if (season.gp >= 5 && s.ageMonths >= 120) {
    const ppg = perGame(season, "pts");
    const rpg = perGame(season, "reb");
    const apg = perGame(season, "ast");
    const text = `Age ${season.ageYears}: ${ppg.toFixed(1)} pts, ${rpg.toFixed(1)} reb, ${apg.toFixed(1)} ast in ${season.levelLabel}`;
    const w = ((level?.model.exposure ?? 10) / 10) * clamp(0.4 + (ppg + rpg + apg) / 30, 0.3, 2);
    s.evidence.push({ month: s.ageMonths, text, weight: w });
    s.evidence = [...s.evidence].sort((a, b) => b.weight - a.weight).slice(0, 24);
    log(s, "season", `${season.levelLabel}${season.teamName ? ` (${season.teamName})` : ""}: ${season.gp} games, ${ppg.toFixed(1)} pts, ${rpg.toFixed(1)} reb, ${apg.toFixed(1)} ast. ${ROLE_LABEL[season.role]}.${season.node === "nba" ? ` Team ${season.wins}-${season.losses}.` : ""}`, null, ppg >= 15 ? "good" : "neutral");
  }
  if (season.node === "nba") nbaSeasonEnd(s, season);
  const c = s.placement.contract;
  if (c) {
    c.yearsLeft -= 1;
    if (c.yearsLeft <= 0) {
      const perf = performanceLevel(s);
      const bet = s.flags.betOnSelf === true;
      delete s.flags.betOnSelf;
      delete s.flags.renewSalary;
      delete s.flags.renewTeam;
      if (s.placement.node === "nba") {
        const role = roleFor(perf + trustOf(s), level?.need ?? 60);
        if (perf >= 66) {
          s.flags.renewSalary = Math.round(nbaSalary(role) * (bet && ["starter", "star"].includes(role) ? 1.25 : 1));
          s.flags.renewTeam = s.placement.teamName ?? "";
          log(s, "info", `Your NBA contract is up. The ${s.placement.teamName} want you back.`);
        } else {
          log(s, "info", "Your NBA contract is up. The team doesn't plan to bring you back.", null, "bad");
        }
        s.flags.nbaFreeAgent = true;
        s.flags.reviewSoon = true;
        s.placement.contract = null;
      } else {
        const l = maybeLeague(s.placement.leagueId);
        s.placement.contract = null;
        if (isProNode(s.placement.node)) s.flags.reviewSoon = true;
        if (s.placement.node === "g-league" && perf >= 50) {
          s.flags.renewSalary = c.twoWay ? c.salary : 40_500;
          s.flags.renewTeam = s.placement.teamName ?? "";
          log(s, "info", `Your G League deal is up. ${s.placement.teamName} want you back.`);
        } else if (l?.model && ["domestic-pro", "foreign-pro"].includes(s.placement.node) && perf >= l.model.strength * 0.8 - 9) {
          const role = roleFor(perf, l.model.strength * 0.8);
          const mult = bet ? (["starter", "star"].includes(role) ? 1.35 : 0.85) : 1;
          s.flags.renewSalary = Math.round((salaryFor(l, role) * mult) / 500) * 500;
          s.flags.renewTeam = s.placement.teamName ?? "";
          log(s, "info", `Your contract is up. ${s.placement.teamName} offer a new deal.`);
        } else {
          log(s, "info", "Your contract is up.");
        }
      }
    }
  }
  if (s.placement.node === "university") {
    s.education.universityYears += 1;
    if (s.education.universityYears >= 4) {
      log(s, "milestone", "College eligibility used up. You graduate.", null, "good");
      s.education.amateur = false;
      s.placement = { ...s.placement, node: "unattached", leagueId: null, teamName: null, role: "none", contract: null, costPerYear: 0 };
    }
  }
}

function offseasonReview(s: LifeState) {
  if (s.ended) return;
  delete s.flags.reviewSoon;
  const offers = offseasonOffers(s);
  const renew = typeof s.flags.renewSalary === "number" && s.flags.renewTeam === s.placement.teamName ? s.flags.renewSalary : null;
  const nbaFA = s.flags.nbaFreeAgent === true && s.placement.node === "nba";
  const expired = isProNode(s.placement.node) && !s.placement.contract;
  const hunted = typeof s.flags.overseasHunt === "number";
  if (hunted) {
    delete s.flags.overseasHunt;
    s.flags.overseasAsked = s.ageMonths;
    if (!offers.some((o) => o.node === "foreign-pro")) log(s, "info", "No club abroad bites this time.", null, "bad");
  }
  const free = !s.placement.contract || s.placement.contract.yearsLeft <= 0 || ["deep-bench", "bench", "none"].includes(s.placement.role);
  const asked = typeof s.flags.overseasAsked === "number" && s.ageMonths - s.flags.overseasAsked < 10;
  const abroadOk = !hunted && !asked && free && s.ageMonths >= 19 * 12 && s.placement.node !== "nba" && s.placement.node !== "university" && !offers.some((o) => o.node === "foreign-pro") && overseasPossible(s);
  if (!offers.length && renew === null && !nbaFA && !expired && !abroadOk) return;
  s.offers = offers;
  const choices: DecisionChoice[] = offers.map((o) => ({ id: o.id, label: offerTitle(o), preview: `${ROLE_LABEL[o.role]}, ${o.minutesBand}. ${o.reason}`, disabled: offerBlocked(s, o) ?? undefined }));
  if (renew !== null) choices.unshift({ id: "renew", label: `Re-sign with ${s.placement.teamName}`, preview: `${usd(renew)} a year for two years, guaranteed.` });
  if (nbaFA) choices.push({ id: "fa", label: "Test NBA free agency", preview: "Other teams may pay more. You could also end up without a deal." });
  if (abroadOk) choices.push({ id: "overseas", label: "Look for a job overseas", preview: s.finance.agent ? `${s.finance.agent.name} shops your film to clubs abroad. Answers come next month.` : "You send your film to clubs abroad yourself. Answers come next month. An agent would reach more teams." });
  const stayLabel = expired ? "Turn everything down and wait" : s.placement.teamName ? `Stay with ${s.placement.teamName}` : s.placement.node === "playground" ? "Keep playing on the neighborhood courts" : "Keep training on your own";
  choices.push({ id: "stay", label: stayLabel, preview: expired ? "No contract. More offers may come next month." : "Nothing changes." });
  const n = choices.length - 1;
  decide(s, { templateId: "offers", title: s.ageMonths < 18 * 12 ? "Next season" : nbaFA ? "NBA free agency" : "Offseason options", body: `Age ${Math.floor(s.ageMonths / 12)}. ${n === 1 ? "One option is" : `${n} options are`} on the table.`, choices, offers, required: true });
}

const isProNode = (n: string) => n === "domestic-pro" || n === "foreign-pro" || n === "g-league" || n === "nba";

const NBA_SALARY: Record<string, number> = { none: 1_300_000, "deep-bench": 1_300_000, bench: 2_800_000, rotation: 7_500_000, starter: 17_000_000, star: 34_000_000 };
/** NBA salary by role (model; the real scale depends on cap rules and experience). */
export function nbaSalary(role: string): number {
  return NBA_SALARY[role] ?? 1_300_000;
}

function usd(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function pushGame(s: LifeState, box: LifeState["gameLog"][number]) {
  s.gameLog.push(box);
  if (s.gameLog.length > 160) s.gameLog.splice(0, s.gameLog.length - 160);
}

/** Season honors. NBA lines are placed among the real league; elsewhere stat thresholds (model, no randomness). */
function seasonAwards(s: LifeState, season: LifeState["seasons"][number], level: Level | null): string[] {
  if (season.node === "nba") {
    if (season.nbaYear === undefined || calendar(s).month !== 4) return [];
    const total = nbaSeasonTotal(s, season.nbaYear, season)!;
    const games = season.wins + season.losses;
    const honors = nbaHonors(total, { role: season.role, rookie: isNbaRookie(s, season.nbaYear), winPct: games ? season.wins / games : 0 });
    const prev = nbaSeasonTotal(s, season.nbaYear - 1);
    if (prev && prev.gp >= 20 && total.gp >= 50 && total.pts / total.gp - prev.pts / prev.gp >= 6) honors.push("Most Improved Player");
    return honors;
  }
  if (season.gp < 8 || !level) return [];
  const g = season.gp;
  const ppg = season.pts / g;
  const rpg = season.reb / g;
  const apg = season.ast / g;
  const stocks = (season.stl + season.blk) / g;
  const out: string[] = [];
  const prevSame = [...s.seasons].reverse().find((x) => x.node === season.node && x.gp >= 8);
  const firstPro = isProNode(season.node) && !s.seasons.some((x) => x.node === season.node && x.gp > 0);
  if (season.ageYears < 10) return [];
  const starter = ["starter", "star"].includes(season.role);
  const margin = performanceLevel(s) - level.need;
  if (season.role === "star" && ppg >= (level.youth ? 21 : 19)) out.push("All-League First Team");
  else if (starter && ppg >= (level.youth ? 17 : 15)) out.push("All-League Second Team");
  if (season.role === "star" && ppg >= (level.youth ? 24 : 22) && margin >= 14) out.push("League MVP");
  if (starter && rpg >= 11) out.push("Rebounding leader");
  if (starter && apg >= 7.5) out.push("Assists leader");
  if (starter && stocks >= 3.5) out.push("All-Defensive Team");
  if (firstPro && ppg >= 12) out.push("Rookie of the Year");
  if (prevSame && prevSame.gp >= 8 && ppg - prevSame.pts / prevSame.gp >= 7) out.push("Most Improved Player");
  if (season.wins + season.losses >= 16 && season.wins / (season.wins + season.losses) >= 0.85) out.push("Best record in the league");
  return out.slice(0, 3);
}

/* --------------------------------------------------------------- NBA life */

const ROLE_STEPS: Role[] = ["deep-bench", "bench", "rotation", "starter", "star"];
const ROLE_SPOT: Record<Role, string> = { none: "the roster", "deep-bench": "the end of the bench", bench: "a bench role", rotation: "the rotation", starter: "the starting lineup", star: "the go-to role" };
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BOX_KEYS = ["min", "pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta"] as const;
const num = (v: unknown) => (typeof v === "number" ? v : 0);

/** Coaches' trust in level points: good months raise it, bad months lower it. */
const trustOf = (s: LifeState) => num(s.flags.nbaTrust);

/** The year an NBA season tipped off: October through June belong to one season. */
function nbaStartYear(s: LifeState) {
  const { month, year } = calendar(s);
  return month >= 7 ? year : year - 1;
}

/** Every NBA line from one season added up: trades and call-ups split a season into lines. */
export function nbaSeasonTotal(s: LifeState, nbaYear: number, extra?: SeasonLine): SeasonLine | null {
  const lines = [...s.seasons, ...(s.season ? [s.season] : []), ...(extra ? [extra] : [])].filter((x, i, a) => x.node === "nba" && x.nbaYear === nbaYear && a.indexOf(x) === i);
  if (!lines.length) return null;
  const out: SeasonLine = { ...lines.at(-1)!, gp: 0, wins: 0, losses: 0 };
  for (const k of BOX_KEYS) out[k] = 0;
  for (const l of lines) {
    out.gp += l.gp;
    out.wins += l.wins;
    out.losses += l.losses;
    for (const k of BOX_KEYS) out[k] += l[k];
  }
  return out;
}

/** No NBA games before this season. Lines from older saves without a season year count as earlier seasons. */
export function isNbaRookie(s: LifeState, nbaYear: number) {
  return !s.seasons.some((x) => x.node === "nba" && x.gp > 0 && x.nbaYear !== nbaYear);
}

function nbaSeasonsBefore(s: LifeState, nbaYear: number) {
  return new Set(s.seasons.filter((x) => x.node === "nba" && x.gp > 0 && x.nbaYear !== nbaYear).map((x) => x.nbaYear ?? x.calendarYear)).size;
}

function startNbaSeason(s: LifeState, line: SeasonLine) {
  const rng = rngOf(s.rng, "nba");
  line.nbaYear = nbaStartYear(s);
  const prev = s.flags.edgeTeam === line.teamName && typeof s.flags.edge === "number" ? s.flags.edge : null;
  const edge = prev !== null ? prev * 0.55 + rng.normal(0, 0.09) : rng.normal(0, 0.11);
  line.teamEdge = Math.round(clamp(edge, -0.25, 0.25) * 1000) / 1000;
  s.flags.edge = line.teamEdge;
  s.flags.edgeTeam = line.teamName ?? "";
}

function nbaOpponent(s: LifeState, team: string | null) {
  const others = NBA_TEAMS.filter((t) => t !== team);
  return others[Math.floor(rngOf(s.rng, "nba").next() * others.length)]!;
}

function nbaGameMilestones(s: LifeState, box: BoxScore) {
  const f = s.flags;
  if (typeof f.nbaPts !== "number") f.nbaPts = s.seasons.filter((x) => x.node === "nba").reduce((a, x) => a + x.pts, 0) + (s.season?.pts ?? 0) - box.pts;
  const before = f.nbaPts;
  f.nbaPts = before + box.pts;
  for (const m of [1000, 5000, 10000, 15000, 20000, 25000, 30000, 40000]) if (before < m && f.nbaPts >= m) log(s, "milestone", `${m.toLocaleString("en-US")} career NBA points.`, null, "good");
  if (box.pts > num(f.nbaHigh)) {
    if (box.pts >= 20) log(s, "milestone", `Career high: ${box.pts} points against the ${box.opponent}.`, null, "good");
    f.nbaHigh = box.pts;
  }
  const line = { points: box.pts, rebounds: box.reb, assists: box.ast, steals: box.stl, blocks: box.blk };
  const tens = Object.entries(line).filter(([, v]) => v >= 10);
  if (tens.length >= 2) {
    f.nbaDD = num(f.nbaDD) + 1;
    if (f.nbaDD === 1) log(s, "milestone", `First NBA double-double: ${tens.map(([k, v]) => `${v} ${k}`).join(", ")} against the ${box.opponent}.`, null, "good");
  }
  if (tens.length >= 3) {
    f.nbaTD = num(f.nbaTD) + 1;
    if (f.nbaTD === 1) log(s, "milestone", `First NBA triple-double: ${tens.map(([k, v]) => `${v} ${k}`).join(", ")}.`, null, "good");
  }
  if (s.nbaGames === 100 || s.nbaGames === 500 || s.nbaGames === 1000) log(s, "milestone", `NBA game number ${s.nbaGames.toLocaleString("en-US")}.`, null, "good");
}

/** After each NBA month: monthly honors, the deadline and All-Star break in February, then the coach's call on minutes. */
function nbaMonth(s: LifeState, level: Level, boxes: BoxScore[], last: boolean) {
  const line = s.season;
  if (!line || line.nbaYear === undefined) return;
  const { month } = calendar(s);
  const year = line.nbaYear;
  const honor = monthHonor(boxes, isNbaRookie(s, year));
  if (honor) {
    const text = `${conference(s.placement.teamName)} Conference ${honor === "player" ? "Player" : "Rookie"} of the Month, ${MONTH_NAMES[month - 1]}`;
    (line.monthly ??= []).push(text);
    s.exposure = clamp(s.exposure + 3, 0, 100);
    log(s, "milestone", `${text}.`, null, "good");
  }
  if (month === 2) {
    if (s.placement.contract) tradeDeadline(s);
    allStarBreak(s, year);
  }
  if (!last && s.season) roleStep(s, level, s.season, boxes);
}

/** The latest NBA line: the one in progress, or the one a deadline trade just closed. */
function currentNbaLine(s: LifeState): SeasonLine | null {
  return s.season?.node === "nba" ? s.season : ([...s.seasons].reverse().find((x) => x.node === "nba") ?? null);
}

function allStarBreak(s: LifeState, year: number) {
  const total = nbaSeasonTotal(s, year);
  const line = currentNbaLine(s);
  if (!total || !line) return;
  const conf = conference(s.placement.teamName);
  const pick = allStarPick(total);
  if (pick) {
    (line.awards ??= []).push("NBA All-Star");
    s.exposure = clamp(s.exposure + 6, 0, 100);
    log(s, "milestone", pick === "starter" ? `Named an All-Star starter for the ${conf} Conference.` : `Named an All-Star reserve for the ${conf} Conference.`, null, "good");
  }
  if (nbaSeasonsBefore(s, year) <= 1 && risingStar(total)) {
    (line.awards ??= []).push("Rising Stars");
    s.exposure = clamp(s.exposure + 3, 0, 100);
    log(s, "milestone", "Picked for the Rising Stars game at All-Star weekend.", null, "good");
  }
  if (s.pendingDecision || s.condition.injury) return;
  const age = s.ageMonths / 12;
  const rng = rngOf(s.rng, "nba");
  const dunkRoll = rng.next();
  if (threePointInvite(total)) {
    const pct = total.tpm / total.tpa;
    decide(s, {
      templateId: "nba-contest",
      title: "Three-Point Contest invite",
      body: `You're making ${(total.tpm / total.gp).toFixed(1)} threes a game at ${(pct * 100).toFixed(1)}%. The league wants you in the Three-Point Contest at All-Star weekend.`,
      choices: [
        { id: "compete", label: "Compete", preview: "Two racks of balls in front of a full arena. A win is a line on your résumé." },
        { id: "skip", label: "Sit it out", preview: "Rest over the break." },
      ],
      context: { kind: "three", pct },
      required: true,
    });
  } else if (age <= 26 && s.body.vertical >= 78 && dunkRoll < 0.35) {
    decide(s, {
      templateId: "nba-contest",
      title: "Slam Dunk Contest invite",
      body: "Highlight dunks got noticed. The league wants you in the Slam Dunk Contest at All-Star weekend.",
      choices: [
        { id: "compete", label: "Compete", preview: "Plan your dunks. A small chance of a tweaked ankle." },
        { id: "skip", label: "Sit it out", preview: "Rest over the break." },
      ],
      context: { kind: "dunk", pct: 0 },
      required: true,
    });
  }
}

function setRole(s: LifeState, line: SeasonLine, role: Role) {
  s.placement.role = role;
  line.role = role;
}

/** Minutes follow level plus trust. A teammate's injury sometimes opens a spot for a month or two. */
function roleStep(s: LifeState, level: Level, line: SeasonLine, boxes: BoxScore[]) {
  const rng = rngOf(s.rng, "nba");
  const chance = rng.next();
  const stint = rng.next();
  const played = boxes.filter((b) => b.min > 0);
  const mins = played.reduce((a, b) => a + b.min, 0);
  let trust = trustOf(s);
  const career = s.seasons.filter((x) => x.node === "nba");
  const baseMin = line.min >= 120 ? line.min : career.reduce((a, x) => a + x.min, 0);
  const baseScore = line.min >= 120 ? gameScoreTotal(line) : career.reduce((a, x) => a + gameScoreTotal(x), 0);
  if (mins >= 30 && baseMin >= 120) {
    const month36 = (played.reduce((a, b) => a + gameScoreTotal(b), 0) / mins) * 36;
    trust = clamp(trust + clamp((month36 - (baseScore / baseMin) * 36) / 6, -0.75, 0.75), -4, 5);
  }
  const cur = ROLE_STEPS.indexOf(s.placement.role);
  if (cur < 0) return;
  const fill = typeof s.flags.fillUntil === "number" ? s.flags.fillUntil : null;
  if (fill !== null && s.ageMonths < fill) {
    s.flags.nbaTrust = Math.round(trust * 10) / 10;
    return;
  }
  if (fill !== null) {
    if (trust > num(s.flags.fillTrust)) trust = Math.min(5, trust + 1.5);
    delete s.flags.fillUntil;
    delete s.flags.fillTrust;
  }
  s.flags.nbaTrust = Math.round(trust * 10) / 10;
  const lvl = performanceLevel(s);
  const up = ROLE_STEPS.indexOf(roleFor(lvl + trust - 1.5, level.need));
  const down = ROLE_STEPS.indexOf(roleFor(lvl + trust + 2.5, level.need));
  const settled = s.ageMonths - num(s.flags.roleAt) >= 3;
  const move = (to: number) => {
    setRole(s, line, ROLE_STEPS[to]!);
    s.flags.roleAt = s.ageMonths;
  };
  if (fill !== null) {
    if (down < cur) {
      move(cur - 1);
      log(s, "info", `The regular is healthy again. You go back to ${ROLE_SPOT[s.placement.role]}.`);
    } else {
      log(s, "milestone", `You played well enough to stay in ${ROLE_SPOT[s.placement.role]}.`, null, "good");
    }
  } else if (up > cur && settled) {
    move(cur + 1);
    log(s, "milestone", `More minutes: the coach moves you up to ${ROLE_SPOT[s.placement.role]}.`, null, "good");
  } else if (down < cur && settled) {
    move(cur - 1);
    log(s, "info", `Fewer minutes: the coach moves you down to ${ROLE_SPOT[s.placement.role]}.`, null, "bad");
  } else if (cur <= 2 && chance < 0.06 && !s.condition.injury) {
    move(cur + 1);
    s.flags.fillUntil = s.ageMonths + (stint < 0.5 ? 1 : 2);
    s.flags.fillTrust = s.flags.nbaTrust;
    log(s, "milestone", `A teammate goes down. You move up to ${ROLE_SPOT[s.placement.role]} for now.`, null, "good");
  }
}

/** End of an NBA regular season (April): playoff seeding, ten-season service, trust carried at half. */
function nbaSeasonEnd(s: LifeState, line: SeasonLine) {
  delete s.flags.fillUntil;
  delete s.flags.fillTrust;
  if (calendar(s).month !== 4) return;
  s.flags.nbaTrust = Math.round(trustOf(s) * 5) / 10;
  const seasons = new Set(s.seasons.filter((x) => x.node === "nba" && x.gp > 0).map((x) => x.nbaYear ?? x.calendarYear)).size;
  if (seasons >= 10 && !s.flags.nbaTen) {
    s.flags.nbaTen = true;
    log(s, "milestone", "Ten NBA seasons: enough service time for the league's maximum pension.", null, "good");
  }
  if (s.placement.node !== "nba" || s.placement.teamName !== line.teamName) return;
  const g = line.wins + line.losses;
  if (g < 15) return;
  const w = line.wins / g;
  const conf = conference(line.teamName);
  const roll = rngOf(s.rng, "nba").next();
  let seed: number;
  if (w >= 0.54) seed = w >= 0.7 ? 1 : w >= 0.66 ? 2 : w >= 0.62 ? 3 : w >= 0.59 ? 4 : w >= 0.56 ? 5 : 6;
  else if (w >= 0.45) {
    if (roll >= clamp(0.3 + (w - 0.45) * 4, 0.3, 0.66)) {
      log(s, "season", `The ${line.teamName} lose in the play-in tournament.`, null, "bad");
      return;
    }
    seed = w >= 0.5 ? 7 : 8;
    log(s, "season", `The ${line.teamName} win their way through the play-in. ${ordinal(seed)} seed in the ${conf} Conference.`, null, "good");
  } else {
    log(s, "season", `The ${line.teamName} miss the playoffs.`);
    return;
  }
  line.playoffs = { seed, conference: conf, gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, wins: 0, losses: 0, rounds: 0, series: [], result: "", champion: false };
  s.flags.poKey = line.key;
}

/** Playoffs: the first two rounds in May, the conference finals and Finals in June. */
function playoffStep(s: LifeState) {
  const key = s.flags.poKey;
  if (typeof key !== "string") return;
  const line = s.seasons.find((x) => x.key === key);
  const po = line?.playoffs;
  const level = levelOf(s);
  if (!line || !po || po.result || !level || s.placement.node !== "nba" || s.placement.teamName !== line.teamName) {
    if (po && !po.result) po.result = "Left the team before the playoffs";
    delete s.flags.poKey;
    return;
  }
  const upTo = calendar(s).month === 5 ? 2 : 4;
  while (po.rounds < upTo && !po.result) playSeries(s, line, po, level);
  if (po.result) delete s.flags.poKey;
}

function playSeries(s: LifeState, line: SeasonLine, po: PlayoffRun, level: Level) {
  const rng = rngOf(s.rng, "nba");
  const round = po.rounds;
  const used = po.series.join(" ");
  const pool = NBA_TEAMS.filter((t) => t !== line.teamName && !used.includes(t) && (round < 3 ? conference(t) === po.conference : conference(t) !== po.conference));
  const opp = pool[Math.floor(rng.next() * pool.length)]!;
  const oppSeed = round === 0 ? 9 - po.seed : 0;
  const oppW = round === 0 ? 0.7 - (oppSeed - 1) * 0.025 : clamp(rng.normal(0.6 + round * 0.02, 0.04), 0.52, 0.76);
  const myW = line.wins / Math.max(1, line.wins + line.losses);
  const homeCourt = round === 0 ? po.seed < oppSeed : myW >= oppW;
  const label = round === 0 ? "First round" : round === 3 ? "NBA Finals" : `${po.conference} Conference ${round === 1 ? "semifinals" : "finals"}`;
  const key = `${line.key}:po`;
  const finals: BoxScore[] = [];
  let won = 0;
  let lost = 0;
  for (let g = 0; won < 4 && lost < 4; g++) {
    const atHome = [0, 1, 4, 6].includes(g) === homeCourt;
    const edge = (line.teamEdge ?? 0) + (0.5 - oppW) * 0.9 + (atHome ? 0.03 : -0.03);
    const sit = s.condition.injury !== null || (s.placement.role === "deep-bench" && rng.next() < 0.6);
    const box = simulateGame(s, level, rng, sit ? 0 : undefined, undefined, edge);
    if (sit) for (const k of BOX_KEYS) box[k] = 0;
    box.opponent = opp;
    box.seasonKey = key;
    pushGame(s, box);
    s.lastGame = box;
    if (box.teamScore > box.oppScore) won++;
    else lost++;
    if (box.min > 0) {
      po.gp++;
      for (const k of BOX_KEYS) po[k] += box[k];
      if (round === 3) finals.push(box);
    }
  }
  po.wins += won;
  po.losses += lost;
  s.condition.energy = clamp(s.condition.energy - 4, 5, 100);
  const text = won === 4 ? `${label}: beat the ${opp} ${won}-${lost}.` : `${label}: lost to the ${opp} ${lost}-${won}.`;
  po.series.push(text);
  if (won < 4) {
    po.result = `Lost in the ${round === 0 ? "first round" : label}`;
    log(s, "season", text, null, "bad");
    return;
  }
  po.rounds++;
  s.exposure = clamp(s.exposure + 3, 0, 100);
  if (round < 3) {
    log(s, "season", text, null, "good");
    return;
  }
  po.result = "NBA champion";
  po.champion = true;
  (line.awards ??= []).push("NBA champion");
  s.flags.champAt = s.ageMonths;
  s.exposure = clamp(s.exposure + 8, 0, 100);
  log(s, "milestone", `${text} The ${line.teamName} are NBA champions.`, null, "good");
  const fin = finals.reduce((a, b) => a + gameScoreTotal(b), 0) / Math.max(1, finals.length);
  if ((s.placement.role === "star" || s.placement.role === "starter") && finals.length >= 4 && fin >= 18) {
    line.awards.push("Finals MVP");
    log(s, "milestone", "Finals MVP.", null, "good");
  }
  s.evidence.push({ month: s.ageMonths, text: `NBA champion with the ${line.teamName}`, weight: 12 });
}

export function offerTitle(o: Offer): string {
  return o.node === "local-club" || o.node === "school-team" || o.node === "local-senior" ? o.teamName : `${o.teamName} · ${nodeLabel(o.node, o.countryId, o.leagueId)}`;
}

/* --------------------------------------------------------------- calendar */

function calendarStep(s: LifeState) {
  const { month, year } = calendar(s);
  const age = s.ageMonths / 12;
  if (age < 18) return;
  // April, or May when another decision held April up.
  if ((month === 4 || month === 5) && s.flags.declareAsked !== year && s.draft.declaredYear !== year && !s.draft.withdrewYears.includes(year)) {
    s.flags.declareAsked = year;
    if (autoEligible(s, year)) {
      openDraftCycle(s, year);
      log(s, "draft", `Automatically in the ${year} NBA Draft pool (game rule: age 22).`);
    } else if (canDeclare(s, year)) {
      const band = readiness(s);
      const worth = band === "draft-range" || band === "nba-ready" || band === "radar" || (age >= 20 && band === "pro-prospect") || gapToSixty(s, year) <= 3;
      if (worth) {
        askDeclare(s, year);
        return;
      }
    }
  }
  const draftSeason = s.draft.declaredYear === year && month >= 5 && month <= 9;
  if (draftSeason && s.draft.combine?.year !== year) {
    combineStep(s, year);
    if (month === 5 && s.placement.node === "university" && projectedRank(s, year) > 60) {
      s.draft.declaredYear = null;
      s.draft.withdrewYears.push(year);
      log(s, "draft", "You withdraw before the NCAA deadline and return to school. Teams projected you outside the top 60.");
      return;
    }
    if (s.draft.combine!.invited || gapToSixty(s, year) <= 4) {
      const plan = interviewPlan(s, year);
      askInterview(s, year, plan.questions.map((q) => q.id).join(","), plan.teams.join("|"), 0);
      return;
    }
    log(s, "draft", "No NBA team asks for an interview or a workout.");
    if (month === 5) return;
  }
  if (draftSeason && month >= 6) {
    holdDraft(s, year);
    return;
  }
  if (month === 10 && (s.flags.campOffer || s.flags.campDeal || s.flags.buyout) && s.placement.node !== "nba") {
    campStep(s, year);
    return;
  }
  gLeagueStep(s);
}

/** Draft night. Runs in June, or the first free month after it when another decision held up the calendar. */
function holdDraft(s: LifeState, year: number) {
  const res = runDraft(s, year);
  s.draft.result = { year, pick: res.pick, team: res.team };
  s.draft.board = res.board;
  s.draft.declaredYear = null;
  if (res.promiseKept) log(s, "draft", `The ${res.team} keep their promise and take you at ${res.pick}.`, null, "good");
  else if (s.draft.promise && res.pick && res.pick < s.draft.promise.pick) log(s, "draft", `Gone before the ${s.draft.promise.team} pick. Their promise never came into play.`);
  if (res.pick && res.pick <= 30) {
    s.achievements.drafted = { month: s.ageMonths, round: 1, pick: res.pick };
    s.achievements.rosterSpot = s.ageMonths;
    s.education.amateur = false;
    if (s.season) finalizeSeason(s, levelOf(s));
    s.placement = { node: "nba", countryId: "US", leagueId: "nba", teamName: res.team, role: "deep-bench", coaching: 92, since: s.ageMonths, contract: { salary: rookieSalary(res.pick), yearsLeft: 3, guaranteed: true }, costPerYear: 0 };
    s.residence = { countryId: "US", locality: res.team!.split(" ").slice(0, -1).join(" "), localityKind: "city" };
    log(s, "draft", `Drafted ${ordinal(res.pick)} overall by the ${res.team}. Guaranteed rookie contract.`, null, "good");
  } else if (res.pick) {
    s.achievements.drafted = { month: s.ageMonths, round: 2, pick: res.pick };
    log(s, "draft", `Drafted ${ordinal(res.pick)} overall (second round) by the ${res.team}.`, null, "good");
    decide(s, {
      templateId: "draft-after",
      title: `${res.team} hold your rights`,
      body: "Second-round picks rarely get guaranteed deals. Pick your path.",
      choices: [
        { id: "two-way", label: "Two-way contract", preview: "Play in the G League with NBA call-ups. Ends NCAA eligibility." },
        { id: "camp", label: "Training camp deal", preview: "Fight for a roster spot in October. Waived players go to the G League." },
        { id: "stay", label: "Stay where you are", preview: "They keep your rights. Develop another year." },
      ],
      context: { team: res.team, pick: res.pick },
      required: true,
    });
  } else {
    log(s, "draft", `Undrafted in ${year}.`, null, "bad");
    const v = draftValue(s);
    const choices: DecisionChoice[] = [];
    if (v >= 55) choices.push({ id: "camp", label: "Training camp deal", preview: "An NBA team brings you to camp. Waived players go to its G League team." });
    if (performanceLevel(s) >= 50) choices.push({ id: "g-league", label: "G League contract", preview: "Play for call-ups. About $40,500 a season (model)." });
    if (overseasPossible(s)) choices.push({ id: "overseas", label: "Play overseas", preview: "Clubs abroad pay real salaries and scouts still watch. Offers come next month." });
    choices.push({ id: "stay", label: "Keep your current path", preview: "Stay where you are. Offers come at the next window." });
    decide(s, { templateId: "undrafted", title: "Undrafted", body: "Plenty of NBA players went undrafted. These are your options.", choices, context: { team: teamFor(s, year) }, required: true });
  }
}

function campStep(s: LifeState, year: number) {
  const team = typeof s.flags.campTeam === "string" ? s.flags.campTeam : teamFor(s, year);
  delete s.flags.campOffer;
  delete s.flags.campDeal;
  delete s.flags.buyout;
  const rng = rngOf(s.rng, "draft");
  const camp = performanceLevel(s) + rng.normal(0, 2);
  s.education.amateur = false;
  if (s.season) finalizeSeason(s, levelOf(s));
  if (camp >= 69) {
    s.achievements.rosterSpot = s.ageMonths;
    s.placement = { node: "nba", countryId: "US", leagueId: "nba", teamName: team, role: "deep-bench", coaching: 90, since: s.ageMonths, contract: { salary: 1_270_000, yearsLeft: 1, guaranteed: false }, costPerYear: 0 };
    s.residence = { countryId: "US", locality: team.split(" ").slice(0, -1).join(" "), localityKind: "city" };
    log(s, "milestone", `You make the ${team} opening-night roster out of training camp.`, null, "good");
  } else {
    s.placement = { node: "g-league", countryId: "US", leagueId: "g-league", teamName: `${team} G League affiliate`, role: "rotation", coaching: 80, since: s.ageMonths, contract: { salary: 40_500, yearsLeft: 1, guaranteed: false }, costPerYear: 0 };
    s.residence = { countryId: "US", locality: "a G League city", localityKind: "city" };
    log(s, "info", `Waived after camp. You join the ${team} G League affiliate.`, null, "bad");
  }
}

/** A call-up that sticks: the parent club signs him for the rest of the season, and the NBA sim takes over from there. */
function gLeagueStep(s: LifeState) {
  if (s.placement.node !== "g-league" || !nbaSeasonMonth(s)) return;
  const rng = rngOf(s.rng, "draft");
  const roll = rng.next();
  const play = rng.next();
  if (roll >= callUpChance(s)) return;
  const parent = s.placement.teamName?.replace(/ G League affiliate.*$/, "").replace(/^G League affiliate \((.*)\)$/, "$1") ?? "";
  const team = (NBA_TEAMS as readonly string[]).includes(parent) ? parent : teamFor(s, calendar(s).year);
  const twoWay = s.placement.contract?.twoWay === true;
  if (s.season && s.season.gp + s.season.wins + s.season.losses > 0) s.seasons.push(s.season);
  s.season = null;
  s.achievements.rosterSpot ??= s.ageMonths;
  s.placement = { node: "nba", countryId: "US", leagueId: "nba", teamName: team, role: "deep-bench", coaching: 90, since: s.ageMonths, contract: { salary: nbaSalary("deep-bench"), yearsLeft: 1, guaranteed: false }, costPerYear: 0 };
  s.residence = { countryId: "US", locality: team.split(" ").slice(0, -1).join(" "), localityKind: "city" };
  log(s, "milestone", twoWay ? `The ${team} convert your two-way deal into a standard contract for the rest of the season.` : `Called up by the ${team} on a 10-day contract. They sign you for the rest of the season.`, null, "good");
  if (s.achievements.nbaDebut === null && play < 0.8) {
    s.nbaGames += 1;
    recordDebut(s, `Called up from the G League, ${2 + Math.floor(play * 10)} minutes.`);
  }
}

/** February deadline: trade odds are a model, higher after a trade request. */
function tradeDeadline(s: LifeState) {
  const recent = (k: string) => typeof s.flags[k] === "number" && s.ageMonths - (s.flags[k] as number) <= 3;
  const req = recent("tradeRequest");
  const shield = recent("tradeShield");
  delete s.flags.tradeRequest;
  delete s.flags.tradeShield;
  const rng = rngOf(s.rng, "scouting");
  const p = 0.06 + (req ? 0.45 : 0) - (shield ? 0.04 : 0) + (s.placement.role === "deep-bench" ? 0.04 : 0);
  const roll = rng.next();
  const pickU = rng.next();
  const old = s.placement.teamName;
  if (roll >= p) {
    if (req) log(s, "info", `The deadline passes. You're still with the ${old}.`, null, "bad");
    return;
  }
  const others = NBA_TEAMS.filter((t) => t !== old);
  const team = others[Math.floor(pickU * others.length)]!;
  if (s.season && s.season.gp + s.season.wins + s.season.losses > 0) s.seasons.push(s.season);
  s.season = null;
  s.placement = { ...s.placement, teamName: team, since: s.ageMonths };
  s.residence = { countryId: "US", locality: team.split(" ").slice(0, -1).join(" "), localityKind: "city" };
  log(s, "move", `Traded from the ${old} to the ${team} at the deadline.${req ? " You got your wish." : ""}`, null, req ? "good" : "neutral");
}

function askDeclare(s: LifeState, year: number, manual = false) {
  const band = readiness(s);
  const { mid } = projectedRange(s, year);
  decide(s, {
    templateId: "draft-declare",
    title: `Declare for the ${year} NBA Draft?`,
    body: `Scouts put you at "${READINESS_LABEL[band]}" and teams project you ${mid <= 60 ? `around pick ${mid}` : "outside the top 60"}. ${s.placement.node === "university" ? "College players can withdraw by late May and keep their eligibility (game rule)." : "Declaring is free; going undrafted makes you a free agent."}`,
    choices: [
      { id: "declare", label: "Declare", preview: "Enter the draft pool. Workouts and interviews follow." },
      { id: "wait", label: s.placement.node === "university" ? "Return to school" : "Wait a year", preview: "Develop another season first." },
    ],
    context: manual ? { manual: true } : undefined,
    required: true,
  });
}

/** Early entry is open January through April for anyone eligible, whatever the scouts think. */
export function canDeclareNow(s: LifeState): boolean {
  if (s.after || s.ended || s.pendingDecision) return false;
  const { year, month } = calendar(s);
  return month >= 1 && month <= 4 && s.draft.declaredYear !== year && canDeclare(s, year) && !autoEligible(s, year);
}

export function declareNow(state: LifeState): LifeState {
  const s = clone(state);
  if (!canDeclareNow(s)) return s;
  const { year } = calendar(s);
  s.flags.declareAsked = year;
  s.draft.withdrewYears = s.draft.withdrewYears.filter((y) => y !== year);
  askDeclare(s, year, true);
  return s;
}

/** He can walk away from playing at any point once he is an adult. */
export function canRetireNow(s: LifeState): boolean {
  return !s.after && !s.ended && !s.pendingDecision && s.ageMonths >= 18 * 12;
}

export function retireNow(state: LifeState): LifeState {
  const s = clone(state);
  if (canRetireNow(s)) crossroads(s, "choice");
  return s;
}

function openDraftCycle(s: LifeState, year: number) {
  s.draft = { ...s.draft, declaredYear: year, stock: 0, combine: null, interviews: [], workouts: null, promise: null };
}

function combineStep(s: LifeState, year: number) {
  const c = runCombine(s, year, rngOf(s.rng, "draft"));
  s.draft.combine = c;
  s.draft.stock = Math.round((s.draft.stock + c.delta) * 10) / 10;
  if (!c.invited) {
    log(s, "draft", "No combine invite. Teams will judge you on film and private workouts.");
    return;
  }
  const verdict = c.delta >= 1 ? "Your testing turns heads." : c.delta <= -1 ? "Your testing numbers worry some teams." : "Your testing lands about where teams expected.";
  log(s, "draft", `NBA Draft Combine. ${verdict}`, null, c.delta >= 1 ? "good" : c.delta <= -1 ? "bad" : "neutral");
}

function weakestSkill(s: LifeState): string {
  const w = [...SKILLS].sort((a, b) => s.skills[a.key] - s.skills[b.key])[0]!;
  return w.label.toLowerCase();
}

function askInterview(s: LifeState, year: number, qs: string, teams: string, n: number) {
  const q = INTERVIEW_QUESTIONS.find((x) => x.id === qs.split(",")[n])!;
  const team = teams.split("|")[n]!;
  decide(s, {
    templateId: "draft-interview",
    title: `Interview with the ${team}`,
    body: `${q.text} (Interview ${n + 1} of 3 before the ${year} draft.)`,
    choices: q.answers.map((a, i) => ({ id: `a${i}`, label: a.label.replace("{weak}", weakestSkill(s)), preview: a.hint })),
    context: { qs, teams, n, team },
    required: true,
  });
}

function askWorkouts(s: LifeState) {
  const { mid } = projectedRange(s, calendar(s).year);
  decide(s, {
    templateId: "draft-workouts",
    title: "Pre-draft workouts",
    body: `Teams want to see you in their gyms. Right now they project you ${mid <= 60 ? `around pick ${mid}` : "outside the top 60"}.`,
    choices: [
      { id: "wide", label: "Work out for a dozen teams", preview: "More teams see you. Bigger swings either way, and tiring." },
      { id: "targeted", label: "Only teams picking in your range", preview: "Smaller swings. A team might promise to take you." },
      { id: "skip", label: "Skip workouts", preview: mid <= 8 ? "Top prospects do this to protect their stock." : "Teams will wonder what you are hiding." },
    ],
    required: true,
  });
}

function recordDebut(s: LifeState, detail: string) {
  if (s.achievements.nbaDebut !== null) return;
  s.achievements.nbaDebut = s.ageMonths;
  const id = log(s, "milestone", `NBA debut. ${detail}`, null, "good");
  if (!s.keepPlaying) {
    decide(s, {
      templateId: "chapter",
      title: "You made it",
      body: "One NBA regular-season game. That was the goal. Finish this chapter, or keep playing to see how long the career runs.",
      choices: [
        { id: "finish", label: "Finish this chapter", preview: "See your end report." },
        { id: "keep", label: "Keep playing", preview: "The life continues. You can retire later." },
      ],
      context: { debutEntry: id },
      required: true,
    });
  }
}

function scheduledStep(s: LifeState) {
  const due = s.scheduled.filter((x) => x.month <= s.ageMonths);
  if (!due.length) return;
  s.scheduled = s.scheduled.filter((x) => x.month > s.ageMonths);
  for (const d of due) {
    const t = EVENT_BY_ID[d.templateId];
    if (!t) continue;
    runEvent(s, t, d.causeId);
    if (s.pendingDecision) break;
  }
}

/* --------------------------------------------------------------- national team */

function intlStep(s: LifeState) {
  const nat = nationalTeam(s);
  if (!nat || s.ageMonths < 13 * 12) return;
  const { year, month } = calendar(s);
  const ts = [...tournamentsFor(nat, year), ...tournamentsFor(nat, year + 1)];
  const go = typeof s.flags.intlGo === "string" ? s.flags.intlGo : null;
  for (const t of ts) {
    if (t.year !== year || t.month !== month) continue;
    if (go === t.id) {
      delete s.flags.intlGo;
      if (s.condition.injury) {
        log(s, "info", `Injured. You miss the ${t.name}.`, null, "bad");
        continue;
      }
      const sel = evaluate(s, t);
      if (sel) runTournament(s, { ...sel, picked: true });
    } else if (t.maxAge === null && s.ageMonths >= 17 * 12) {
      const sel = evaluate(s, t);
      if (sel?.qualified) {
        const run = playTournament(s, sel, false);
        log(s, "info", run.summary, null, run.result.medal ? "good" : "neutral");
      }
    }
  }
  if (s.pendingDecision) return;
  const seen = String(s.flags.intlSeen ?? "").split(",");
  for (const t of ts) {
    const monthsAway = (t.year - year) * 12 + t.month - month;
    if (monthsAway < 1 || monthsAway > 2 || seen.includes(t.id)) continue;
    s.flags.intlSeen = [...seen, t.id].slice(-8).join(",");
    const sel = evaluate(s, t);
    if (!sel) continue;
    if (!sel.qualified) {
      if (t.maxAge === null && sel.level >= sel.bar - 6) log(s, "info", `${country(nat).name} did not qualify for the ${t.name}.`);
      continue;
    }
    if (!sel.picked) {
      if (sel.level >= sel.bar - 5) log(s, "info", `Left off the ${country(nat).name} roster for the ${t.name}. The coaches went with others.`);
      continue;
    }
    callUp(s, sel);
    return;
  }
}

function callUp(s: LifeState, sel: Selection) {
  const { t, nat } = sel;
  const fed = country(nat).federation!.name;
  const role = roleFor(performanceLevel(s), sel.bar + 2);
  const nbaSummer = s.placement.node === "nba" && t.maxAge === null;
  decide(s, {
    templateId: "intl-callup",
    title: `${t.kind === "olympics" ? "Olympic" : "National team"} call-up`,
    body: `${fed} names you to the ${country(nat).name} roster for the ${t.name}. Coaches see you as ${ROLE_LABEL[role].toLowerCase()}.${nbaSummer ? " Your NBA team would rather you rest." : ""}`,
    choices: [
      { id: "play", label: "Report to camp", preview: `Caps, exposure and a shot at a medal. Tiring summer.${s.condition.injury ? " You're injured; you'd need to heal by then." : ""}` },
      { id: "withdraw", label: "Withdraw", preview: "Rest and recover. The federation may hold it against you." },
    ],
    context: { tid: t.id },
    required: true,
  });
}

function runTournament(s: LifeState, sel: Selection) {
  const run = playTournament(s, sel, true);
  for (const b of run.boxes) pushGame(s, b);
  const r = run.result;
  s.international.countryId ??= sel.nat;
  s.international.caps += r.gp;
  s.international.tournaments.push(r);
  const perf = r.gp ? clamp(0.6 + r.pts / r.gp / 20, 0.5, 1.6) : 0.5;
  s.exposure = clamp(s.exposure + KIND_EXPOSURE[r.kind] * perf + (r.medal ? 4 : 0), 0, 100);
  s.condition.energy = clamp(s.condition.energy - 12, 5, 100);
  s.evidence.push({ month: s.ageMonths, text: `${r.finish} at the ${sel.t.short} with ${country(sel.nat).name}${r.gp ? `: ${(r.pts / r.gp).toFixed(1)} ppg` : ""}`, weight: KIND_EXPOSURE[r.kind] * 0.9 * perf });
  s.evidence = [...s.evidence].sort((a, b) => b.weight - a.weight).slice(0, 24);
  log(s, "milestone", run.summary, null, r.medal ? "good" : "neutral");
}

/* --------------------------------------------------------------- agent */

function agentStep(s: LifeState) {
  if (s.finance.agent || s.ageMonths < 210) return;
  if (s.placement.node === "university" && s.draft.declaredYear === null) return;
  const last = typeof s.flags.agentAsked === "number" ? s.flags.agentAsked : -999;
  if (s.ageMonths - last < 18) return;
  const ready = s.exposure >= 22 || s.draft.declaredYear !== null || isProNode(s.placement.node);
  if (!ready) return;
  s.flags.agentAsked = s.ageMonths;
  const pool = agentPool(s);
  decide(s, {
    templateId: "agent-pick",
    title: "Picking an agent",
    body: `Agents have started calling. ${s.education.amateur && s.placement.node !== "university" ? "Signing with one ends amateur status for college (game rule)." : "An agent negotiates contracts and finds teams."}`,
    choices: [
      ...pool.map((a, i) => ({
        id: `a${i}`,
        label: `${a.name}, ${a.firm}`,
        preview: `${a.reach === "global" ? "NBA and EuroLeague contacts" : a.reach === "regional" ? "Clubs across the region" : "Knows local clubs"}. Takes ${Math.round(a.fee * 100)}% of salary.`,
        disabled: a.reach === "global" && s.exposure < 45 ? "They only sign prospects with more buzz (exposure 45+)." : a.reach === "regional" && s.exposure < 18 && !isProNode(s.placement.node) ? "They want to see more of you first." : undefined,
      })),
      { id: "none", label: "No agent for now", preview: "Keep every dollar. Fewer doors open." },
    ],
    required: true,
  });
}

/** Three fictional agents, drawn without touching any game stream. */
function agentPool(s: LifeState) {
  const r = rngOf(createStreams(hashString(`${s.seed}:agents:${s.ageMonths}`)), "generation");
  const res = country(s.residence.countryId);
  const local = drawName(r, poolFor(res.id)).displayName;
  const regional = drawName(r, poolFor(res.id)).displayName;
  const global = drawName(r, r.pick(["us", "anglo", "es", "balkan", "fr"])).displayName;
  return [
    makeAgent(global, r.pick(["Meridian Athlete Group", "Northline Sports", "Crestview Management", "Baseline Global"]), 0.04, "global", s.ageMonths),
    makeAgent(regional, `${res.capital ?? res.name} Sports Management`, 0.08, "regional", s.ageMonths),
    makeAgent(local, "a family friend", 0.03, "local", s.ageMonths),
  ];
}

function randomEvent(s: LifeState) {
  const rng = rngOf(s.rng, "events");
  const roll = rng.next();
  const pickU = rng.next();
  const pool = eligibleEvents(s);
  if (!pool.length) return;
  const total = pool.reduce((a, e) => a + e.weight(s), 0);
  // A thin pool fires less often so the same few events don't repeat.
  if (roll >= eventRate(s) * clamp(total / 8, 0.3, 1)) return;
  let r = pickU * total;
  let chosen = pool[0]!;
  for (const e of pool) {
    r -= e.weight(s);
    if (r < 0) {
      chosen = e;
      break;
    }
  }
  runEvent(s, chosen, null);
}

function runEvent(s: LifeState, t: EventTemplate, causeId: string | null) {
  s.cooldowns[t.id] = s.ageMonths;
  if (t.once) s.flags[`ev:${t.id}`] = true;
  const body = typeof t.body === "function" ? t.body(s) : t.body;
  if (t.auto) {
    const rng = rngOf(s.rng, "events");
    const rolls = [rng.next(), rng.next(), rng.next(), rng.next()];
    const entryId = `h${s.counters.entry + 1}`;
    const out = t.auto({ s, rolls, entryId });
    s.history.push({ id: entryId, month: s.ageMonths, kind: "event", text: `${t.title}. ${body} ${out}`, causeId, tone: t.tone ?? "neutral" });
    s.counters.entry = Math.max(s.counters.entry, Number(entryId.slice(1)));
    return;
  }
  const choices: DecisionChoice[] = (t.choices ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    preview: typeof c.preview === "function" ? c.preview(s) : c.preview,
    disabled: c.blocked?.(s) ?? undefined,
  }));
  if (choices.every((c) => c.disabled)) return;
  decide(s, { templateId: `event:${t.id}`, title: t.title, body, choices, required: true, context: causeId ? { causeId } : undefined });
}

function endChecks(s: LifeState) {
  const age = s.ageMonths / 12;
  if (s.ended) {
    s.clock.paused = true;
    s.clock.pauseReason = "ended";
    return;
  }
  if (!s.pendingDecision) {
    const retireAt = typeof s.flags.retireAt === "number" ? s.flags.retireAt : 36 * 12;
    if (s.after) {
      if (age >= 65) {
        s.ended = { month: s.ageMonths, reason: "retired" };
        log(s, "milestone", `You retire at 65 as ${article(s.after.title)}.`);
      }
    } else if (s.achievements.nbaDebut === null && age >= 31 && !s.flags.crossroads31) {
      s.flags.crossroads31 = true;
      crossroads(s, "aged-out");
    } else if (s.keepPlaying && s.ageMonths >= retireAt) {
      s.flags.retireAt = s.ageMonths + 12;
      crossroads(s, "retire");
    } else if (age >= 26 && s.placement.node === "unattached" && s.ageMonths - s.placement.since >= 12 && (typeof s.flags.stalledAt !== "number" || s.ageMonths - s.flags.stalledAt >= 24)) {
      s.flags.stalledAt = s.ageMonths;
      crossroads(s, "stalled");
    }
  }
  if (s.ended) {
    s.pendingDecision = null;
    s.clock.paused = true;
    s.clock.pauseReason = "ended";
  }
}

/* --------------------------------------------------------------- decisions */

export function resolveDecision(state: LifeState, choiceId: string): LifeState {
  const s = clone(state);
  resolveInPlace(s, choiceId);
  return s;
}

function resolveInPlace(s: LifeState, choiceId: string) {
  const d = s.pendingDecision;
  if (!d) return;
  const choice = d.choices.find((c) => c.id === choiceId);
  if (!choice || choice.disabled) throw new Error(`Choice ${choiceId} is not available`);
  s.pendingDecision = null;
  if (s.clock.pauseReason === "decision") s.clock.pauseReason = null;
  const decisionEntry = `h${s.counters.entry + 1}`;
  if (d.templateId.startsWith("event:")) {
    const t = EVENT_BY_ID[d.templateId.slice(6)]!;
    const c = t.choices!.find((x) => x.id === choiceId)!;
    s.counters.entry = Number(decisionEntry.slice(1));
    const out = c.apply({ s, rolls: d.rolls, entryId: decisionEntry });
    s.history.push({ id: decisionEntry, month: s.ageMonths, kind: "decision", text: `${t.title}: ${c.label}. ${out}`, causeId: (d.context?.causeId as string) ?? null, tone: t.tone ?? "neutral" });
    if (c.follow) s.scheduled.push({ templateId: c.follow.id, month: s.ageMonths + c.follow.delay, causeId: decisionEntry });
    return;
  }
  switch (d.templateId) {
    case "offers": {
      const renew = typeof s.flags.renewSalary === "number" ? s.flags.renewSalary : 0;
      clearRenewal(s);
      if (choiceId === "renew") {
        s.placement.contract = { salary: renew, yearsLeft: 2, guaranteed: true, twoWay: s.placement.teamName?.includes("two-way") || undefined };
        log(s, "decision", `Re-signed with ${s.placement.teamName}: ${usd(renew)} a year for two years.`, null, "good");
      } else if (choiceId === "fa") {
        nbaFreeAgency(s);
      } else if (choiceId === "overseas") {
        startOverseasHunt(s);
      } else if (choiceId === "stay") {
        if (isProNode(s.placement.node) && !s.placement.contract) {
          s.placement = { ...s.placement, node: "unattached", leagueId: null, teamName: null, role: "none", contract: null, costPerYear: 0 };
          s.flags.reviewSoon = true;
          log(s, "decision", "You turn the offers down and wait for something better.");
        } else {
          log(s, "decision", `${choice.label}.`);
        }
      } else {
        const offer = d.offers!.find((o) => o.id === choiceId)!;
        acceptOffer(s, offer);
      }
      s.offers = [];
      return;
    }
    case "intl-callup": {
      const tid = String(d.context?.tid ?? "");
      if (choiceId === "play") {
        s.flags.intlGo = tid;
        log(s, "decision", `You accept the call-up. Camp opens next month.`, null, "good");
      } else {
        s.international.declined += 1;
        s.flags.intlSnub = s.ageMonths;
        s.condition.energy = clamp(s.condition.energy + 8, 5, 100);
        log(s, "decision", "You withdraw from the national team this summer.");
      }
      return;
    }
    case "agent-pick": {
      if (choiceId === "none") {
        log(s, "decision", "No agent for now. You answer your own phone.");
        return;
      }
      const a = agentPool(s)[Number(choiceId.slice(1))]!;
      s.finance.agent = a;
      s.exposure = clamp(s.exposure + (a.reach === "global" ? 6 : a.reach === "regional" ? 4 : 1), 0, 100);
      if (s.education.amateur && s.placement.node !== "university") {
        s.education.amateur = false;
        s.education.ncaaEligible = false;
      }
      s.scheduled.push({ templateId: "agent-call", month: s.ageMonths + 4, causeId: decisionEntry });
      log(s, "decision", `Signed with ${a.name} (${a.firm}). ${Math.round(a.fee * 100)}% of salary.`, null, "good");
      return;
    }
    case "draft-declare": {
      const { year } = calendar(s);
      if (choiceId === "declare") {
        openDraftCycle(s, year);
        log(s, "draft", `Declared for the ${year} NBA Draft.`);
      } else {
        s.draft.withdrewYears.push(year);
        log(s, "decision", `Not declaring for the ${year} draft.`);
      }
      return;
    }
    case "draft-interview": {
      const n = Number(d.context?.n ?? 0);
      const qs = String(d.context?.qs ?? "");
      const q = INTERVIEW_QUESTIONS.find((x) => x.id === qs.split(",")[n])!;
      const i = Number(choiceId.slice(1));
      const delta = interviewDelta(s, q.answers[i]!, d.rolls[0]!);
      const team = String(d.context?.team ?? "");
      s.draft.stock = Math.round((s.draft.stock + delta) * 10) / 10;
      s.draft.interviews.push({ team, question: q.text, answer: choice.label, delta });
      const read = delta >= 0.5 ? "They liked that answer." : delta <= -0.5 ? "The room goes quiet." : "Hard to read the room.";
      log(s, "draft", `Interview with the ${team}: "${choice.label}." ${read}`, null, delta >= 0.5 ? "good" : delta <= -0.5 ? "bad" : "neutral");
      if (n < 2) askInterview(s, calendar(s).year, qs, String(d.context?.teams ?? ""), n + 1);
      else askWorkouts(s);
      return;
    }
    case "draft-workouts": {
      const { year } = calendar(s);
      const { mid } = projectedRange(s, year);
      const [r0, r1, r2, r3] = d.rolls as [number, number, number, number];
      const bell = (r0 + r1 + r2 - 1.5) * 2;
      s.draft.workouts = choiceId as Workouts;
      let delta = 0;
      if (choiceId === "wide") {
        delta = clamp(bell, -2, 2);
        s.condition.energy = clamp(s.condition.energy - 10, 0, 100);
        s.exposure = clamp(s.exposure + 3, 0, 100);
      } else if (choiceId === "targeted") {
        delta = clamp(0.1 + bell * 0.5, -1, 1.2);
        if (mid <= 35 && r3 < 0.25 + (s.traits.composure - 50) / 250) {
          const pick = Math.min(60, mid + 2);
          s.draft.promise = { team: teamAtPick(draftOrder(s.seed, year), pick), pick };
        }
      } else {
        delta = mid <= 8 ? 0 : -(0.5 + r3 * 0.5);
      }
      delta = Math.round(delta * 10) / 10;
      s.draft.stock = Math.round((s.draft.stock + delta) * 10) / 10;
      const what = choiceId === "wide" ? "Workouts for a dozen teams." : choiceId === "targeted" ? "Workouts for the teams in your range." : "You skip workouts.";
      const read = delta >= 0.5 ? " Your stock rises." : delta <= -0.5 ? " Your stock slips." : "";
      log(s, "draft", `${what}${read}`, null, delta >= 0.5 ? "good" : delta <= -0.5 ? "bad" : "neutral");
      if (s.draft.promise) log(s, "draft", `The ${s.draft.promise.team} promise to take you at ${s.draft.promise.pick} if you are still there.`, null, "good");
      if (calendar(s).month >= 6 && s.draft.declaredYear === year) holdDraft(s, year);
      return;
    }
    case "draft-after":
    case "undrafted": {
      const team = String(d.context?.team ?? "an NBA team");
      if (choiceId === "two-way") {
        s.education.amateur = false;
        if (s.season) finalizeSeason(s, levelOf(s));
        s.placement = { node: "g-league", countryId: "US", leagueId: "g-league", teamName: `${team} G League affiliate (two-way)`, role: "rotation", coaching: 82, since: s.ageMonths, contract: { salary: 580_000, yearsLeft: 2, guaranteed: false, twoWay: true }, costPerYear: 0 };
        s.residence = { countryId: "US", locality: "a G League city", localityKind: "city" };
        s.achievements.rosterSpot = s.ageMonths;
        log(s, "decision", `Signed a two-way contract with the ${team}.`, null, "good");
      } else if (choiceId === "camp") {
        s.flags.campDeal = true;
        s.flags.campTeam = team;
        log(s, "decision", `Signed a training camp deal with the ${team}. Camp opens in October.`);
      } else if (choiceId === "g-league") {
        s.education.amateur = false;
        if (s.season) finalizeSeason(s, levelOf(s));
        s.placement = { node: "g-league", countryId: "US", leagueId: "g-league", teamName: `G League affiliate (${team})`, role: "rotation", coaching: 80, since: s.ageMonths, contract: { salary: 40_500, yearsLeft: 1, guaranteed: false }, costPerYear: 0 };
        s.residence = { countryId: "US", locality: "a G League city", localityKind: "city" };
        log(s, "decision", "Signed with a G League team.");
      } else if (choiceId === "overseas") {
        startOverseasHunt(s);
      } else {
        log(s, "decision", "You stay on your current path.");
        if (s.placement.node === "unattached") s.flags.reviewSoon = true;
      }
      return;
    }
    case "crossroads": {
      const why = String(d.context?.why ?? "retire");
      if (choiceId === "keep" && why === "choice") {
        log(s, "decision", "Not yet. You keep playing.");
      } else if (choiceId === "keep") {
        s.keepPlaying = true;
        if (s.placement.node === "unattached") s.flags.reviewSoon = true;
        log(s, "decision", why === "retire" ? "One more season. You can't walk away yet." : "You keep playing. The NBA is a long shot now, but basketball still pays.");
      } else if (choiceId === "overseas") {
        s.keepPlaying = true;
        startOverseasHunt(s);
      } else if (choiceId.startsWith("track:")) {
        const opt = trackOptions(s).find((o) => o.track === choiceId.slice(6))!;
        retireFromPlaying(s);
        takeJob(s, opt.track, opt.step, opt.rep);
        log(s, "move", `${TRACK_LABEL[opt.track]}: you start as ${article(s.after!.title)} with ${s.after!.employer}. ${usd(s.after!.salary)} a year.`, null, "good");
      } else {
        s.ended = { month: s.ageMonths, reason: why === "aged-out" ? "aged-out" : "retired" };
        log(s, "milestone", why === "aged-out" ? "You stop chasing it. This life's basketball story ends here." : `You retire at ${Math.floor(s.ageMonths / 12)}.`);
        s.clock.paused = true;
        s.clock.pauseReason = "ended";
      }
      return;
    }
    case "after-review": {
      const a = s.after!;
      if (choiceId === "offer" || choiceId === "down") {
        const step = Number(d.context?.step);
        const r = LADDER[a.track][step]!;
        const cost = rungCost(r, String(d.context?.where ?? a.countryId));
        if (cost > 0) charge(s, cost);
        const from = `${a.title}, ${a.employer}`;
        takeJob(s, a.track, step, choiceId === "down" ? clamp(a.rep - 5, 0, 100) : a.rep);
        log(s, "move", `${choiceId === "down" ? "A step down" : "Promoted"}: from ${from} to ${s.after!.title} with ${s.after!.employer}.${cost ? ` You put ${usd(cost)} into it.` : ""}`, null, choiceId === "down" ? "neutral" : "good");
      } else if (choiceId === "raise") {
        const bar = LADDER[a.track][a.step]!.bar;
        if (rngOf(s.rng, "after").next() < clamp(0.35 + (a.rep - bar) / 40, 0.1, 0.8)) {
          a.salary = Math.round((a.salary * 1.12) / 500) * 500;
          log(s, "decision", `They give you a raise: ${usd(a.salary)} a year.`, null, "good");
        } else {
          a.rep = clamp(a.rep - 2, 0, 100);
          log(s, "decision", "They say no, and remember that you asked.", null, "bad");
        }
      } else if (choiceId === "switch") {
        switchCareer(s, Boolean(d.context?.fired));
      } else if (choiceId === "retire") {
        s.ended = { month: s.ageMonths, reason: "retired" };
        log(s, "milestone", `You retire for good at ${Math.floor(s.ageMonths / 12)}.`);
        s.clock.paused = true;
        s.clock.pauseReason = "ended";
      } else {
        log(s, "decision", `You stay with ${a.employer}.`);
      }
      return;
    }
    case "after-switch": {
      if (choiceId === "back") {
        log(s, "decision", `You stay with ${s.after!.employer}.`);
        return;
      }
      if (choiceId === "retire") {
        s.ended = { month: s.ageMonths, reason: "retired" };
        log(s, "milestone", `You retire for good at ${Math.floor(s.ageMonths / 12)}.`);
        s.clock.paused = true;
        s.clock.pauseReason = "ended";
        return;
      }
      const opt = trackOptions(s, s.after!.track).find((o) => o.track === choiceId.slice(6))!;
      takeJob(s, opt.track, opt.step, opt.rep);
      log(s, "move", `A new career in ${TRACK_LABEL[opt.track].toLowerCase()}: ${s.after!.title} with ${s.after!.employer}.`, null, "good");
      return;
    }
    case "nba-contest": {
      const three = d.context?.kind === "three";
      const name = three ? "Three-Point Contest" : "Slam Dunk Contest";
      if (choiceId === "skip") {
        s.condition.energy = clamp(s.condition.energy + 6, 5, 100);
        log(s, "decision", `You skip the ${name} and rest over the break.`);
        return;
      }
      const odds = three ? clamp((Number(d.context?.pct ?? 0) - 0.34) * 3 + 0.12, 0.08, 0.4) : clamp((s.body.vertical - 70) / 60 + 0.1, 0.08, 0.4);
      const [win, final, hurt] = d.rolls as [number, number, number, number];
      if (!three && hurt < 0.04) {
        s.condition.injury = { id: "ankle-sprain", label: "Sprained ankle", monthsLeft: 1, severity: 1, causeEntryId: decisionEntry };
        log(s, "injury", `You land wrong in the ${name} and sprain an ankle.`, null, "bad");
        return;
      }
      s.exposure = clamp(s.exposure + (win < odds ? 6 : 3), 0, 100);
      if (win < odds) {
        const line = currentNbaLine(s);
        if (line) (line.awards ??= []).push(`${name} champion`);
        log(s, "milestone", `You win the ${name}.`, null, "good");
      } else {
        log(s, "decision", final < 0.4 ? `You make the final round of the ${name} and finish second.` : `You go out in the first round of the ${name}.`);
      }
      return;
    }
    case "chapter": {
      if (choiceId === "finish") {
        s.ended = { month: s.ageMonths, reason: "chapter" };
        s.clock.paused = true;
        s.clock.pauseReason = "ended";
      } else {
        s.keepPlaying = true;
        log(s, "decision", "You keep playing.");
      }
      return;
    }
  }
}

function clearRenewal(s: LifeState) {
  delete s.flags.renewSalary;
  delete s.flags.renewTeam;
  delete s.flags.nbaFreeAgent;
}

/** Testing the market: odds and money are a model built on current level. */
function nbaFreeAgency(s: LifeState) {
  const rng = rngOf(s.rng, "scouting");
  const perf = performanceLevel(s);
  const roll = rng.next();
  const pickU = rng.next();
  const old = s.placement.teamName;
  const team = NBA_TEAMS.filter((t) => t !== old)[Math.floor(pickU * (NBA_TEAMS.length - 1))]!;
  const role = roleFor(perf, 60);
  if (roll < clamp((perf - 62) / 15, 0.1, 0.85)) {
    const salary = Math.round(nbaSalary(role) * 1.2);
    s.placement = { ...s.placement, teamName: team, role, since: s.ageMonths, contract: { salary, yearsLeft: 3, guaranteed: true } };
    s.residence = { countryId: "US", locality: team.split(" ").slice(0, -1).join(" "), localityKind: "city" };
    log(s, "move", `Signed with the ${team} in free agency: ${usd(salary)} a year for three years.`, null, "good");
  } else if (perf >= 64) {
    s.placement = { ...s.placement, teamName: team, role: "deep-bench", since: s.ageMonths, contract: { salary: nbaSalary("deep-bench"), yearsLeft: 1, guaranteed: false } };
    s.residence = { countryId: "US", locality: team.split(" ").slice(0, -1).join(" "), localityKind: "city" };
    log(s, "move", `The market is quiet. You take a one-year minimum deal with the ${team}.`);
  } else {
    s.placement = { ...s.placement, node: "unattached", leagueId: null, teamName: null, role: "none", contract: null, costPerYear: 0 };
    s.flags.reviewSoon = true;
    log(s, "move", "No NBA team calls. You're a free agent.", null, "bad");
  }
}

function acceptOffer(s: LifeState, o: Offer) {
  if (s.season) finalizeSeason(s, levelOf(s));
  clearRenewal(s);
  if (o.salary > 0 && o.node !== "university" && o.node !== "nba") s.scheduled.push({ templateId: "contract-terms", month: s.ageMonths, causeId: null });
  const moving = o.countryId !== s.residence.countryId;
  s.placement = {
    node: o.node,
    countryId: o.countryId,
    leagueId: o.leagueId,
    teamName: o.teamName,
    role: o.role,
    coaching: o.coaching,
    since: s.ageMonths,
    contract: o.salary > 0 ? { salary: o.salary, yearsLeft: o.years, guaranteed: o.guaranteed, twoWay: o.twoWay } : null,
    costPerYear: o.costPerYear,
  };
  if (moving) {
    const c = country(o.countryId);
    s.residence = { countryId: c.id, locality: c.capital ?? c.name, localityKind: "capital" };
  }
  if (o.salary > 0 && o.node !== "university") s.education.amateur = false;
  if (o.node === "us-high-school") s.flags.usHS = true;
  if (o.node === "university") {
    s.education.level = "university";
    s.education.universityYears = 0;
  }
  log(s, "move", `${moving ? "Moved to " + country(o.countryId).name + ". " : ""}Joined ${o.teamName} (${nodeLabel(o.node, o.countryId, o.leagueId)}).${o.salary > 0 ? ` $${o.salary.toLocaleString("en-US")} a year.` : ""}`, null, "good");
}

/* --------------------------------------------------------------- after playing */

const TRACK_START: Record<Track, string> = { coach: "Start coaching", scout: "Become a scout", media: "Go into broadcasting", podcast: "Start a podcast", trainer: "Train players" };

function article(title: string) {
  const acronym = /^[A-Z](?:[A-Z]| )/.test(title);
  const t = acronym ? title : title.charAt(0).toLowerCase() + title.slice(1);
  const an = acronym ? /^[AEFHILMNORSX]/.test(title) : /^[aeiou]/.test(t);
  return `${an ? "an" : "a"} ${t}`;
}

function startOverseasHunt(s: LifeState) {
  s.flags.overseasHunt = s.ageMonths;
  s.flags.reviewSoon = true;
  log(s, "decision", s.finance.agent ? `${s.finance.agent.name} starts calling clubs abroad.` : "You email your highlight tape to clubs abroad.");
}

function crossroads(s: LifeState, why: "aged-out" | "retire" | "stalled" | "choice") {
  const age = Math.floor(s.ageMonths / 12);
  const onTeam = isProNode(s.placement.node) || s.placement.node === "local-senior";
  const choices: DecisionChoice[] = [];
  if (why === "choice") {
    choices.push({ id: "keep", label: "Not yet", preview: onTeam ? `Stay with ${s.placement.teamName ?? "your club"}.` : "Keep playing." });
  } else if (why !== "retire" || (onTeam && age < 39)) {
    choices.push({
      id: "keep",
      label: why === "retire" ? "Play one more season" : onTeam ? "Keep playing" : "Keep looking for a team",
      preview: why === "retire" ? "Ask again next year." : onTeam ? `Stay with ${s.placement.teamName ?? "your club"}. Retire when you choose.` : "Train and wait for a call. Offers come with the next window.",
    });
  }
  if ((why === "aged-out" || why === "stalled") && s.placement.node !== "foreign-pro") {
    choices.push({ id: "overseas", label: "Play overseas", preview: "Clubs in Europe, Asia and Latin America sign veterans. Offers come next month.", disabled: overseasPossible(s) ? undefined : "No league abroad would sign you at your level." });
  }
  for (const o of trackOptions(s)) {
    choices.push({ id: `track:${o.track}`, label: TRACK_START[o.track], preview: `${o.title}, ${o.employer}. About ${usd(o.pay)} a year (model).`, disabled: o.blocked ?? undefined });
  }
  choices.push({ id: "finish", label: "Finish this life", preview: "See your end report." });
  const text = {
    "aged-out": { title: "Thirty-one", body: "Players who haven't reached the NBA by 31 almost never do. Basketball can still be a living, on the court or off it." },
    retire: { title: "Time to stop?", body: `Age ${age}. Your body has been telling you for a while.` },
    stalled: { title: "A year without a team", body: "No club has called in twelve months. What now?" },
    choice: { title: "Retire from playing?", body: `Age ${age}. Your name and what you know about the game can carry into a second career.` },
  }[why];
  decide(s, { templateId: "crossroads", title: text.title, body: text.body, choices, context: { why }, required: true });
}

function retireFromPlaying(s: LifeState) {
  if (s.season) finalizeSeason(s, levelOf(s));
  clearRenewal(s);
  s.placement = { ...s.placement, node: "unattached", leagueId: null, teamName: null, role: "none", contract: null, costPerYear: 0, since: s.ageMonths };
  s.condition.injury = null;
  s.keepPlaying = false;
  log(s, "milestone", `You retire from playing at ${Math.floor(s.ageMonths / 12)}.`);
}

function afterMonth(s: LifeState) {
  s.condition.energy = clamp(s.condition.energy + 8, 5, 100);
  s.condition.health = clamp(s.condition.health + 0.5, 0, 100);
  money(s);
  const { month } = calendar(s);
  if (month === 7 && s.ageMonths - s.after!.since >= 6) afterReview(s);
  if (!s.pendingDecision) scheduledStep(s);
  if (!s.pendingDecision) randomEvent(s);
}

function afterReview(s: LifeState) {
  const a = s.after!;
  const res = yearInJob(s);
  a.rep = clamp(a.rep + res.repDelta, 0, 100);
  a.years.push(res.line);
  if (a.years.length > 40) a.years.shift();
  if (res.profit !== null) {
    a.salary = Math.max(0, res.profit);
    if (res.profit < 0) charge(s, -res.profit);
  }
  const rec = res.line.wins !== null ? ` ${res.line.wins}-${res.line.losses}.` : "";
  const good = res.repDelta >= 3;
  log(s, "season", `${a.title}, ${a.employer}:${rec} ${res.line.note}.`, null, res.fired ? "bad" : good ? "good" : "neutral");
  const tenure = Math.floor((s.ageMonths - a.since) / 12);
  if (!res.fired && !res.offer && tenure % 3 !== 0) return;
  const choices: DecisionChoice[] = [];
  const context: Record<string, string | number | boolean | null> = { fired: res.fired };
  if (res.fired) {
    log(s, "move", `${a.employer} let you go.`, null, "bad");
    const r = LADDER[a.track][a.step - 1]!;
    const where = rungCountry(r, typeof s.flags.afterHome === "string" ? s.flags.afterHome : a.countryId);
    choices.push({ id: "down", label: `Take a smaller job: ${r.title(s, where)}`, preview: `${r.employer(s, where, a.step - 1)}. About ${usd(rungPay(r, where))} a year.` });
    context.step = a.step - 1;
    context.where = where;
  } else {
    if (res.offer) {
      const o = res.offer;
      choices.push({
        id: "offer",
        label: `Take the job: ${o.title}`,
        preview: `${o.employer}. ${o.pay ? `${usd(o.pay)} a year` : "Your own business: pay depends on how it does"}.${o.cost ? ` Costs ${usd(o.cost)} to open.` : ""}${o.where !== a.countryId ? ` Moves you to ${country(o.where).name}.` : ""}`,
        disabled: canOpen(s, o.cost) ? undefined : "Not enough money to open it.",
      });
      context.step = o.step;
      context.where = o.where;
    }
    choices.push({ id: "stay", label: "Stay in your job", preview: res.offer ? "Turn the offer down." : "Nothing changes." });
    if (!LADDER[a.track][a.step]!.business) choices.push({ id: "raise", label: "Ask for a raise", preview: "Maybe 12% more. A no could cost you some standing." });
  }
  choices.push({ id: "switch", label: "Try a different career", preview: "You start lower, with some of your reputation." });
  choices.push({ id: "retire", label: "Retire for good", preview: "Ends this life. See your end report." });
  const age = Math.floor(s.ageMonths / 12);
  decide(s, {
    templateId: "after-review",
    title: res.fired ? "Let go" : res.offer ? "A job offer" : `Year in review, age ${age}`,
    body: `${res.line.note}.${rec} Reputation ${Math.round(a.rep)} of 100 (${res.repDelta >= 0 ? "+" : ""}${Math.round(res.repDelta)}).${res.offer ? ` ${res.offer.employer} want you as ${article(res.offer.title)}.` : ""}`,
    choices,
    context,
    required: true,
  });
}

function switchCareer(s: LifeState, fired: boolean) {
  const choices: DecisionChoice[] = trackOptions(s, s.after!.track).map((o) => ({ id: `track:${o.track}`, label: TRACK_START[o.track], preview: `${o.title}, ${o.employer}. About ${usd(o.pay)} a year (model).`, disabled: o.blocked ?? undefined }));
  choices.push(fired ? { id: "retire", label: "Retire for good", preview: "Ends this life." } : { id: "back", label: "Never mind", preview: `Stay with ${s.after!.employer}.` });
  decide(s, { templateId: "after-switch", title: "A different career", body: "Your name opens some doors. You start near the bottom of a new ladder.", choices, required: true });
}

/** Portfolio controls from the money panel. No randomness. */
export function manageMoney(state: LifeState, action: MoneyAction): LifeState {
  const s = clone(state);
  const note = applyMoney(s, action);
  if (note) log(s, "decision", note);
  return s;
}

/* --------------------------------------------------------------- auto */

export const AUTO_STRATEGY = [
  "Life events: the option with the lowest injury and setback risk; ties go to the one that builds more, then to the first listed.",
  "Team offers: the highest level you can afford where the coach expects at least bench minutes. A move sideways needs clearly more scouting exposure. Otherwise, stay.",
  "Draft: declare when scouts rate you in draft range or NBA-ready, or on the NBA radar from age 21. If you pressed Declare yourself, it declares.",
  "Draft interviews: the answer that fits his personality best. Workouts: only teams in range when projected in the top 45, otherwise a dozen teams.",
  "After the draft: a two-way deal first, then a camp deal, then stay.",
  "Contracts: re-sign when no offer ranks higher. NBA free agency only from a strong level. Sign contracts as written.",
  "National team: always report to camp.",
  "All-Star weekend: always enter the Three-Point or Slam Dunk Contest when invited.",
  "Agents: the widest-reaching agent who will sign you; never the family friend.",
  "After an NBA debut: finish the chapter.",
  "At 31 without an NBA debut, after a year without a team, or at retirement: keep playing while on a pro team and under 34, otherwise start coaching. If you pressed Retire yourself, it starts coaching.",
  "Jobs after playing: take every promotion, otherwise stay. Never asks for a raise or switches careers.",
  "Money: never touches the portfolio controls. Only life-event choices change it.",
];

const NODE_RANK: Record<string, number> = { nba: 12, "g-league": 10, "foreign-pro": 8, "domestic-pro": 8, university: 9, "us-high-school": 6, "elite-youth": 6, "local-senior": 4, "local-club": 3, "school-team": 2, playground: 1 };

export function autoChoice(s: LifeState): string {
  const d = s.pendingDecision!;
  const open = d.choices.filter((c) => !c.disabled);
  if (d.templateId.startsWith("event:")) {
    const t = EVENT_BY_ID[d.templateId.slice(6)]!;
    const ranked = open
      .map((c, i) => {
        const def = t.choices!.find((x) => x.id === c.id)!;
        return { id: c.id, risk: def.risk ?? 1, growth: def.growth ?? 1, i };
      })
      .sort((a, b) => a.risk - b.risk || b.growth - a.growth || a.i - b.i);
    return ranked[0]!.id;
  }
  switch (d.templateId) {
    case "offers": {
      const has = (id: string) => open.some((c) => c.id === id);
      const fallback = has("renew") ? "renew" : has("fa") ? "fa" : "stay";
      const offers = (d.offers ?? []).filter((o) => !d.choices.find((c) => c.id === o.id)?.disabled && o.role !== "deep-bench");
      const curRank = NODE_RANK[s.placement.node] ?? 0;
      const best = offers
        .map((o) => ({ o, score: (NODE_RANK[o.node] ?? 0) * 10 + (levelOfOffer(o) ?? 0) / 10 + o.exposure / 50 }))
        .sort((a, b) => b.score - a.score)[0];
      if (has("fa") && performanceLevel(s) >= 72) return "fa";
      const anyOffer = open.find((c) => d.offers?.some((o) => o.id === c.id))?.id;
      if (!best) return fallback === "stay" && isProNode(s.placement.node) && !s.placement.contract && anyOffer ? anyOffer : fallback;
      const bestRank = NODE_RANK[best.o.node] ?? 0;
      if (bestRank > curRank) return best.o.id;
      const curExposure = levelOf(s)?.model.exposure ?? 0;
      if (bestRank === curRank && best.o.exposure >= curExposure + 10) return best.o.id;
      if (fallback === "stay" && isProNode(s.placement.node) && !s.placement.contract) return best.o.id;
      return fallback;
    }
    case "intl-callup":
      return "play";
    case "agent-pick":
      return open.find((c) => c.id === "a0")?.id ?? open.find((c) => c.id === "a1")?.id ?? "none";
    case "draft-declare": {
      if (d.context?.manual) return "declare";
      const band = readiness(s);
      const age = s.ageMonths / 12;
      return band === "draft-range" || band === "nba-ready" || (age >= 21 && band === "radar") ? "declare" : "wait";
    }
    case "draft-interview": {
      const q = INTERVIEW_QUESTIONS.find((x) => x.id === String(d.context?.qs ?? "").split(",")[Number(d.context?.n ?? 0)])!;
      const best = q.answers.map((a, i) => ({ i, v: interviewDelta(s, a, 0.5) })).sort((a, b) => b.v - a.v || a.i - b.i)[0]!;
      return `a${best.i}`;
    }
    case "draft-workouts":
      return projectedRange(s, calendar(s).year).mid <= 45 ? "targeted" : "wide";
    case "draft-after":
    case "undrafted":
      return open.find((c) => c.id === "two-way")?.id ?? open.find((c) => c.id === "camp")?.id ?? open.find((c) => c.id === "g-league")?.id ?? "stay";
    case "chapter":
      return "finish";
    case "nba-contest":
      return "compete";
    case "crossroads": {
      const onTeam = isProNode(s.placement.node) || s.placement.node === "local-senior";
      if (d.context?.why === "choice") return open.find((c) => c.id === "track:coach")?.id ?? open.find((c) => c.id.startsWith("track:"))?.id ?? "finish";
      if (open.some((c) => c.id === "keep") && onTeam && s.ageMonths < 34 * 12) return "keep";
      return open.find((c) => c.id === "track:coach")?.id ?? open.find((c) => c.id.startsWith("track:"))?.id ?? "finish";
    }
    case "after-review":
      return open.find((c) => c.id === "offer")?.id ?? open.find((c) => c.id === "stay")?.id ?? open.find((c) => c.id === "down")?.id ?? "retire";
    case "after-switch":
      return open[0]!.id;
  }
  return open[0]!.id;
}

function levelOfOffer(o: Offer): number | null {
  return o.difficulty;
}

/* --------------------------------------------------------------- plan */

export function setPlan(state: LifeState, plan: { primary?: FocusId; secondary?: FocusId | null; workload?: Workload }): LifeState {
  const s = clone(state);
  const age = s.ageMonths / 12;
  if (plan.primary && focusAvailable(FOCUS_BY_ID[plan.primary], age)) s.plan.primary = plan.primary;
  if (plan.secondary !== undefined) {
    if (plan.secondary === null || (focusAvailable(FOCUS_BY_ID[plan.secondary], age) && plan.secondary !== s.plan.primary)) s.plan.secondary = plan.secondary;
  }
  if (s.plan.secondary === s.plan.primary) s.plan.secondary = null;
  if (plan.workload) s.plan.workload = plan.workload;
  return s;
}

export function rename(state: LifeState, given: string, family: string): LifeState {
  const s = clone(state);
  const g = given.trim().slice(0, 24) || s.identity.givenName;
  const f = family.trim().slice(0, 24) || s.identity.familyName;
  s.identity.givenName = g;
  s.identity.familyName = f;
  s.identity.displayName = formatName(g, f, s.identity.namePool);
  return s;
}

function teamFor(s: LifeState, year: number) {
  return nbaTeam(hashString(`${s.seed}:team:${year}`) / 4294967296);
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

