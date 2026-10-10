/**
 * Fit and check the win probability model against NBA play-by-play.
 *
 *   npx tsx scripts/fit-win-probability.ts
 *
 * Samples the score every 15 seconds of game time in every cached game. Fits on
 * the 2023-24 and 2024-25 regular seasons (2022-23 only seeds carried-over
 * ratings), then scores the old and new models on 2025-26, which the fit never
 * saw, plus the 2024-25 and 2025-26 playoffs. Prints parameters to paste into
 * WIN_PROB_PARAMS.
 */
import { listSeasonGames, processGame } from "../drbl/index";
import {
  homeWinProbabilityFromState,
  nextBall,
  remainingSeconds,
  type BallSide,
  type WinProbParams,
} from "../src/lib/game-win-probability";

const STEP_SECONDS = 15;
const REGULATION = 2880;
const OLD: WinProbParams = { marginSd: 15, endSd: 0, homeCourt: 0, priorGames: 0, carryover: 0, ballValue: 0 };

type Side = { sum: number; homeN: number; awayN: number };
type GameRow = {
  season: string;
  playoffs: boolean;
  date: string;
  homeWin: boolean;
  /** Each team's games this season before this one, and last season in full. */
  home: { now: Side; prior: Side | null };
  away: { now: Side; prior: Side | null };
  /** [margin, seconds left] every STEP_SECONDS, tip-off first. */
  states: Array<[number, number]>;
  /** [margin, seconds left, ball] right after each scoring play, ball assumed to the other side. */
  scores: Array<[number, number, BallSide]>;
};

type Result = { date: string; home: string; away: string; hs: number; as: number };

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

const elapsedOf = (period: number, clockSec: number) =>
  period <= 4 ? (period - 1) * 720 + (720 - clockSec) : REGULATION + (period - 5) * 300 + (300 - clockSec);

async function loadSeason(season: string, playoffs: boolean) {
  const refs = await listSeasonGames(season, { seasonType: playoffs ? "Playoffs" : "Regular Season" });
  const games: Array<{ result: Result; states: GameRow["states"]; scores: GameRow["scores"] }> = [];
  for (const ref of refs) {
    try {
      const g = await processGame(ref, { persist: false });
      const m = g.meta;
      if (m.homeScore === m.awayScore) continue;
      const events = [...g.events].sort((a, b) => a.orderNumber - b.orderNumber);
      const lastPeriod = Math.max(4, ...events.map((e) => e.period));
      const end = elapsedOf(lastPeriod, 0);
      const states: Array<[number, number]> = [];
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
        const margin = e.scoreHome - e.scoreAway;
        if (margin === prev) continue;
        plays.push({ margin, period: e.period, clock: e.clockSeconds, homeScored: margin > prev });
        prev = margin;
      }
      const scores: GameRow["scores"] = plays.map((p, i) => [
        p.margin,
        remainingSeconds(p.period, p.clock),
        nextBall(p, plays[i + 1]),
      ]);
      games.push({
        result: { date: m.gameDate, home: m.homeTeamId, away: m.awayTeamId, hs: m.homeScore, as: m.awayScore },
        states,
        scores,
      });
    } catch {
      // quarantined or missing raw files are skipped
    }
  }
  return games;
}

