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
import { autoEligible, callUpChance, canDeclare, draftClass, draftValue, nbaSeasonMonth, rookieSalary, runDraft } from "./draft";
import { EVENT_BY_ID, eligibleEvents, eventRate, type EventTemplate } from "./events";
import { drawName, formatName, poolFor, townName } from "./names";
import { createPeers, stepPeersYear } from "./peers";
import { clamp, createStreams, hashString, rngOf } from "./rng";
import { nbaTeam, offerBlocked, offseasonOffers } from "./routes";
import { currentLevel, generatePotentials, generateTraits, readiness, READINESS_LABEL, startingSkills } from "./skills";
import { FOCUS_BY_ID, focusAvailable, stepTraining } from "./training";
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type DecisionChoice,
  type FocusId,
  type HistoryEntry,
  type LifeState,
  type NewLifeOptions,
  type Offer,
  type PendingDecision,
  type Workload,
} from "./types";
import { country, PLAYABLE_COUNTRIES, WORLD_VERSION } from "./world";

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
  const parents = generateParents(gen);
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
    draft: { declaredYear: null, classSeed: null, result: null, withdrewYears: [] },
    rng: streams,
    counters: { entry: 0, decision: 0, offer: 0 },
    ended: null,
    keepPlaying: false,
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
  stepTraining(s);
  money(s);
  if (age >= 18 && s.achievements.nbaCaliber === null && currentLevel(s) >= 70) {
    s.achievements.nbaCaliber = s.ageMonths;
    log(s, "milestone", "Scouts would call this an NBA-level player now.", null, "good");
  }
  seasonStep(s);
  if (!s.pendingDecision) calendarStep(s);
  if (!s.pendingDecision) scheduledStep(s);
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
  const salary = s.placement.contract?.salary ?? 0;
  if (salary > 0) {
    const net = (salary / 12) * (s.flags.agent ? 0.95 : 1);
    s.earnings += net;
    s.family.savings += net * 0.35;
  }
}

/* --------------------------------------------------------------- seasons */

function seasonStep(s: LifeState) {
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
    if (s.flags.reviewSoon) {
      delete s.flags.reviewSoon;
      offseasonReview(s);
    }
    return;
  }
  if (!s.season) {
    s.placement.role = roleFor(performanceLevel(s), level.need);
    s.season = newSeason(s, level);
  }
  const n = gamesThisMonth(level.model.games, level.model.season.months, idx);
  const rng = rngOf(s.rng, "games");
  let minutes = 0;
  for (let g = 0; g < n; g++) {
    const box = simulateGame(s, level, rng, s.condition.injury ? 0 : undefined);
    addBox(s.season, box);
    s.lastGame = box;
    minutes += box.min;
    const score = box.pts + box.reb * 1.2 + box.ast * 1.5;
    const best = s.bestGame ? s.bestGame.pts + s.bestGame.reb * 1.2 + s.bestGame.ast * 1.5 : -1;
    if (box.min > 0 && score > best && s.ageMonths >= 96) s.bestGame = { ...box, label: `${level.label}, age ${Math.floor(s.ageMonths / 12)}` };
    if (s.placement.node === "nba" && box.min > 0) {
      s.nbaGames += 1;
      if (s.achievements.nbaDebut === null) recordDebut(s, `${s.placement.teamName}: ${box.min} minutes, ${box.pts} points.`);
    }
  }
  const share = n > 0 ? minutes / (n * level.model.minutesCap) : 0;
  const perf = clamp(0.6 + (performanceLevel(s) - level.need) / 30, 0.2, 1.6);
  s.exposure = clamp(s.exposure + (level.model.exposure / 100) * share * perf * 1.8 - 0.15, 0, 100);
  if (idx === level.model.season.months - 1) {
    finalizeSeason(s, level);
    if (!s.pendingDecision) offseasonReview(s);
  }
}

