import data from "./data/nba-league.json";
import { gameScoreTotal, type StatLine } from "./stats";
import type { BoxScore, SeasonLine } from "./types";

/**
 * The real NBA season ONE SHOT measures him against: one Basketball Reference
 * per-game row per player (combined rows for players who changed teams).
 */
export interface RealLine {
  name: string;
  team: string;
  gp: number;
  gs: number;
  age: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  /** 1 rookie, 2 second-year player, 0 otherwise. */
  year: number;
}

type Raw = [string, string, ...number[]];

export const LEAGUE_SEASON: string = data.season;
export const LEAGUE_FIRST_SEASON: string = data.firstSeason;
export const REAL_AWARDS = data.awards as { mvp: string | null; dpoy: string | null; roy: string | null };
export const CALIBRATION = data.calibration as { seasons: number; allNba: [number, number]; mvpTop3: [number, number]; dpoyFirst: [number, number]; allDefTop10: [number, number]; royTopRookie: [number, number] };

export const REAL: RealLine[] = (data.rows as unknown as Raw[]).map(([name, team, gp, gs, age, min, pts, reb, ast, stl, blk, tov, fgm, fga, tpm, tpa, ftm, fta, year]) => ({
  name,
  team: /TM$/.test(team) ? `${team[0]} teams` : team,
  gp: gp!,
  gs: gs!,
  age: age!,
  min: min!,
  pts: pts!,
  reb: reb!,
  ast: ast!,
  stl: stl!,
  blk: blk!,
  tov: tov!,
  fgm: fgm!,
  fga: fga!,
  tpm: tpm!,
  tpa: tpa!,
  ftm: ftm!,
  fta: fta!,
  year: year!,
}));

/** Award eligibility since the 2023 CBA: 65 games. */
export const AWARD_GAMES = 65;
/** Per-game stat titles need 70% of an 82-game season. */
export const TITLE_GAMES = 58;
/** Players in the comparison pool: 20+ games. */
export const POOL_GAMES = 20;

export type PerGame = Omit<RealLine, "name" | "team" | "gs" | "age" | "year">;

export function perGameOf(l: Pick<StatLine, "gp" | "min" | "pts" | "reb" | "ast" | "stl" | "blk" | "tov" | "fgm" | "fga" | "tpm" | "tpa" | "ftm" | "fta">): PerGame {
  const g = Math.max(1, l.gp);
  return { gp: l.gp, min: l.min / g, pts: l.pts / g, reb: l.reb / g, ast: l.ast / g, stl: l.stl / g, blk: l.blk / g, tov: l.tov / g, fgm: l.fgm / g, fga: l.fga / g, tpm: l.tpm / g, tpa: l.tpa / g, ftm: l.ftm / g, fta: l.fta / g };
}

/** Same simplified Game Score as the stats tables, on per-game numbers. */
export const gameScore = (p: PerGame) => gameScoreTotal({ ...p, gp: 1 } as StatLine);
/** Box-score defense: steals, blocks and a little rebounding. Box scores miss most defense. */
export const defenseScore = (p: PerGame) => p.stl + p.blk + 0.15 * p.reb;
const ts = (p: PerGame) => (p.fga + 0.44 * p.fta > 0 ? p.pts / (2 * (p.fga + 0.44 * p.fta)) : null);

export interface Metric {
  key: string;
  label: string;
  short: string;
  get: (p: PerGame) => number | null;
  format: (v: number) => string;
  /** Extra filter on who counts, for rate stats. */
  pool?: (p: PerGame) => boolean;
}

const one = (v: number) => v.toFixed(1);

