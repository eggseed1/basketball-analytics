/**
 * Which wins basis should contract projections use: WAR1, DRBL/100 mapped
 * onto WAR1, or a mix?
 *
 *   npx tsx scripts/study-contract-basis.ts
 *
 * For each target season T the contract model is fit only on seasons through
 * T−1, once per basis. Each player's projected next-season rate (base rate
 * plus aging, the same numbers the surplus model prices) becomes a rating.
 * Referees, none of which any basis was fit to:
 * - Scoreboard: on-court rating sums against every final margin of season T
 *   (10-fold CV fit, game bootstrap against the WAR1 basis). Needs
 *   data/drbl/normalized/{season}/ on disk.
 * - Team records: projected rate × actual possessions summed per roster
 *   against wins per 82 (ESPN standings).
 * Player-level errors against next-season WAR1 and DRBL/100 are reported too,
 * but each favors its own basis.
 *
 * Writes reports/contract-basis-study/latest.json. Manual only.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadNormalizedGame } from "../drbl/evaluation/m16c-dataset";
import { bootDelta, cvPredict, gameFeature, rmse, type OutcomeGame } from "../drbl/evaluation/outcome-test";
import { agingDelta, baseRate, seasonLabel, seasonStartYear, type SeasonLine } from "../src/contracts/value-model";
import { getCanonicalTeamFromProvider } from "../src/data/identity/team-map";
import { fitModel, loadInputs, type FitOptions } from "./lib/contract-value-fit";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports/contract-basis-study/latest.json");
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

type Variant = { name: string; options: FitOptions };
/**
 * The scoreboard refits scale per rating, so lower K can win there while
 * overspreading projected wins; the K rows show how much.
 */
const VARIANTS: Variant[] = [
  { name: "WAR1 only", options: { basis: "war1" } },
  { name: "Mix 25% DRBL", options: { basis: "drbl100", drblShare: 0.25, tuneOn: "war1" } },
  { name: "Mix 50% DRBL", options: { basis: "drbl100", drblShare: 0.5, tuneOn: "war1" } },
  { name: "Mix 75% DRBL", options: { basis: "drbl100", drblShare: 0.75, tuneOn: "war1" } },
  { name: "DRBL/100 only, tuned on WAR1", options: { basis: "drbl100", drblShare: 1, tuneOn: "war1" } },
  { name: "Mix 50%, tuned on basis", options: { basis: "drbl100", drblShare: 0.5, tuneOn: "basis" } },
  { name: "DRBL/100 only, tuned on basis", options: { basis: "drbl100", drblShare: 1, tuneOn: "basis" } },
  { name: "DRBL/100 only, [3,2,1] K15000 (shipped)", options: { basis: "drbl100", drblShare: 1, fixed: { weights: [3, 2, 1], K: 15000 } } },
  { name: "DRBL/100 only, [3,2,1] K2000", options: { basis: "drbl100", drblShare: 1, fixed: { weights: [3, 2, 1], K: 2000 } } },
  { name: "DRBL/100 only, [3,2,1] K500", options: { basis: "drbl100", drblShare: 1, fixed: { weights: [3, 2, 1], K: 500 } } },
  { name: "DRBL/100 only, [1] K500", options: { basis: "drbl100", drblShare: 1, fixed: { weights: [1], K: 500 } } },
];
const BASELINE = "WAR1 only";
const REFERENCES = ["Last season WAR1/100 (raw)", "Last season DRBL/100 (published)"];

const inputs = loadInputs();
const { histories, lineAt, shareFor, teamBySeason } = inputs;
const starts = inputs.seasons.map(seasonStartYear).sort((a, b) => a - b);

function ageAt(lines: SeasonLine[], year: number): number | null {
  let best: SeasonLine | null = null;
  for (const l of lines)
    if (l.age != null && seasonStartYear(l.season) <= year && (!best || seasonStartYear(l.season) > seasonStartYear(best.season)))
      best = l;
  return best ? best.age! + (year - seasonStartYear(best.season)) : null;
}

type Projection = { rate: Map<string, number>; exposure: Map<string, number> };

/** Per-possession projected rate for season t from seasons through t−1. */
function project(t: number, options: FitOptions): Projection & { weights: number[]; K: number } {
  const fit = fitModel(inputs, t - 1, options);
  const rate = new Map<string, number>();
  const exposure = new Map<string, number>();
  for (const [id, h] of histories) {
    const known = h.lines.filter((l) => seasonStartYear(l.season) <= t - 1);
    const base = baseRate(known, t - 1, fit.params, shareFor(id, t));
    if (!base) continue;
    const age = ageAt(known, t - 1);
    rate.set(id, base.rate + (age != null ? agingDelta(fit.params.aging, age) : 0));
    exposure.set(id, base.recentPossessions);
  }
  return { rate, exposure, weights: fit.best.weights, K: fit.best.K };
}

