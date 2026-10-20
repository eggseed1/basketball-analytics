/**
 * Backtest Franchise Lab against a finished NBA season.
 * Loads that season's real rosters/stats, sims the regular season, compares
 * win totals and conference ranks to the real final table.
 *
 * Run: npx tsx scripts/diag-gm-season-backtest.ts
 * Env: SEASON=2025-26 SEEDS=3
 * Out-of-sample forecast (ratings from prior year only):
 *   SEASON=2025-26 STATS_SEASON=2024-25 SEEDS=3
 */
import { stepDay } from "../src/gm/engine/pace";
import { sortedStandings } from "../src/gm/engine/standings";
import { createRealSeasonLeague } from "../src/gm/seed/create-real-season-league";
import { FRANCHISES } from "../src/gm/seed/franchises";
import type { GmLeagueState } from "../src/gm/types";

const SEASON = process.env.SEASON ?? "2025-26";
const STATS_SEASON = process.env.STATS_SEASON?.trim() || undefined;
const SEEDS = Math.max(1, Number(process.env.SEEDS ?? 3));

/** Final 2025-26 regular-season records (Basketball-Reference). */
const ACTUAL_2025_26: Record<string, { w: number; l: number }> = {
  det: { w: 60, l: 22 },
  bos: { w: 56, l: 26 },
  nyk: { w: 53, l: 29 },
  cle: { w: 52, l: 30 },
  tor: { w: 46, l: 36 },
  atl: { w: 46, l: 36 },
  phi: { w: 45, l: 37 },
  orl: { w: 45, l: 37 },
  cha: { w: 44, l: 38 },
  mia: { w: 43, l: 39 },
  mil: { w: 32, l: 50 },
  chi: { w: 31, l: 51 },
  bkn: { w: 20, l: 62 },
  ind: { w: 19, l: 63 },
  was: { w: 17, l: 65 },
  okc: { w: 64, l: 18 },
  sas: { w: 62, l: 20 },
  den: { w: 54, l: 28 },
  lal: { w: 53, l: 29 },
  hou: { w: 52, l: 30 },
  min: { w: 49, l: 33 },
  phx: { w: 45, l: 37 },
  por: { w: 42, l: 40 },
  lac: { w: 42, l: 40 },
  gsw: { w: 37, l: 45 },
  nop: { w: 26, l: 56 },
  dal: { w: 26, l: 56 },
  mem: { w: 25, l: 57 },
  sac: { w: 22, l: 60 },
  uta: { w: 22, l: 60 },
};

function actualTable(season: string): Record<string, { w: number; l: number }> {
  if (season === "2025-26") return ACTUAL_2025_26;
  throw new Error(`No actual standings table for ${season}`);
}

function simRegular(league: GmLeagueState): GmLeagueState {
  let next = league;
  let guard = 0;
  while (next.phase === "regular" && guard < 400) {
    guard += 1;
    const stepped = stepDay(next);
    next = stepped.league;
    if (stepped.seasonOver) break;
  }
  return next;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : 0;
}

function rankMap(winsById: Record<string, number>, conf: "East" | "West"): Map<string, number> {
  const ids = FRANCHISES.filter((f) => f.conference === conf).map((f) => f.id);
  const ordered = [...ids].sort(
    (a, b) => (winsById[b] ?? 0) - (winsById[a] ?? 0) || a.localeCompare(b)
  );
  const ranks = new Map<string, number>();
  ordered.forEach((id, i) => ranks.set(id, i + 1));
  return ranks;
}

type RunRow = {
  id: string;
  abbr: string;
  conf: "East" | "West";
  actualW: number;
  simW: number;
  err: number;
};

