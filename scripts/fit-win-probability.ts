/**
 * Fit and check the win probability model against NBA play-by-play.
 *
 *   npx tsx scripts/fit-win-probability.ts            # report only
 *   npx tsx scripts/fit-win-probability.ts --write    # also update src/lib/win-prob-params.json
 *   npx tsx scripts/fit-win-probability.ts --test 2025-26
 *
 * The test season defaults to the newest one whose Finals are over. The fit uses
 * the two regular seasons before it (the season before those only seeds
 * carried-over ratings), then scores the current and new parameters on the test
 * season, which the fit never saw. --write only replaces the parameters when the
 * new ones score at least as well there.
 *
 * Games come from the NBA CDN by game id, so this never needs stats.nba.com.
 * Output is numbers only; no play text is printed.
 */
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { downloadCdnBoxScore } from "../drbl/download/cdn-client";
import { rawPath, readOrFetchJson } from "../drbl/download/disk-cache";
import { processGame } from "../drbl/index";
import type { DrblGameMeta } from "../drbl/types";
import {
  homeWinProbabilityFromState,
  nextBall,
  remainingSeconds,
  type BallSide,
  type WinProbParams,
} from "../src/lib/game-win-probability";

const PARAMS_FILE = path.join(process.cwd(), "src/lib/win-prob-params.json");
const STEP_SECONDS = 15;
const REGULATION = 2880;
const REGULAR_SEASON_GAMES = 1230;
/** Series per playoff round, first round to Finals. */
const PLAYOFF_SERIES = [8, 4, 2, 1];
const CONCURRENCY = 8;
/** Fewer finished regular-season games than this means the download is broken, not the season. */
const MIN_REGULAR_SEASON_GAMES = 1000;

type ParamsFile = {
  params: WinProbParams;
  fit: { trainSeasons: string[]; testSeason: string; testLogLoss: number; fittedAt: string };
};

type Side = { sum: number; homeN: number; awayN: number };
type GameRow = {
  date: string;
  homeWin: boolean;
  /** Each team's games this season before this one, and last season in full. */
  home: { now: Side; prior: Side | null };
  away: { now: Side; prior: Side | null };
  /** [margin, seconds left] every STEP_SECONDS, tip-off first. */
  states: Array<[number, number]>;
  /** [margin, seconds left, ball] right after each scoring play. */
  scores: Array<[number, number, BallSide]>;
};
type Result = { date: string; home: string; away: string; hs: number; as: number };
type LoadedGame = { result: Result; states: GameRow["states"]; scores: GameRow["scores"] };