function lastSeason(t: number, pick: (l: SeasonLine) => number | null): Projection {
  const rate = new Map<string, number>();
  const exposure = new Map<string, number>();
  for (const [id] of histories) {
    const l = lineAt(id, t - 1);
    if (!l || l.possessions <= 0) continue;
    const v = pick(l);
    if (v == null || !Number.isFinite(v)) continue;
    rate.set(id, v);
    exposure.set(id, l.possessions);
  }
  return { rate, exposure };
}

async function loadSeason(season: string): Promise<OutcomeGame[] | null> {
  const dir = path.join(ROOT, "data/drbl/normalized", season);
  const ids = (await readdir(dir).catch(() => [] as string[])).filter((n) => /^\d{10}$/.test(n)).sort();
  if (ids.length < 500) return null;
  const games: OutcomeGame[] = [];
  for (const id of ids) {
    const g = await loadNormalizedGame(season, id);
    if (!g) continue;
    const poss = [];
    for (const p of g.possessions) {
      const off = p.offensePlayerIds.filter(Boolean).map(String);
      const def = p.defensePlayerIds.filter(Boolean).map(String);
      if (!off.length || !def.length) continue;
      poss.push({ offenseIsHome: p.offenseTeamId === g.box.homeTeamId, off, def, points: p.points });
    }
    games.push({
      gameId: g.box.gameId,
      date: g.box.gameDate || "",
      homeTeamId: g.box.homeTeamId,
      awayTeamId: g.box.awayTeamId,
      margin: Number(g.box.homeScore) - Number(g.box.awayScore),
      poss,
    });
  }
  return games;
}

type Standing = { season: string; team: string; abbr: string; wins: number; games: number };
async function fetchStandings(years: number[]): Promise<Standing[]> {
  const out: Standing[] = [];
  for (const start of years) {
    const res = await fetch(`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${start + 1}`);
    if (!res.ok) throw new Error(`standings ${start + 1}: ${res.status}`);
    const body = (await res.json()) as {
      children?: Array<{
        standings: { entries: Array<{ team: { id: string; abbreviation: string }; stats: Array<{ name: string; value?: number }> }> };
      }>;
    };
    for (const conf of body.children ?? [])
      for (const e of conf.standings.entries) {
        const stat = (n: string) => e.stats.find((s) => s.name === n)?.value ?? NaN;
        out.push({ season: seasonLabel(start), team: e.team.id, abbr: e.team.abbreviation, wins: stat("wins"), games: stat("wins") + stat("losses") });
      }
  }
  return out;
}

const r3 = (v: number) => Number(v.toFixed(3));
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
function wcorr(x: number[], y: number[], w: number[]): number {
  const W = w.reduce((s, v) => s + v, 0);
  const mx = x.reduce((s, v, i) => s + v * w[i]!, 0) / W;
  const my = y.reduce((s, v, i) => s + v * w[i]!, 0) / W;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  x.forEach((v, i) => {
    sxy += w[i]! * (v - mx) * (y[i]! - my);
    sxx += w[i]! * (v - mx) ** 2;
    syy += w[i]! * (y[i]! - my) ** 2;
  });
  return sxy / Math.sqrt(sxx * syy);
}

function scoreGames(features: Record<string, number[]>, y: number[]) {
  const sse0 = cvPredict([], y).reduce((s, v, i) => s + (v - y[i]!) ** 2, 0);
  const preds = Object.fromEntries(Object.entries(features).map(([k, x]) => [k, cvPredict([x], y)]));
  return Object.entries(preds).map(([name, pred]) => ({
    name,
    r2: r3(1 - pred.reduce((s, v, i) => s + (v - y[i]!) ** 2, 0) / sse0),
    rmse: r3(rmse(pred, y)),
    vsWar1: name === BASELINE ? null : bootDelta(pred, preds[BASELINE]!, y),
    vsMix50: name === "Mix 50% DRBL" ? null : bootDelta(pred, preds["Mix 50% DRBL"]!, y),
  }));
}