function finalizeSeason(s: LifeState, level: Level | null) {
  const season = s.season;
  if (!season) return;
  s.season = null;
  if (season.gp > 0 || season.wins + season.losses > 0) s.seasons.push(season);
  if (season.gp >= 5 && s.ageMonths >= 120) {
    const ppg = perGame(season, "pts");
    const rpg = perGame(season, "reb");
    const apg = perGame(season, "ast");
    const text = `Age ${season.ageYears}: ${ppg.toFixed(1)} pts, ${rpg.toFixed(1)} reb, ${apg.toFixed(1)} ast in ${season.levelLabel}`;
    const w = ((level?.model.exposure ?? 10) / 10) * clamp(0.4 + (ppg + rpg + apg) / 30, 0.3, 2);
    s.evidence.push({ month: s.ageMonths, text, weight: w });
    s.evidence = [...s.evidence].sort((a, b) => b.weight - a.weight).slice(0, 24);
    log(s, "season", `${season.levelLabel}${season.teamName ? ` (${season.teamName})` : ""}: ${season.gp} games, ${ppg.toFixed(1)} pts, ${rpg.toFixed(1)} reb, ${apg.toFixed(1)} ast. ${ROLE_LABEL[season.role]}.`, null, ppg >= 15 ? "good" : "neutral");
  }
  const c = s.placement.contract;
  if (c) {
    c.yearsLeft -= 1;
    if (c.yearsLeft <= 0 && s.placement.node === "nba") {
      if (performanceLevel(s) >= 68) {
        s.placement.contract = { salary: Math.max(1_270_000, c.salary), yearsLeft: 2, guaranteed: true };
        log(s, "info", `${s.placement.teamName} re-sign you for two more seasons.`, null, "good");
      } else {
        s.placement = { ...s.placement, node: "unattached", leagueId: null, teamName: null, role: "none", contract: null };
        s.flags.reviewSoon = true;
        log(s, "info", "Your NBA contract is up and no team re-signs you.", null, "bad");
      }
    } else if (c.yearsLeft <= 0) {
      s.placement.contract = null;
      log(s, "info", "Your contract is up.");
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
  const offers = offseasonOffers(s);
  if (!offers.length) return;
  s.offers = offers;
  const choices: DecisionChoice[] = offers.map((o) => ({ id: o.id, label: offerTitle(o), preview: `${ROLE_LABEL[o.role]}, ${o.minutesBand}. ${o.reason}`, disabled: offerBlocked(s, o) ?? undefined }));
  const stayLabel = s.placement.teamName ? `Stay with ${s.placement.teamName}` : s.placement.node === "playground" ? "Keep playing on the neighborhood courts" : "Keep training on your own";
  choices.push({ id: "stay", label: stayLabel, preview: "Nothing changes." });
  decide(s, { templateId: "offers", title: s.ageMonths < 18 * 12 ? "Next season" : "Offseason options", body: `Age ${Math.floor(s.ageMonths / 12)}. ${offers.length === 1 ? "One option is" : `${offers.length} options are`} on the table.`, choices, offers, required: true });
}

export function offerTitle(o: Offer): string {
  return o.node === "local-club" || o.node === "school-team" || o.node === "local-senior" ? o.teamName : `${o.teamName} · ${nodeLabel(o.node, o.countryId, o.leagueId)}`;
}

/* --------------------------------------------------------------- calendar */

function calendarStep(s: LifeState) {
  const { month, year } = calendar(s);
  const age = s.ageMonths / 12;
  if (age < 18) return;
  if (month === 4 && s.draft.declaredYear !== year && !s.draft.withdrewYears.includes(year)) {
    if (autoEligible(s, year)) {
      s.draft.declaredYear = year;
      log(s, "draft", `Automatically in the ${year} NBA Draft pool (game rule: age 22).`);
    } else if (canDeclare(s, year)) {
      const band = readiness(s);
      const worth = band === "draft-range" || band === "nba-ready" || band === "radar" || (age >= 20 && band === "pro-prospect");
      if (worth) {
        decide(s, {
          templateId: "draft-declare",
          title: `Declare for the ${year} NBA Draft?`,
          body: `Scouts put you at "${READINESS_LABEL[band]}". ${s.placement.node === "university" ? "College players can withdraw by late May and keep their eligibility (game rule)." : "Declaring is free; going undrafted makes you a free agent."}`,
          choices: [
            { id: "declare", label: "Declare", preview: "Enter the draft pool. Workouts and interviews follow." },
            { id: "wait", label: s.placement.node === "university" ? "Return to school" : "Wait a year", preview: "Develop another season first." },
          ],
          required: true,
        });
        return;
      }
    }
  }
  if (month === 5 && s.draft.declaredYear === year && s.placement.node === "university") {
    const rank = projectedRank(s, year);
    if (rank > 60) {
      s.draft.declaredYear = null;
      s.draft.withdrewYears.push(year);
      log(s, "draft", "You withdraw before the NCAA deadline and return to school. Teams projected you outside the top 60.");
    }
  }
  if (month === 6 && s.draft.declaredYear === year) {
    const res = runDraft(s, year);
    s.draft.result = { year, pick: res.pick, team: res.team };
    s.draft.declaredYear = null;
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
      choices.push({ id: "stay", label: "Keep your current path", preview: "Stay where you are. Offers come at the next window." });
      decide(s, { templateId: "undrafted", title: "Undrafted", body: "Plenty of NBA players went undrafted. These are your options.", choices, context: { team: teamFor(s, year) }, required: true });
    }
    return;
  }
  if (month === 10 && (s.flags.campOffer || s.flags.campDeal || s.flags.buyout) && s.placement.node !== "nba") {
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
    return;
  }
  if (s.placement.node === "g-league" && nbaSeasonMonth(s) && s.achievements.nbaDebut === null) {
    const rng = rngOf(s.rng, "draft");
    const roll = rng.next();
    const play = rng.next();
    if (roll < callUpChance(s)) {
      const team = s.placement.teamName?.replace(/ G League affiliate.*$/, "").replace(/^G League affiliate \((.*)\)$/, "$1") ?? "an NBA team";
      log(s, "milestone", `Called up by ${team.startsWith("an ") ? team : `the ${team}`} on a 10-day contract.`, null, "good");
      if (play < 0.8) {
        s.nbaGames += 1;
        recordDebut(s, `Called up from the G League, ${2 + Math.floor(play * 10)} minutes.`);
      }
    }
  }
}

function projectedRank(s: LifeState, year: number) {
  const v = draftValue(s);
  return draftClass(s.seed, year).filter((p) => p.value > v).length + 1;
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

function randomEvent(s: LifeState) {
  const rng = rngOf(s.rng, "events");
  const roll = rng.next();
  const pickU = rng.next();
  if (roll >= eventRate(s)) return;
  const pool = eligibleEvents(s);
  if (!pool.length) return;
  const total = pool.reduce((a, e) => a + e.weight(s), 0);
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
  if (s.achievements.nbaDebut === null && age >= 31) {
    s.ended = { month: s.ageMonths, reason: "aged-out" };
    log(s, "milestone", "At 31, the NBA window has closed. This life's basketball story ends here.");
  } else if (s.keepPlaying && age >= 36) {
    s.ended = { month: s.ageMonths, reason: "retired" };
    log(s, "milestone", "You retire at 36.");
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
    const out = c.apply({ s, rolls: d.rolls, entryId: decisionEntry });
    s.history.push({ id: decisionEntry, month: s.ageMonths, kind: "decision", text: `${t.title}: ${c.label}. ${out}`, causeId: (d.context?.causeId as string) ?? null, tone: t.tone ?? "neutral" });
    s.counters.entry = Math.max(s.counters.entry, Number(decisionEntry.slice(1)));
    if (c.follow) s.scheduled.push({ templateId: c.follow.id, month: s.ageMonths + c.follow.delay, causeId: decisionEntry });
    return;
  }
  switch (d.templateId) {
    case "offers": {
      if (choiceId === "stay") {
        log(s, "decision", `${choice.label}.`);
      } else {
        const offer = d.offers!.find((o) => o.id === choiceId)!;
        acceptOffer(s, offer);
      }
      s.offers = [];
      return;
    }
    case "draft-declare": {
      const { year } = calendar(s);
      if (choiceId === "declare") {
        s.draft.declaredYear = year;
        log(s, "draft", `Declared for the ${year} NBA Draft.`);
      } else {
        s.draft.withdrewYears.push(year);
        log(s, "decision", `Not declaring for the ${year} draft.`);
      }
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
      } else {
        log(s, "decision", "You stay on your current path.");
        if (s.placement.node === "unattached") s.flags.reviewSoon = true;
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

function acceptOffer(s: LifeState, o: Offer) {
  if (s.season) finalizeSeason(s, levelOf(s));
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

/* --------------------------------------------------------------- auto */

export const AUTO_STRATEGY = [
  "Life events: the option with the lowest injury and setback risk; ties go to the one that builds more, then to the first listed.",
  "Team offers: the highest level you can afford where the coach expects at least bench minutes. A move sideways needs clearly more scouting exposure. Otherwise, stay.",
  "Draft: declare when scouts rate you in draft range or NBA-ready, or on the NBA radar from age 21.",
  "After the draft: a two-way deal first, then a camp deal, then stay.",
  "After an NBA debut: finish the chapter.",
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
      const offers = (d.offers ?? []).filter((o) => !d.choices.find((c) => c.id === o.id)?.disabled && o.role !== "deep-bench");
      const curRank = NODE_RANK[s.placement.node] ?? 0;
      const best = offers
        .map((o) => ({ o, score: (NODE_RANK[o.node] ?? 0) * 10 + (levelOfOffer(o) ?? 0) / 10 + o.exposure / 50 }))
        .sort((a, b) => b.score - a.score)[0];
      if (!best) return "stay";
      const bestRank = NODE_RANK[best.o.node] ?? 0;
      if (bestRank > curRank) return best.o.id;
      const curExposure = levelOf(s)?.model.exposure ?? 0;
      if (bestRank === curRank && best.o.exposure >= curExposure + 10) return best.o.id;
      return "stay";
    }
    case "draft-declare": {
      const band = readiness(s);
      const age = s.ageMonths / 12;
      return band === "draft-range" || band === "nba-ready" || (age >= 21 && band === "radar") ? "declare" : "wait";
    }
    case "draft-after":
    case "undrafted":
      return open.find((c) => c.id === "two-way")?.id ?? open.find((c) => c.id === "camp")?.id ?? open.find((c) => c.id === "g-league")?.id ?? "stay";
    case "chapter":
      return "finish";
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