function rows(
  season: string,
  playoffs: boolean,
  games: Awaited<ReturnType<typeof loadSeason>>,
  seasonResults: readonly Result[],
  priorResults: readonly Result[] | null
): GameRow[] {
  const prior = priorResults ? sideTotals(priorResults) : null;
  return games.map(({ result, states, scores }) => {
    const before = sideTotals(seasonResults.filter((r) => r.date < result.date));
    const pick = (team: string) => ({ now: before.get(team) ?? emptySide(), prior: prior?.get(team) ?? null });
    return {
      season,
      playoffs,
      date: result.date,
      homeWin: result.hs > result.as,
      home: pick(result.home),
      away: pick(result.away),
      states,
      scores,
    };
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

type Score = { logLoss: number; brier: number; n: number };

/** "clock" is the 15-second grid with the ball unknown; "plays" is right after each score, as the chart draws it. */
type SampleSet = "clock" | "plays";

const samples = (g: GameRow, set: SampleSet): Array<readonly [number, number, BallSide]> =>
  set === "clock" ? g.states.map(([m, r]) => [m, r, 0] as const) : g.scores;

function score(
  games: readonly GameRow[],
  p: WinProbParams,
  filter?: (remSec: number, i: number) => boolean,
  set: SampleSet = "clock"
): Score {
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

function goldenMin(f: (x: number) => number, lo: number, hi: number, iters = 40): number {
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

function fit(train: readonly GameRow[]): WinProbParams {
  const bounds: Record<keyof WinProbParams, [number, number]> = {
    marginSd: [8, 24],
    endSd: [0, 6],
    homeCourt: [-2, 6],
    priorGames: [0, 60],
    carryover: [0, 1],
    ballValue: [-1, 3],
  };
  let p: WinProbParams = {
    marginSd: 18,
    endSd: 1.6,
    homeCourt: 2,
    priorGames: 4,
    carryover: 1,
    ballValue: 0.35,
  };
  for (let round = 0; round < 4; round++) {
    for (const key of Object.keys(bounds) as Array<keyof WinProbParams>) {
      const [lo, hi] = bounds[key];
      const best = goldenMin((x) => score(train, { ...p, [key]: x }, undefined, "plays").logLoss, lo, hi, 30);
      p = { ...p, [key]: best };
    }
    console.log(`round ${round + 1}`, fmtParams(p), score(train, p, undefined, "plays").logLoss.toFixed(5));
  }
  const late = (rem: number) => rem <= 120;
  for (let round = 0; round < 3; round++) {
    for (const key of ["endSd", "ballValue"] as const) {
      const [lo, hi] = bounds[key];
      p = { ...p, [key]: goldenMin((x) => score(train, { ...p, [key]: x }, late, "plays").logLoss, lo, hi, 30) };
    }
    console.log(`late round ${round + 1}`, fmtParams(p), score(train, p, late, "plays").logLoss.toFixed(5));
  }
  return p;
}

const fmtParams = (p: WinProbParams) =>
  Object.entries(p)
    .map(([k, v]) => `${k}=${(v as number).toFixed(3)}`)
    .join(" ");

function report(label: string, games: readonly GameRow[], params: Record<string, WinProbParams>) {
  const phases: Array<[string, (rem: number, i: number) => boolean]> = [
    ["all states", () => true],
    ["tip-off", (_rem, i) => i === 0],
    ["1st half", (rem, i) => i > 0 && rem > 1440],
    ["3rd quarter", (rem) => rem <= 1440 && rem > 720],
    ["4th, 12-5 min", (rem, i) => i > 0 && rem <= 720 && rem > 300 && rem !== 300],
    ["last 5 min + OT", (rem, i) => i > 0 && rem <= 300],
  ];
  console.log(`\n${label}: ${games.length} games`);
  for (const set of ["clock", "plays"] as const) {
    console.log(`  ${set === "clock" ? "every 15 seconds" : "right after each score"}`);
    for (const [name, f] of phases) {
      if (set === "plays" && name === "tip-off") continue;
      const cells = Object.entries(params).map(([k, p]) => {
        const s = score(games, p, set === "plays" ? (rem) => f(rem, 1) : f, set);
        return `${k} logloss ${s.logLoss.toFixed(4)} brier ${s.brier.toFixed(4)}`;
      });
      console.log(`    ${name.padEnd(16)} ${cells.join(" | ")}`);
    }
  }
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
      `  ${k} calibration after scores (predicted -> actual):`,
      buckets
        .filter((b) => b.n > 0)
        .map((b) => `${Math.round((100 * b.q) / b.n)}->${Math.round((100 * b.y) / b.n)}`)
        .join(" ")
    );
  }
}

/** Leader's actual win rate vs the model in the last two minutes, by lead and time left. */
function lateTable(games: readonly GameRow[], params: Record<string, WinProbParams>) {
  const times: Array<[number, number]> = [
    [0, 10],
    [10, 30],
    [30, 60],
    [60, 120],
  ];
  console.log("\nlast two minutes, right after each score: leader wins (actual vs model)");
  for (const [lo, hi] of times) for (const leaderBall of [true, false]) {
    const cells: string[] = [];
    for (let lead = 1; lead <= 6; lead++) {
      const acc: Record<string, number> = {};
      let won = 0;
      let n = 0;
      for (const g of games) {
        for (const [margin, rem, ball] of g.scores) {
          if (rem <= lo || rem > hi || Math.abs(margin) !== lead) continue;
          if ((ball === Math.sign(margin)) !== leaderBall) continue;
          const sign = margin > 0 ? 1 : -1;
          won += (sign > 0) === g.homeWin ? 1 : 0;
          n += 1;
          for (const [k, p] of Object.entries(params)) {
            const q = homeWinProbabilityFromState(margin, rem, pregame(g, p), p, ball);
            acc[k] = (acc[k] ?? 0) + (sign > 0 ? q : 1 - q);
          }
        }
      }
      if (!n) continue;
      const model = Object.entries(acc)
        .map(([k, v]) => `${k} ${Math.round((100 * v) / n)}`)
        .join("/");
      cells.push(`+${lead}: ${Math.round((100 * won) / n)} (${model}) n=${n}`);
    }
    console.log(`  ${lo}-${hi}s ${leaderBall ? "leader ball" : "other ball "}  ${cells.join("  ")}`);
  }
}

async function main() {
  const seasons = ["2022-23", "2023-24", "2024-25", "2025-26"];
  const regular = new Map<string, Awaited<ReturnType<typeof loadSeason>>>();
  for (const s of seasons) {
    regular.set(s, await loadSeason(s, false));
    console.log(`${s}: ${regular.get(s)!.length} regular-season games`);
  }
  const results = (s: string) => regular.get(s)?.map((g) => g.result) ?? [];
  const seasonRows = (s: string, prev: string) => rows(s, false, regular.get(s)!, results(s), results(prev));

  const train = [...seasonRows("2023-24", "2022-23"), ...seasonRows("2024-25", "2023-24")];
  const test = seasonRows("2025-26", "2024-25");

  const fitted = fit(train);
  console.log("\nfitted", fmtParams(fitted));

  report("train 2023-24 + 2024-25 regular season", train, { old: OLD, noBall: { ...fitted, ballValue: 0 }, new: fitted });
  report("test 2025-26 regular season", test, { old: OLD, noBall: { ...fitted, ballValue: 0 }, new: fitted });
  lateTable(test, { old: OLD, new: fitted });

  const playoffRows: GameRow[] = [];
  for (const [s, prev] of [
    ["2024-25", "2023-24"],
    ["2025-26", "2024-25"],
  ] as const) {
    const games = await loadSeason(s, true);
    const seasonResults = [...results(s), ...games.map((g) => g.result)];
    playoffRows.push(...rows(s, true, games, seasonResults, results(prev)));
  }
  report("playoffs 2024-25 + 2025-26", playoffRows, { old: OLD, noBall: { ...fitted, ballValue: 0 }, new: fitted });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