export const METRICS: Metric[] = [
  { key: "pts", label: "Points", short: "PTS", get: (p) => p.pts, format: one },
  { key: "reb", label: "Rebounds", short: "REB", get: (p) => p.reb, format: one },
  { key: "ast", label: "Assists", short: "AST", get: (p) => p.ast, format: one },
  { key: "stl", label: "Steals", short: "STL", get: (p) => p.stl, format: one },
  { key: "blk", label: "Blocks", short: "BLK", get: (p) => p.blk, format: one },
  { key: "tpm", label: "Threes made", short: "3PM", get: (p) => p.tpm, format: one },
  { key: "ts", label: "True shooting", short: "TS%", get: ts, format: (v) => `${(v * 100).toFixed(1)}%`, pool: (p) => p.fga >= 5 },
  { key: "min", label: "Minutes", short: "MIN", get: (p) => p.min, format: one },
  { key: "gmsc", label: "Game Score", short: "GmSc", get: gameScore, format: one },
];

const POOL = REAL.filter((r) => r.gp >= POOL_GAMES);
const AWARD_POOL = REAL.filter((r) => r.gp >= AWARD_GAMES);
const TITLE_POOL = REAL.filter((r) => r.gp >= TITLE_GAMES);

/** 1 + the number of pool players strictly ahead. */
function rankIn(pool: PerGame[], get: (p: PerGame) => number | null, v: number) {
  let ahead = 0;
  let of = 1;
  for (const r of pool) {
    const x = get(r);
    if (x === null) continue;
    of++;
    if (x > v) ahead++;
  }
  return { rank: ahead + 1, of };
}

export interface Standing {
  metric: Metric;
  value: number | null;
  rank: number | null;
  of: number;
  /** Share of the pool he is ahead of, 0 to 1. */
  pct: number | null;
  leader: RealLine | null;
}

/** Where his per-game line would rank among real players with 20+ games. */
export function standings(line: SeasonLine | StatLine): Standing[] {
  const p = perGameOf(line);
  return METRICS.map((metric) => {
    const pool = metric.pool ? POOL.filter(metric.pool) : POOL;
    const leader = [...pool].sort((a, b) => (metric.get(b) ?? -1) - (metric.get(a) ?? -1))[0] ?? null;
    const value = line.gp > 0 && (!metric.pool || metric.pool(p)) ? metric.get(p) : null;
    if (value === null) return { metric, value: null, rank: null, of: pool.length + 1, pct: null, leader };
    const { rank, of } = rankIn(pool, metric.get, value);
    return { metric, value, rank, of, pct: (of - rank) / Math.max(1, of - 1), leader };
  });
}

