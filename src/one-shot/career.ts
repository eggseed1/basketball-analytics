import { heightFraction } from "./body";
import { clamp, rngOf, type Rng } from "./rng";
import { currentLevel, position, playingLevel } from "./skills";
import type { BoxScore, LifeState, NodeKind, Placement, Role, SeasonLine, Stage } from "./types";
import { country, domesticProLeagues, localSeniorModel, maybeLeague, type LeagueModel } from "./world";

export function stageOf(ageMonths: number): Stage {
  const y = ageMonths / 12;
  return y < 6 ? "infancy" : y < 12 ? "childhood" : y < 18 ? "youth" : y < 25 ? "emerging" : "adult";
}

export const STAGE_LABEL: Record<Stage, string> = {
  infancy: "Infancy",
  childhood: "Childhood",
  youth: "Youth",
  emerging: "Emerging",
  adult: "Adult",
};

export function calendar(state: LifeState, ageMonths = state.ageMonths) {
  const idx = state.identity.birthMonthOfYear - 1 + ageMonths;
  return { month: (idx % 12) + 1, year: state.identity.birthYear + Math.floor(idx / 12) };
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Expected playing level of a decent player at this age (model). */
export function cohortLevel(ageYears: number): number {
  const t: [number, number][] = [[5, 3], [6, 4], [8, 8], [10, 17], [12, 27], [14, 36], [16, 42], [18, 46], [20, 49], [22, 51], [24, 52]];
  if (ageYears <= t[0]![0]) return t[0]![1];
  for (let i = 1; i < t.length; i++) {
    const [x1, y1] = t[i]!;
    const [x0, y0] = t[i - 1]!;
    if (ageYears <= x1) return y0 + ((y1 - y0) * (ageYears - x0)) / (x1 - x0);
  }
  return t[t.length - 1]![1];
}

const YOUTH_TIER: Partial<Record<NodeKind, number>> = {
  playground: 0.7,
  "school-team": 0.88,
  "local-club": 0.95,
  "elite-youth": 1.12,
  "us-high-school": 1.0,
};

const SOUTHERN = new Set(["AU", "NZ", "AR", "BR", "UY", "CL", "PY", "ZA", "NA", "BW"]);

export interface Level {
  label: string;
  need: number;
  model: LeagueModel;
  leagueId: string | null;
  youth: boolean;
}

/** Competition level of the current placement, or null when there is none. */
export function levelOf(state: LifeState, p: Placement = state.placement, ageYears = state.ageMonths / 12): Level | null {
  const tier = YOUTH_TIER[p.node];
  if (tier) {
    const c = country(p.countryId);
    const top = domesticProLeagues(p.countryId)[0];
    const start = top?.model?.season.startMonth ?? (SOUTHERN.has(c.id) ? 3 : 10);
    const games = p.node === "playground" ? 8 : p.node === "us-high-school" ? 26 : Math.round(clamp(ageYears * 1.6, 8, 30));
    return {
      label: p.node === "school-team" ? schoolLabel(p.countryId, ageYears) : nodeLabel(p.node, p.countryId, p.leagueId),
      need: cohortLevel(ageYears) * tier,
      model: { strength: 0, exposure: p.node === "elite-youth" ? 22 : p.node === "us-high-school" ? 30 : 8, coaching: p.coaching, salaryUsd: [0, 0], games, minutesCap: ageYears < 12 ? 24 : 32, season: { startMonth: start, months: 6 }, minAge: 6 },
      leagueId: null,
      youth: true,
    };
  }
  if (p.node === "home" || p.node === "unattached") return null;
  if (p.node === "local-senior") {
    const m = localSeniorModel();
    return { label: nodeLabel(p.node, p.countryId, null), need: m.strength * 0.8, model: m, leagueId: null, youth: false };
  }
  if (p.node === "university" && !p.leagueId) return null;
  const l = maybeLeague(p.leagueId);
  if (!l?.model) return null;
  return { label: l.name, need: l.model.strength * 0.8, model: l.model, leagueId: l.id, youth: false };
}

/** Where top clubs don't run the main youth pathway; school, prep and travel programs do. */
const NO_CLUB_ACADEMY = new Set(["US", "CA", "AU", "NZ", "PH", "PR"]);

export function eliteYouthLabel(countryId: string, leagueId: string | null): string {
  const l = maybeLeague(leagueId);
  return l && !NO_CLUB_ACADEMY.has(countryId) ? `${l.name} club youth team` : `Elite youth program, ${country(countryId).name}`;
}

const GRADE_SCHOOLS = new Set(["US", "CA", "PH", "PR", "GU", "VI", "AS", "MP"]);

/** School teams by age: mini-basketball, then middle school (or under-14), then high school (or under-18). */
export function schoolLabel(countryId: string, ageYears: number): string {
  const graded = GRADE_SCHOOLS.has(countryId);
  if (ageYears < 11) return "School mini-basketball";
  if (ageYears < 14) return graded ? "Middle school team" : "School team, under-14";
  return graded ? "High school team" : "School team, under-18";
}

export function hasClubAcademies(countryId: string): boolean {
  return !NO_CLUB_ACADEMY.has(countryId);
}

export function nodeLabel(node: NodeKind, countryId: string, leagueId: string | null): string {
  const c = country(countryId);
  const l = maybeLeague(leagueId);
  switch (node) {
    case "home":
      return "Home";
    case "playground":
      return "Neighborhood courts";
    case "school-team":
      return "School team";
    case "local-club":
      return `Local club, ${c.name}`;
    case "elite-youth":
      return eliteYouthLabel(countryId, l?.id ?? null);
    case "us-high-school":
      return "US high school varsity";
    case "university":
      return l ? l.name : "University basketball";
    case "local-senior":
      return `Senior club basketball, ${c.name}`;
    case "domestic-pro":
    case "foreign-pro":
      return l ? l.name : "Professional club";
    case "g-league":
      return "NBA G League";
    case "nba":
      return "NBA";
    case "unattached":
      return "Without a team";
  }
}

export function roleFor(level: number, need: number): Role {
  const d = level - need;
  return d >= 10 ? "star" : d >= 4 ? "starter" : d >= -3 ? "rotation" : d >= -9 ? "bench" : "deep-bench";
}

export const ROLE_LABEL: Record<Role, string> = {
  none: "No team",
  "deep-bench": "End of bench",
  bench: "Bench",
  rotation: "Rotation",
  starter: "Starter",
  star: "Go-to player",
};

const ROLE_MINUTES: Record<Role, number> = { none: 0, "deep-bench": 4, bench: 11, rotation: 20, starter: 28, star: 33 };

export function minutesBand(role: Role, cap: number): string {
  const m = Math.round((ROLE_MINUTES[role] * cap) / 36);
  return role === "none" ? "0" : `${Math.max(1, m - 4)}-${m + 4} min`;
}

/** Level used for performance, normalising children's height by age. */
export function performanceLevel(state: LifeState): number {
  const age = state.ageMonths / 12;
  if (age >= 19) return currentLevel(state);
  const eq = state.body.heightCm / heightFraction(state.ageMonths, 0);
  const injury = state.condition.injury ? 6 * state.condition.injury.severity : 0;
  return Math.max(0, playingLevel(state.skills, state.body, eq, clamp((age - 6) / 12, 0.35, 1)) - injury);
}

function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(rng.normal(lambda, Math.sqrt(lambda))));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L && k < 200);
  return k - 1;
}