async function main() {
  const targets = starts.filter((t) => t - 1 >= starts[0]! + 1);
  log("targets", targets.map(seasonLabel).join(", "));
  const pooledY: number[] = [];
  const pooledX: Record<string, number[]> = {};
  const scoreboard: Array<{ season: string; games: number; results: ReturnType<typeof scoreGames> }> = [];
  const playerRows: Record<string, { war1: { se: number; n: number; x: number[]; y: number[]; w: number[] }; drbl: { x: number[]; y: number[]; w: number[] } }> = {};
  const teamRows: Array<{ season: string; abbr: string; wins82: number; proj: Record<string, number> }> = [];
  const tuned: Record<string, Record<string, { weights: number[]; K: number }>> = {};
  let standings: Standing[] | null = null;
  try {
    standings = await fetchStandings(targets);
  } catch (err) {
    log("team check skipped:", String(err));
  }

  for (const t of targets) {
    const season = seasonLabel(t);
    const projections: Record<string, Projection> = {};
    tuned[season] = {};
    for (const v of VARIANTS) {
      const p = project(t, v.options);
      projections[v.name] = p;
      tuned[season][v.name] = { weights: p.weights, K: p.K };
    }
    projections[REFERENCES[0]!] = lastSeason(t, (l) => l.war1 / l.possessions);
    projections[REFERENCES[1]!] = lastSeason(t, (l) => (l.drblWins == null ? null : l.drblWins / l.possessions));
    log(season, "fits", JSON.stringify(tuned[season]));

    // ---- Player level, players with 1000+ possessions in season t
    for (const [name, p] of Object.entries(projections)) {
      const row = (playerRows[name] ??= { war1: { se: 0, n: 0, x: [], y: [], w: [] }, drbl: { x: [], y: [], w: [] } });
      for (const [id, rate] of p.rate) {
        const actual = lineAt(id, t);
        if (!actual || actual.possessions < 1000) continue;
        row.war1.se += ((rate - actual.war1 / actual.possessions) * actual.possessions) ** 2;
        row.war1.n += 1;
        row.war1.x.push(rate);
        row.war1.y.push(actual.war1 / actual.possessions);
        row.war1.w.push(actual.possessions);
        if (actual.drblWins != null) {
          row.drbl.x.push(rate);
          row.drbl.y.push(actual.drblWins / actual.possessions);
          row.drbl.w.push(actual.possessions);
        }
      }
    }

    // ---- Team records
    const teams = teamBySeason.get(season);
    if (standings && teams) {
      const byTeam = new Map<string, Record<string, number>>();
      for (const [id, teamNba] of teams) {
        const line = lineAt(id, t);
        if (!line) continue;
        const agg = byTeam.get(teamNba) ?? {};
        for (const [name, p] of Object.entries(projections)) {
          agg[name] = (agg[name] ?? 0) + (p.rate.get(id) ?? 0) * line.possessions;
        }
        byTeam.set(teamNba, agg);
      }
      for (const [teamNba, proj] of byTeam) {
        const espn = getCanonicalTeamFromProvider("nba", teamNba)?.providerIds.espn;
        const rec = standings.find((s) => s.season === season && s.team === espn);
        if (rec) teamRows.push({ season, abbr: rec.abbr, wins82: (rec.wins / rec.games) * 82, proj });
      }
    }

    // ---- Scoreboard
    const games = await loadSeason(season);
    if (!games) {
      log(season, "no normalized games on disk; scoreboard skipped");
      continue;
    }
    const y = games.map((g) => g.margin);
    const features: Record<string, number[]> = {};
    for (const [name, p] of Object.entries(projections)) {
      const ratings = new Map([...p.rate].map(([id, r]) => [id, r * 100]));
      features[name] = gameFeature(games, ratings, p.exposure);
      (pooledX[name] ??= []).push(...features[name]);
    }
    pooledY.push(...y);
    const results = scoreGames(features, y);
    scoreboard.push({ season, games: games.length, results });
    log(season, games.length, "games", results.map((r) => `${r.name}: R² ${r.r2}`).join(" | "));
  }

  const pooled = pooledY.length ? scoreGames(pooledX, pooledY) : [];
  const players = Object.entries(playerRows).map(([name, r]) => ({
    name,
    n: r.war1.n,
    war1WinsRmse: r3(Math.sqrt(r.war1.se / r.war1.n)),
    corrNextWar1: r3(wcorr(r.war1.x, r.war1.y, r.war1.w)),
    corrNextDrbl: r3(wcorr(r.drbl.x, r.drbl.y, r.drbl.w)),
  }));
  const names = [...VARIANTS.map((v) => v.name), ...REFERENCES];
  const team = teamRows.length
    ? names.map((name) => {
        const xs = teamRows.map((r) => r.proj[name]!);
        const ys = teamRows.map((r) => r.wins82);
        const mx = mean(xs);
        const my = mean(ys);
        const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
        const resid = ys.map((v, i) => v - (my + slope * (xs[i]! - mx)));
        return { name, n: xs.length, r: r3(wcorr(xs, ys, xs.map(() => 1))), rmse: r3(Math.sqrt(mean(resid.map((e) => e * e)))) };
      })
    : null;

  await mkdir(path.dirname(OUT), { recursive: true });
  const report = { generatedAt: new Date().toISOString(), baseline: BASELINE, tuned, scoreboard, pooled, players, team };
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`);
  log("pooled", pooledY.length, "games");
  for (const r of pooled)
    log(
      r.name.padEnd(36),
      `R² ${r.r2}`,
      `RMSE ${r.rmse}`,
      r.vsWar1 ? `vs WAR1 ${r.vsWar1.delta.toFixed(3)} [${r.vsWar1.lo.toFixed(3)}, ${r.vsWar1.hi.toFixed(3)}] ${r.vsWar1.verdict}` : ""
    );
  for (const p of players) log("players", p.name.padEnd(36), JSON.stringify(p));
  for (const tm of team ?? []) log("team", tm.name.padEnd(36), JSON.stringify(tm));
  log("wrote", path.relative(ROOT, OUT));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