async function oneSeed(seed: number, actual: Record<string, { w: number; l: number }>) {
  const t0 = Date.now();
  const { league: start, seasonCanonical } = await createRealSeasonLeague({
    userTeamId: "bos",
    season: SEASON,
    seed,
    statsSeason: STATS_SEASON,
  });
  const playedBefore = start.schedule.filter((g) => g.played).length;
  const league = simRegular(start);
  const played = league.schedule.filter((g) => !g.exhibition && g.played).length;
  const total = league.schedule.filter((g) => !g.exhibition).length;
  const rows: RunRow[] = FRANCHISES.map((f) => {
    const simW = league.standings[f.id]?.wins ?? 0;
    const actualW = actual[f.id]?.w ?? 0;
    return {
      id: f.id,
      abbr: f.abbr,
      conf: f.conference,
      actualW,
      simW,
      err: simW - actualW,
    };
  });
  const abs = rows.map((r) => Math.abs(r.err));
  const sq = rows.map((r) => r.err * r.err);
  const simWins = rows.map((r) => r.simW);
  const actWins = rows.map((r) => r.actualW);
  const eastAct = rankMap(Object.fromEntries(rows.map((r) => [r.id, r.actualW])), "East");
  const westAct = rankMap(Object.fromEntries(rows.map((r) => [r.id, r.actualW])), "West");
  const eastSim = rankMap(Object.fromEntries(rows.map((r) => [r.id, r.simW])), "East");
  const westSim = rankMap(Object.fromEntries(rows.map((r) => [r.id, r.simW])), "West");
  const rankErrs = rows.map((r) => {
    const act = r.conf === "East" ? eastAct.get(r.id)! : westAct.get(r.id)!;
    const sim = r.conf === "East" ? eastSim.get(r.id)! : westSim.get(r.id)!;
    return Math.abs(act - sim);
  });
  const playoffHit = rows.filter((r) => {
    const act = r.conf === "East" ? eastAct.get(r.id)! : westAct.get(r.id)!;
    const sim = r.conf === "East" ? eastSim.get(r.id)! : westSim.get(r.id)!;
    return (act <= 10) === (sim <= 10);
  }).length;
  const top4Hit = rows.filter((r) => {
    const act = r.conf === "East" ? eastAct.get(r.id)! : westAct.get(r.id)!;
    const sim = r.conf === "East" ? eastSim.get(r.id)! : westSim.get(r.id)!;
    return (act <= 4) === (sim <= 4);
  }).length;

  const eastTable = sortedStandings(league.standings, "East", league.teams);
  const westTable = sortedStandings(league.standings, "West", league.teams);

  return {
    seed,
    seasonCanonical,
    ms: Date.now() - t0,
    playedBefore,
    played,
    total,
    mae: mean(abs),
    rmse: Math.sqrt(mean(sq)),
    corr: pearson(simWins, actWins),
    rankMae: mean(rankErrs),
    playoffHit,
    top4Hit,
    rows,
    eastTop: eastTable.slice(0, 8).map((r) => {
      const f = FRANCHISES.find((x) => x.id === r.teamId);
      return `${f?.abbr ?? r.teamId} ${r.wins}-${r.losses}`;
    }),
    westTop: westTable.slice(0, 8).map((r) => {
      const f = FRANCHISES.find((x) => x.id === r.teamId);
      return `${f?.abbr ?? r.teamId} ${r.wins}-${r.losses}`;
    }),
  };
}

async function main() {
  const actual = actualTable(SEASON);
  const mode = STATS_SEASON
    ? `forecast ${SEASON} from ${STATS_SEASON} ratings`
    : `in-sample ${SEASON}`;
  console.log(`Backtest ${mode} × ${SEEDS} seed(s)…`);
  const runs = [];
  for (let i = 0; i < SEEDS; i++) {
    const seed = 1000 + i * 17;
    process.stdout.write(`  seed ${seed}… `);
    const run = await oneSeed(seed, actual);
    console.log(
      `done in ${(run.ms / 1000).toFixed(1)}s  MAE ${run.mae.toFixed(1)}  corr ${run.corr.toFixed(3)}  games ${run.played}/${run.total}`
    );
    runs.push(run);
  }

  const avgMae = mean(runs.map((r) => r.mae));
  const avgRmse = mean(runs.map((r) => r.rmse));
  const avgCorr = mean(runs.map((r) => r.corr));
  const avgRank = mean(runs.map((r) => r.rankMae));
  const avgPlayoff = mean(runs.map((r) => r.playoffHit));
  const avgTop4 = mean(runs.map((r) => r.top4Hit));

  // Mean sim wins across seeds per team.
  const byTeam = FRANCHISES.map((f) => {
    const sims = runs.map((r) => r.rows.find((row) => row.id === f.id)!.simW);
    const actualW = actual[f.id]!.w;
    const simMean = mean(sims);
    return {
      abbr: f.abbr,
      conf: f.conference,
      actualW,
      simMean,
      err: simMean - actualW,
    };
  }).sort((a, b) => Math.abs(b.err) - Math.abs(a.err));

  console.log("\n=== Summary vs real", SEASON, "===");
  console.log({
    seeds: SEEDS,
    maeWins: Number(avgMae.toFixed(2)),
    rmseWins: Number(avgRmse.toFixed(2)),
    winCorr: Number(avgCorr.toFixed(3)),
    confRankMae: Number(avgRank.toFixed(2)),
    playoffBerthHits: `${avgPlayoff.toFixed(1)} / 30`,
    top4Hits: `${avgTop4.toFixed(1)} / 30`,
  });

  console.log("\nBiggest miss (mean sim − actual wins):");
  for (const row of byTeam.slice(0, 10)) {
    console.log(
      `  ${row.abbr.padEnd(3)} actual ${String(row.actualW).padStart(2)}  sim ${row.simMean.toFixed(1).padStart(5)}  err ${row.err >= 0 ? "+" : ""}${row.err.toFixed(1)}`
    );
  }

  console.log("\nClosest teams:");
  for (const row of [...byTeam].sort((a, b) => Math.abs(a.err) - Math.abs(b.err)).slice(0, 8)) {
    console.log(
      `  ${row.abbr.padEnd(3)} actual ${String(row.actualW).padStart(2)}  sim ${row.simMean.toFixed(1).padStart(5)}  err ${row.err >= 0 ? "+" : ""}${row.err.toFixed(1)}`
    );
  }

  const last = runs[runs.length - 1]!;
  console.log("\nSample sim East top 8:", last.eastTop.join(" · "));
  console.log("Sample sim West top 8:", last.westTop.join(" · "));
  console.log(
    "Real East top 8: DET 60 · BOS 56 · NYK 53 · CLE 52 · TOR 46 · ATL 46 · PHI 45 · ORL 45"
  );
  console.log(
    "Real West top 8: OKC 64 · SAS 62 · DEN 54 · LAL 53 · HOU 52 · MIN 49 · PHX 45 · POR 42"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