const seasonLabel = (start: number) => `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
const seasonShift = (season: string, by: number) => seasonLabel(Number(season.slice(0, 4)) + by);

/** Newest season with the Finals over: from July on, the one that just ended. */
function latestFinishedSeason(now = new Date()): string {
  const year = now.getUTCFullYear();
  return seasonLabel(now.getUTCMonth() >= 6 ? year - 1 : year - 2);
}

function gameIds(season: string, playoffs: boolean): string[] {
  const yy = season.slice(2, 4);
  if (!playoffs) {
    return Array.from({ length: REGULAR_SEASON_GAMES }, (_, i) => `002${yy}0${String(i + 1).padStart(4, "0")}`);
  }
  const ids: string[] = [];
  PLAYOFF_SERIES.forEach((series, round) => {
    for (let s = 0; s < series; s++) for (let g = 1; g <= 7; g++) ids.push(`004${yy}00${round + 1}${s}${g}`);
  });
  return ids;
}

type CdnBox = {
  game?: {
    gameStatus?: number;
    gameEt?: string;
    gameTimeUTC?: string;
    homeTeam?: { teamId?: number | string; teamTricode?: string; score?: number };
    awayTeam?: { teamId?: number | string; teamTricode?: string; score?: number };
  };
};

/** Final-game metadata from the CDN box score; null for ids that were never played. */
async function metaFor(season: string, gameId: string): Promise<DrblGameMeta | null> {
  try {
    const { data } = await readOrFetchJson<CdnBox>(
      rawPath("games", gameId, "boxscore.json"),
      () => downloadCdnBoxScore(gameId) as Promise<CdnBox>,
      { endpoint: `cdn.nba.com/liveData/boxscore/boxscore_${gameId}.json` }
    );
    const g = data.game;
    const date = (g?.gameEt ?? g?.gameTimeUTC ?? "").slice(0, 10);
    if (!g?.homeTeam?.teamId || !g.awayTeam?.teamId || g.gameStatus !== 3 || !date) return null;
    return {
      gameId,
      season,
      gameDate: date,
      homeTeamId: String(g.homeTeam.teamId),
      awayTeamId: String(g.awayTeam.teamId),
      homeTeamTricode: g.homeTeam.teamTricode ?? "",
      awayTeamTricode: g.awayTeam.teamTricode ?? "",
      homeScore: Number(g.homeTeam.score ?? 0),
      awayScore: Number(g.awayTeam.score ?? 0),
      status: 3,
    };
  } catch {
    return null;
  }
}

async function mapPool<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    })
  );
  return out;
}

const elapsedOf = (period: number, clockSec: number) =>
  period <= 4 ? (period - 1) * 720 + (720 - clockSec) : REGULATION + (period - 5) * 300 + (300 - clockSec);

async function loadGame(season: string, gameId: string): Promise<LoadedGame | null> {
  const meta = await metaFor(season, gameId);
  if (!meta || meta.homeScore === meta.awayScore) return null;
  let events;
  try {
    events = [...(await processGame(meta, { persist: false })).events].sort((a, b) => a.orderNumber - b.orderNumber);
  } catch {
    return null;
  }
  const lastPeriod = Math.max(4, ...events.map((e) => e.period));
  const end = elapsedOf(lastPeriod, 0);
  const states: GameRow["states"] = [];
  let i = 0;
  let margin = 0;
  for (let t = 0; t < end; t += STEP_SECONDS) {
    while (i < events.length && elapsedOf(events[i]!.period, events[i]!.clockSeconds) <= t) {
      margin = events[i]!.scoreHome - events[i]!.scoreAway;
      i += 1;
    }
    const period = t < REGULATION ? Math.floor(t / 720) + 1 : 5 + Math.floor((t - REGULATION) / 300);
    const periodStart = period <= 4 ? (period - 1) * 720 : REGULATION + (period - 5) * 300;
    const periodLen = period <= 4 ? 720 : 300;
    states.push([margin, remainingSeconds(period, periodLen - (t - periodStart))]);
  }
  const plays: Array<{ margin: number; period: number; clock: number; homeScored: boolean }> = [];
  let prev = 0;
  for (const e of events) {
    const m = e.scoreHome - e.scoreAway;
    if (m === prev) continue;
    plays.push({ margin: m, period: e.period, clock: e.clockSeconds, homeScored: m > prev });
    prev = m;
  }
  return {
    result: { date: meta.gameDate, home: meta.homeTeamId, away: meta.awayTeamId, hs: meta.homeScore, as: meta.awayScore },
    states,
    scores: plays.map((p, k) => [p.margin, remainingSeconds(p.period, p.clock), nextBall(p, plays[k + 1])]),
  };
}

async function loadSeason(season: string, playoffs: boolean): Promise<LoadedGame[]> {
  const games = (await mapPool(gameIds(season, playoffs), CONCURRENCY, (id) => loadGame(season, id))).filter(
    (g): g is LoadedGame => g != null
  );
  console.log(`${season} ${playoffs ? "playoffs" : "regular season"}: ${games.length} games`);
  if (!playoffs && games.length < MIN_REGULAR_SEASON_GAMES) {
    throw new Error(`Only ${games.length} ${season} regular-season games loaded; refusing to fit on partial data.`);
  }
  return games;
}

const emptySide = (): Side => ({ sum: 0, homeN: 0, awayN: 0 });

function sideTotals(results: readonly Result[]): Map<string, Side> {
  const out = new Map<string, Side>();
  for (const r of results) {
    const h = out.get(r.home) ?? emptySide();
    h.sum += r.hs - r.as;
    h.homeN += 1;
    out.set(r.home, h);
    const a = out.get(r.away) ?? emptySide();
    a.sum += r.as - r.hs;
    a.awayN += 1;
    out.set(r.away, a);
  }
  return out;
}

function rows(games: readonly LoadedGame[], seasonResults: readonly Result[], priorResults: readonly Result[]): GameRow[] {
  const prior = sideTotals(priorResults);
  return games.map(({ result, states, scores }) => {
    const before = sideTotals(seasonResults.filter((r) => r.date < result.date));
    const pick = (team: string) => ({ now: before.get(team) ?? emptySide(), prior: prior.get(team) ?? null });
    return { date: result.date, homeWin: result.hs > result.as, home: pick(result.home), away: pick(result.away), states, scores };
  });
}

function rating(side: { now: Side; prior: Side | null }, p: WinProbParams): number {
  const adj = (s: Side) => s.sum - p.homeCourt * (s.homeN - s.awayN);
  const n = side.now.homeN + side.now.awayN;
  const pn = side.prior ? side.prior.homeN + side.prior.awayN : 0;
  const carried = side.prior && pn > 0 ? (adj(side.prior) / pn) * p.carryover : 0;
  const weight = side.prior ? p.priorGames : 0;
  const denom = n + weight;
  return denom > 0 ? (adj(side.now) + carried * weight) / denom : 0;
}

const pregame = (g: GameRow, p: WinProbParams) => p.homeCourt + rating(g.home, p) - rating(g.away, p);

/** "clock" is the 15-second grid with the ball unknown; "plays" is right after each score, as the chart draws it. */
type SampleSet = "clock" | "plays";

const samples = (g: GameRow, set: SampleSet): Array<readonly [number, number, BallSide]> =>
  set === "clock" ? g.states.map(([m, r]) => [m, r, 0] as const) : g.scores;

function score(
  games: readonly GameRow[],
  p: WinProbParams,
  filter?: (remSec: number, i: number) => boolean,
  set: SampleSet = "plays"
): { logLoss: number; brier: number; n: number } {
  let ll = 0;
  let br = 0;
  let n = 0;
  for (const g of games) {
    const mu = pregame(g, p);
    const y = g.homeWin ? 1 : 0;
    samples(g, set).forEach(([margin, rem, ball], i) => {
      if (filter && !filter(rem, i)) return;
      const q = Math.min(1 - 1e-6, Math.max(1e-6, homeWinProbabilityFromState(margin, rem, mu, p, ball)));
      ll -= y * Math.log(q) + (1 - y) * Math.log(1 - q);
      br += (q - y) ** 2;
      n += 1;
    });
  }
  return { logLoss: ll / n, brier: br / n, n };
}

function goldenMin(f: (x: number) => number, lo: number, hi: number, iters = 30): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

const BOUNDS: Record<keyof WinProbParams, [number, number]> = {
  marginSd: [8, 24],
  endSd: [0, 6],
  homeCourt: [-2, 6],
  priorGames: [0, 60],
  carryover: [0, 1],
  ballValue: [-1, 3],
};

function fit(train: readonly GameRow[], start: WinProbParams): WinProbParams {
  let p = { ...start };
  for (let round = 0; round < 4; round++) {
    for (const key of Object.keys(BOUNDS) as Array<keyof WinProbParams>) {
      const [lo, hi] = BOUNDS[key];
      p = { ...p, [key]: goldenMin((x) => score(train, { ...p, [key]: x }).logLoss, lo, hi) };
    }
    console.log(`round ${round + 1}`, fmtParams(p), score(train, p).logLoss.toFixed(5));
  }
  // Possession and late fouls only matter late, so tune them on the last two minutes.
  const late = (rem: number) => rem <= 120;
  for (let round = 0; round < 3; round++) {
    for (const key of ["endSd", "ballValue"] as const) {
      const [lo, hi] = BOUNDS[key];
      p = { ...p, [key]: goldenMin((x) => score(train, { ...p, [key]: x }, late).logLoss, lo, hi) };
    }
  }
  return p;
}

const round2 = (p: WinProbParams): WinProbParams =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round(v * 100) / 100])) as WinProbParams;

const fmtParams = (p: WinProbParams) =>
  Object.entries(p)
    .map(([k, v]) => `${k}=${v.toFixed(3)}`)
    .join(" ");

function report(label: string, games: readonly GameRow[], params: Record<string, WinProbParams>) {
  const phases: Array<[string, (rem: number) => boolean]> = [
    ["all", () => true],
    ["1st half", (rem) => rem > 1440],
    ["3rd quarter", (rem) => rem <= 1440 && rem > 720],
    ["4th, 12-5 min", (rem) => rem <= 720 && rem > 300],
    ["last 5 min + OT", (rem) => rem <= 300],
  ];
  console.log(`\n${label}: ${games.length} games, right after each score`);
  for (const [name, f] of phases) {
    const cells = Object.entries(params).map(([k, p]) => {
      const s = score(games, p, f);
      return `${k} logloss ${s.logLoss.toFixed(4)} brier ${s.brier.toFixed(4)}`;
    });
    console.log(`  ${name.padEnd(16)} ${cells.join(" | ")}`);
  }
  const tip = Object.entries(params).map(([k, p]) => `${k} ${score(games, p, (_r, i) => i === 0, "clock").logLoss.toFixed(4)}`);
  console.log(`  ${"tip-off".padEnd(16)} logloss ${tip.join(" | ")}`);
  for (const [k, p] of Object.entries(params)) {
    const buckets = Array.from({ length: 10 }, () => ({ q: 0, y: 0, n: 0 }));
    for (const g of games) {
      const mu = pregame(g, p);
      for (const [margin, rem, ball] of g.scores) {
        const q = homeWinProbabilityFromState(margin, rem, mu, p, ball);
        const b = buckets[Math.min(9, Math.floor(q * 10))]!;
        b.q += q;
        b.y += g.homeWin ? 1 : 0;
        b.n += 1;
      }
    }
    console.log(
      `  ${k} calibration (predicted -> actual):`,
      buckets
        .filter((b) => b.n > 0)
        .map((b) => `${Math.round((100 * b.q) / b.n)}->${Math.round((100 * b.y) / b.n)}`)
        .join(" ")
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const testFlag = args.indexOf("--test");
  const test = testFlag >= 0 ? args[testFlag + 1]! : latestFinishedSeason();
  const trainSeasons = [seasonShift(test, -2), seasonShift(test, -1)];
  const seed = seasonShift(test, -3);
  console.log(`fit on ${trainSeasons.join(" + ")} (ratings seeded from ${seed}), test on ${test}`);

  const current = JSON.parse(await readFile(PARAMS_FILE, "utf8")) as ParamsFile;

  const regular = new Map<string, LoadedGame[]>();
  for (const s of [seed, ...trainSeasons, test]) regular.set(s, await loadSeason(s, false));
  const results = (s: string) => regular.get(s)!.map((g) => g.result);
  const seasonRows = (s: string) => rows(regular.get(s)!, results(s), results(seasonShift(s, -1)));

  const train = trainSeasons.flatMap(seasonRows);
  const testRows = seasonRows(test);

  const fitted = round2(fit(train, current.params));
  console.log("\nfitted", fmtParams(fitted));
  const models = { current: current.params, new: fitted };

  report(`train ${trainSeasons.join(" + ")}`, train, models);
  report(`test ${test}`, testRows, models);

  const playoffs = await loadSeason(test, true);
  report(`${test} playoffs`, rows(playoffs, [...results(test), ...playoffs.map((g) => g.result)], results(seasonShift(test, -1))), models);

  const before = score(testRows, current.params).logLoss;
  const after = score(testRows, fitted).logLoss;
  const unchanged = JSON.stringify(fitted) === JSON.stringify(current.params);
  const better = after <= before;
  const verdict = unchanged
    ? "Parameters unchanged."
    : better
      ? `New parameters score ${after.toFixed(4)} on ${test} vs ${before.toFixed(4)} for the current ones.`
      : `Kept current parameters: new ones score ${after.toFixed(4)} on ${test}, current ${before.toFixed(4)}.`;
  console.log(`\n${verdict}`);

  if (write && better && !unchanged) {
    const next: ParamsFile = {
      params: fitted,
      fit: {
        trainSeasons,
        testSeason: test,
        testLogLoss: Math.round(after * 10000) / 10000,
        fittedAt: new Date().toISOString().slice(0, 10),
      },
    };
    await writeFile(PARAMS_FILE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), PARAMS_FILE)}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "### Win probability refit",
        "",
        `- fit on ${trainSeasons.join(" + ")}, tested on ${test}`,
        `- current: \`${fmtParams(current.params)}\``,
        `- new: \`${fmtParams(fitted)}\``,
        `- ${verdict}`,
        "",
      ].join("\n")
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