function binomial(rng: Rng, n: number, p: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng.next() < p) k++;
  return k;
}

const OPPONENTS = ["Eastside", "Riverside", "Central", "Northgate", "Harbor", "Hillcrest", "Lakeview", "Westfield", "Southport", "Old Town", "Parkside", "Union"];

/** One game. Box score always reconciles: pts = 2(FGM - 3PM) + 3(3PM) + FTM. */
export function simulateGame(state: LifeState, level: Level, rng: Rng, minutesOverride?: number, roleOverride?: Role): BoxScore {
  const lvl = performanceLevel(state);
  const role = roleOverride ?? (state.placement.role === "none" ? roleFor(lvl, level.need) : state.placement.role);
  const s = state.skills;
  const fatigue = clamp(state.condition.energy / 100, 0.5, 1);
  const baseMin = minutesOverride ?? (ROLE_MINUTES[role] * level.model.minutesCap) / 36;
  const min = Math.max(0, Math.round(clamp(rng.normal(baseMin * (0.85 + 0.15 * fatigue), 3), 0, level.model.minutesCap + 4)));
  const diff = lvl - level.need;
  const eff = clamp(0.5 + diff / 40, 0.15, 0.92);
  const pos = position(state.body.heightCm, s);
  const m = min / 36;
  const fga36 = 7 + 9 * eff + (s.shooting + s.finishing + s.handle) / 70;
  const fga = poisson(rng, fga36 * m);
  const threeShare = clamp((s.shooting - 25) / 110 + (pos === "G" || pos === "W" ? 0.1 : -0.12), 0.02, 0.6);
  const tpa = binomial(rng, fga, threeShare);
  const twoPct = clamp(0.4 + (s.finishing - 50) / 260 + diff / 110, 0.3, 0.7);
  const threePct = clamp(0.28 + (s.shooting - 50) / 230 + diff / 220, 0.12, 0.46);
  const tpm = binomial(rng, tpa, threePct);
  const twoM = binomial(rng, fga - tpa, twoPct);
  const fta = poisson(rng, (1.5 + (s.finishing / 30) * eff + (pos === "C" ? 1 : 0)) * m);
  const ftm = binomial(rng, fta, clamp(0.5 + s.freeThrows / 260, 0.4, 0.93));
  const heightBoost = clamp((state.body.heightCm / heightFraction(state.ageMonths, 0) - 195) / 10, -1, 2);
  const reb = poisson(rng, (2.5 + s.rebounding / 14 + heightBoost * 1.5) * m);
  const ast = poisson(rng, (0.8 + s.passing / 17 + s.handle / 45) * m);
  const stl = poisson(rng, (0.4 + s.perimeterD / 70) * m);
  const blk = poisson(rng, (0.15 + (s.interiorD / 60) * clamp(1 + heightBoost * 0.5, 0.3, 2)) * m);
  const tov = poisson(rng, (1 + (s.handle + s.passing) / 120 - s.decisions / 150 + 0.6) * m * (0.6 + 0.4 * (1 - eff)));
  const fgm = twoM + tpm;
  const pts = 2 * twoM + 3 * tpm + ftm;
  const pace = level.youth ? clamp(25 + state.ageMonths / 12 * 3.2, 30, 75) : 82;
  const teamQuality = clamp(0.5 + (role === "star" ? 0.08 : role === "starter" ? 0.04 : 0) + diff / 200, 0.2, 0.8);
  const teamOther = Math.round(rng.normal(pace, pace * 0.1));
  const teamScore = Math.max(pts + 2, teamOther + Math.round(pts * 0.5));
  const oppScore = Math.max(10, Math.round(teamScore + rng.normal((0.5 - teamQuality) * 30, pace * 0.12)));
  return {
    month: state.ageMonths,
    opponent: rng.pick(OPPONENTS),
    min,
    pts,
    reb,
    ast,
    stl,
    blk,
    tov,
    fgm,
    fga,
    tpm,
    tpa,
    ftm,
    fta,
    teamScore,
    oppScore: oppScore === teamScore ? oppScore + 1 : oppScore,
  };
}