/** The real lines closest to his, by per-game box score scaled by how much each stat varies. */
export function closest(line: SeasonLine | StatLine, n = 3): RealLine[] {
  if (line.gp <= 0) return [];
  const p = perGameOf(line);
  const keys = ["pts", "reb", "ast", "stl", "blk", "tpm", "min"] as const;
  const sd = Object.fromEntries(keys.map((k) => [k, Math.max(0.1, spread(POOL.map((r) => r[k])))])) as Record<(typeof keys)[number], number>;
  return [...POOL]
    .map((r) => ({ r, d: keys.reduce((a, k) => a + ((r[k] - p[k]) / sd[k]) ** 2, 0) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.r);
}

function spread(xs: number[]) {
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

/* ------------------------------------------------------------ honors */

export interface HonorContext {
  role: SeasonLine["role"];
  rookie: boolean;
  winPct: number;
}

const scoreRank = (pool: RealLine[], v: number) => rankIn(pool, gameScore, v).rank;
const defRank = (pool: RealLine[], v: number) => rankIn(pool, defenseScore, v).rank;
const best = (pool: RealLine[], get: (r: RealLine) => number) => pool.reduce((a, r) => Math.max(a, get(r)), 0);

/** Season honors: his line placed among the real season's eligible players. Voting isn't simulated. */
export function nbaHonors(line: SeasonLine, ctx: HonorContext): string[] {
  const out: string[] = [];
  const p = perGameOf(line);
  const gs = gameScore(p);
  if (line.gp >= AWARD_GAMES) {
    const r = scoreRank(AWARD_POOL, gs);
    if ((r === 1 && ctx.winPct >= 0.55) || (r <= 3 && ctx.winPct >= 0.7)) out.push("NBA Most Valuable Player");
    if (r <= 5) out.push("All-NBA First Team");
    else if (r <= 10) out.push("All-NBA Second Team");
    else if (r <= 15) out.push("All-NBA Third Team");
    const d = defRank(AWARD_POOL, defenseScore(p));
    if (d === 1) out.push("Defensive Player of the Year");
    if (d <= 5) out.push("All-Defensive First Team");
    else if (d <= 10) out.push("All-Defensive Second Team");
    if (ctx.rookie) {
      const rookies = REAL.filter((x) => x.year === 1 && x.gp >= 40);
      const rr = scoreRank(rookies, gs);
      if (rr === 1) out.push("Rookie of the Year");
      if (rr <= 5) out.push("All-Rookie First Team");
      else if (rr <= 10) out.push("All-Rookie Second Team");
    }
    const bench = ctx.role !== "starter" && ctx.role !== "star";
    if (bench && p.pts > best(AWARD_POOL.filter((x) => x.gs <= x.gp * 0.2), (x) => x.pts)) out.push("Sixth Man of the Year");
  }
  if (line.gp >= TITLE_GAMES) {
    if (p.pts > best(TITLE_POOL, (x) => x.pts)) out.push("Scoring title");
    if (p.reb > best(TITLE_POOL, (x) => x.reb)) out.push("Rebounding title");
    if (p.ast > best(TITLE_POOL, (x) => x.ast)) out.push("Assists title");
    if (p.stl > best(TITLE_POOL, (x) => x.stl)) out.push("Steals title");
    if (p.blk > best(TITLE_POOL, (x) => x.blk)) out.push("Blocks title");
  }
  return out;
}

/** All-Star pick from the first half: about the top 26 by Game Score, starters about the top 10. */
export function allStarPick(line: SeasonLine): "starter" | "reserve" | null {
  if (line.gp < 20) return null;
  const r = scoreRank(POOL, gameScore(perGameOf(line)));
  return r <= 10 ? "starter" : r <= 26 ? "reserve" : null;
}

/** Rising Stars: first- and second-year players, about 21 of them. */
export function risingStar(line: SeasonLine): boolean {
  if (line.gp < 15) return false;
  return scoreRank(POOL.filter((x) => x.year > 0), gameScore(perGameOf(line))) <= 21;
}

/** Three-Point Contest field: about the top 12 in threes made, shooting 36% or better. */
export function threePointInvite(line: SeasonLine): boolean {
  if (line.gp < 20 || line.tpa < 60 || line.tpm / line.tpa < 0.36) return false;
  return rankIn(POOL, (x) => x.tpm, line.tpm / line.gp).rank <= 12;
}

/** Player or Rookie of the Month from one month of games (8+ played). */
export function monthHonor(boxes: BoxScore[], rookie: boolean): "player" | "rookie" | null {
  const played = boxes.filter((b) => b.min > 0);
  if (played.length < 8) return null;
  const sum = played.reduce<StatLine>((a, b) => ({ gp: a.gp + 1, min: a.min + b.min, pts: a.pts + b.pts, reb: a.reb + b.reb, ast: a.ast + b.ast, stl: a.stl + b.stl, blk: a.blk + b.blk, tov: a.tov + b.tov, fgm: a.fgm + b.fgm, fga: a.fga + b.fga, tpm: a.tpm + b.tpm, tpa: a.tpa + b.tpa, ftm: a.ftm + b.ftm, fta: a.fta + b.fta }), { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 });
  const gs = gameScore(perGameOf(sum));
  if (scoreRank(AWARD_POOL, gs) <= 3) return "player";
  if (rookie && scoreRank(REAL.filter((x) => x.year === 1 && x.gp >= 40), gs) === 1) return "rookie";
  return null;
}

export interface Race {
  id: string;
  label: string;
  /** What it takes, in plain words. */
  bar: string;
  /** Where he stands now. */
  now: string;
  status: "in" | "close" | "out";
}

/** Award races for the UI, from a season in progress or just finished. */
export function races(line: SeasonLine, ctx: HonorContext & { gamesLeft: number }): Race[] {
  if (line.gp <= 0) return [];
  const p = perGameOf(line);
  const gs = gameScore(p);
  const canReach = (need: number) => line.gp + ctx.gamesLeft >= need;
  const out: Race[] = [];
  const r = scoreRank(AWARD_POOL, gs);
  const gamesNote = line.gp >= AWARD_GAMES ? "" : canReach(AWARD_GAMES) ? ` ${AWARD_GAMES - line.gp} more games to qualify.` : ctx.gamesLeft > 0 ? ` Can't reach ${AWARD_GAMES} games.` : ` Short of ${AWARD_GAMES} games.`;
  const status = (rank: number, cut: number, closeCut: number, need = AWARD_GAMES): Race["status"] => (!canReach(need) ? "out" : rank <= cut ? "in" : rank <= closeCut ? "close" : "out");
  const all = scoreRank(POOL, gs);
  out.push({ id: "all-star", label: "All-Star", bar: "About the top 26 by Game Score at midseason.", now: `${ordinal(all)} of ${POOL.length + 1}.`, status: line.gp < 20 && ctx.gamesLeft <= 0 ? "out" : all <= 26 ? "in" : all <= 45 ? "close" : "out" });
  out.push({ id: "all-nba", label: "All-NBA", bar: `Top 15 by Game Score, ${AWARD_GAMES}+ games.`, now: `${ordinal(r)} of ${AWARD_POOL.length + 1}.${gamesNote}`, status: status(r, 15, 30) });
  out.push({ id: "mvp", label: "MVP", bar: "First by Game Score on a winning team.", now: `${ordinal(r)}, team ${Math.round(ctx.winPct * 100)}% wins.`, status: status(r, ctx.winPct >= 0.55 ? 1 : 0, 5) });
  const d = defRank(AWARD_POOL, defenseScore(p));
  out.push({ id: "all-def", label: "All-Defensive", bar: "Top 10 in steals, blocks and rebounding.", now: `${ordinal(d)}.${gamesNote}`, status: status(d, 10, 20) });
  if (ctx.rookie) {
    const rookies = REAL.filter((x) => x.year === 1 && x.gp >= 40);
    const rr = scoreRank(rookies, gs);
    out.push({ id: "roy", label: "Rookie of the Year", bar: `Best rookie by Game Score, ${AWARD_GAMES}+ games.`, now: `${ordinal(rr)} among ${rookies.length + 1} rookies.${gamesNote}`, status: status(rr, 1, 3) });
  }
  if (ctx.role !== "starter" && ctx.role !== "star") {
    const top = best(AWARD_POOL.filter((x) => x.gs <= x.gp * 0.2), (x) => x.pts);
    out.push({ id: "6moy", label: "Sixth Man", bar: `Off the bench, more than ${top.toFixed(1)} points a game.`, now: `${p.pts.toFixed(1)} points a game.${gamesNote}`, status: !canReach(AWARD_GAMES) ? "out" : p.pts > top ? "in" : p.pts > top * 0.75 ? "close" : "out" });
  }
  const lead = best(TITLE_POOL, (x) => x.pts);
  out.push({ id: "scoring", label: "Scoring title", bar: `More than ${lead.toFixed(1)} points a game, ${TITLE_GAMES}+ games.`, now: `${p.pts.toFixed(1)} points a game.`, status: !canReach(TITLE_GAMES) ? "out" : p.pts > lead ? "in" : p.pts > lead * 0.85 ? "close" : "out" });
  return out;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

/* ------------------------------------------------------------ teams */

const EAST = new Set(["Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets", "Chicago Bulls", "Cleveland Cavaliers", "Detroit Pistons", "Indiana Pacers", "Miami Heat", "Milwaukee Bucks", "New York Knicks", "Orlando Magic", "Philadelphia 76ers", "Toronto Raptors", "Washington Wizards"]);

export function conference(team: string | null): "Eastern" | "Western" {
  return team && EAST.has(team) ? "Eastern" : "Western";
}