export function newSeason(state: LifeState, level: Level): SeasonLine {
  const { year } = calendar(state);
  const base = `${year}-${state.placement.node}-${state.placement.teamName ?? "none"}`;
  const taken = state.seasons.filter((x) => x.key === base || x.key.startsWith(`${base}#`)).length;
  return {
    key: taken ? `${base}#${taken + 1}` : base,
    ageYears: Math.floor(state.ageMonths / 12),
    calendarYear: year,
    node: state.placement.node,
    leagueId: level.leagueId,
    levelLabel: level.label,
    teamName: state.placement.teamName,
    countryId: state.placement.countryId,
    role: state.placement.role,
    gp: 0,
    min: 0,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    wins: 0,
    losses: 0,
    strength: level.need,
  };
}

export function addBox(season: SeasonLine, box: BoxScore) {
  if (box.min <= 0) {
    if (box.teamScore > box.oppScore) season.wins++;
    else season.losses++;
    return;
  }
  season.gp++;
  season.min += box.min;
  season.pts += box.pts;
  season.reb += box.reb;
  season.ast += box.ast;
  season.stl += box.stl;
  season.blk += box.blk;
  season.tov += box.tov;
  season.fgm += box.fgm;
  season.fga += box.fga;
  season.tpm += box.tpm;
  season.tpa += box.tpa;
  season.ftm += box.ftm;
  season.fta += box.fta;
  if (box.teamScore > box.oppScore) season.wins++;
  else season.losses++;
}

export const perGame = (season: SeasonLine, k: "pts" | "reb" | "ast" | "min" | "stl" | "blk" | "tov") => (season.gp ? season[k] / season.gp : 0);

export function gamesThisMonth(total: number, months: number, index: number): number {
  return Math.floor((total * (index + 1)) / months) - Math.floor((total * index) / months);
}

export function seasonMonthIndex(state: LifeState, level: Level): number | null {
  const { month } = calendar(state);
  const idx = (month - level.model.season.startMonth + 12) % 12;
  return idx < level.model.season.months ? idx : null;
}

export function streamGames(state: LifeState) {
  return rngOf(state.rng, "games");
}
