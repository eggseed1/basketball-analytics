/**
 * Out-of-sample check of the contract surplus model.
 *
 * For each past season A, refit the model on seasons through A only, then
 * value the salaries each player was actually paid over the next one to three
 * seasons. Compare with what he delivered: realized worth uses the same
 * replacement level and price per win, so misses come from the projection.
 *
 * Team check: preseason projected DRBL wins per roster against real records
 * (ESPN standings, fetched at run time).
 *
 * Run: npx tsx scripts/eval-contract-value.ts [--out /tmp/contract-value-eval.json]
 */
import { writeFileSync } from "node:fs";

import { getCanonicalTeamFromProvider } from "../src/data/identity/team-map";
import { baseRate, projectSeasons, seasonLabel, seasonStartYear } from "../src/contracts/value-model";
import { fitModel, loadInputs, type FittedModel } from "./lib/contract-value-fit";
import {
  corr,
  M,
  mean,
  evaluateAnchor,
  outOfSample,
  r3,
  rmse,
  spearman,
  summarize as summarizeAt,
  type ContractRow,
  type YearRow,
} from "./lib/contract-value-eval";

const outArg = process.argv.indexOf("--out");
const outPath = outArg > 0 ? process.argv[outArg + 1] : "/tmp/contract-value-eval.json";

const inputs = loadInputs();
const { seasons, histories, salaryBySeason, teamBySeason, capFor, lineAt, shareFor } = inputs;
const starts = seasons.map(seasonStartYear);
const salariedStarts = starts.filter((y) => salaryBySeason.has(seasonLabel(y)) && capFor(y));
const lastSalaried = Math.max(...salariedStarts);
const firstStart = starts[0];
const lastStart = starts[starts.length - 1];
/** Report dollars at the 2026-27 cap so seasons compare. */
const TODAY_CAP = 164_961_000;

const summarize = (rows: YearRow[]) => summarizeAt(rows, TODAY_CAP);

const ageAt = (id: string, year: number): number | null => {
  const lines = histories.get(id)?.lines ?? [];
  const known = [...lines].reverse().find((l) => l.age != null && seasonStartYear(l.season) <= year);
  return known?.age != null ? known.age + (year - seasonStartYear(known.season)) : null;
};

function tailHits(rows: YearRow[], key: "predSurplus" | "carry") {
  const val = (r: YearRow) => (key === "carry" ? r.carryWorth - r.share * TODAY_CAP : r.predSurplus);
  const byGroup = new Map<string, YearRow[]>();
  for (const r of rows) {
    const k = `${r.anchor}:${r.horizon}`;
    byGroup.set(k, [...(byGroup.get(k) ?? []), r]);
  }
  let topHit = 0;
  let topN = 0;
  let botHit = 0;
  let botN = 0;
  for (const group of byGroup.values()) {
    const realSorted = [...group].sort((a, b) => a.realSurplus - b.realSurplus);
    const q25 = realSorted[Math.floor(group.length * 0.25)].realSurplus;
    const q75 = realSorted[Math.floor(group.length * 0.75)].realSurplus;
    const predSorted = [...group].sort((a, b) => val(a) - val(b));
    const k = Math.max(1, Math.floor(group.length * 0.1));
    for (const r of predSorted.slice(-k)) {
      topN += 1;
      if (r.realSurplus >= q75) topHit += 1;
    }
    for (const r of predSorted.slice(0, k)) {
      botN += 1;
      if (r.realSurplus <= q25) botHit += 1;
    }
  }
  return { topToTopQuarter: r3(topHit / topN), bottomToBottomQuarter: r3(botHit / botN), n: topN };
}

function bucket<T>(rows: YearRow[], label: (r: YearRow) => T, order: T[]) {
  return order.map((b) => {
    const group = rows.filter((r) => label(r) === b);
    return {
      bucket: b,
      n: group.length,
      salary: M(mean(group.map((r) => r.share * TODAY_CAP))),
      pred: M(mean(group.map((r) => r.predSurplus))),
      real: M(mean(group.map((r) => r.realSurplus))),
      missedSeason: r3(mean(group.map((r) => (r.played ? 0 : 1)))),
    };
  });
}

function deciles(rows: YearRow[]) {
  const sorted = [...rows].sort((a, b) => a.predSurplus - b.predSurplus);
  return Array.from({ length: 10 }, (_, d) => {
    const group = sorted.slice(Math.floor((d * sorted.length) / 10), Math.floor(((d + 1) * sorted.length) / 10));
    return {
      decile: d + 1,
      n: group.length,
      pred: M(mean(group.map((r) => r.predSurplus))),
      real: M(mean(group.map((r) => r.realSurplus))),
    };
  });
}

// ---- Team check
type TeamSeason = { season: string; team: string; abbr: string; wins: number; games: number };
async function fetchStandings(): Promise<TeamSeason[]> {
  const out: TeamSeason[] = [];
  for (const start of starts) {
    const res = await fetch(
      `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${start + 1}`
    );
    if (!res.ok) throw new Error(`standings ${start + 1}: ${res.status}`);
    const body = (await res.json()) as {
      children?: Array<{
        standings: {
          entries: Array<{
            team: { id: string; abbreviation: string };
            stats: Array<{ name: string; value?: number }>;
          }>;
        };
      }>;
    };
    for (const conf of body.children ?? []) {
      for (const e of conf.standings.entries) {
        const stat = (n: string) => e.stats.find((s) => s.name === n)?.value ?? NaN;
        out.push({
          season: seasonLabel(start),
          team: e.team.id,
          abbr: e.team.abbreviation,
          wins: stat("wins"),
          games: stat("wins") + stat("losses"),
        });
      }
    }
  }
  return out;
}

function teamCheck(standings: TeamSeason[], fits: Map<number, FittedModel>) {
  const rows: Array<{
    season: string;
    abbr: string;
    wins82: number;
    lastWins82: number | null;
    actualWar: number;
    projWarActualPoss: number;
    projWar: number | null;
    payrollShare: number | null;
  }> = [];
  for (let t = firstStart + 2; t <= lastStart; t++) {
    const fit = fits.get(t - 1)!;
    const possessionsOk = Object.values(fit.possessions).every((v) => typeof v !== "number" || Number.isFinite(v));
    const season = seasonLabel(t);
    const teams = teamBySeason.get(season)!;
    const byTeam = new Map<string, { actual: number; projActualPoss: number; proj: number; projOk: boolean; payroll: number; payrollOk: boolean }>();
    for (const [id, teamNba] of teams) {
      const line = lineAt(id, t)!;
      const h = histories.get(id)!;
      const known = h.lines.filter((l) => seasonStartYear(l.season) <= t - 1);
      const base = baseRate(known, t - 1, fit.params, shareFor(id, t));
      const age = ageAt(id, t - 1);
      const rate = base
        ? base.rate + (age != null ? Math.min(fit.aging.max, Math.max(fit.aging.min, fit.aging.intercept + fit.aging.slope * age)) : 0)
        : fit.replacementRate;
      const share = shareFor(id, t);
      let proj = 0;
      let projOk = share != null && possessionsOk;
      if (base && age != null && share != null && possessionsOk) {
        const p = projectSeasons(known, t - 1, age, [t], new Map([[t, share]]), fit.params)?.[0];
        proj = p ? p.wins + fit.replacementRate * p.possessions : 0;
      } else if (!base) {
        proj = fit.replacementRate * line.possessions;
      } else projOk = false;
      const agg = byTeam.get(teamNba) ?? { actual: 0, projActualPoss: 0, proj: 0, projOk: true, payroll: 0, payrollOk: true };
      agg.actual += line.war1;
      agg.projActualPoss += rate * line.possessions;
      agg.proj += proj;
      agg.projOk &&= projOk || line.possessions < 300;
      agg.payroll += share ?? 0;
      agg.payrollOk &&= share != null || line.possessions < 300;
      byTeam.set(teamNba, agg);
    }
    for (const [teamNba, agg] of byTeam) {
      const espn = getCanonicalTeamFromProvider("nba", teamNba)?.providerIds.espn;
      const rec = standings.find((s) => s.season === season && s.team === espn);
      const prev = standings.find((s) => s.season === seasonLabel(t - 1) && s.team === espn);
      if (!rec) continue;
      rows.push({
        season,
        abbr: rec.abbr,
        wins82: (rec.wins / rec.games) * 82,
        lastWins82: prev ? (prev.wins / prev.games) * 82 : null,
        actualWar: agg.actual,
        projWarActualPoss: agg.projActualPoss,
        projWar: salaryBySeason.has(season) && agg.projOk ? agg.proj : null,
        payrollShare: salaryBySeason.has(season) && agg.payrollOk ? agg.payroll : null,
      });
    }
  }
  const fitLine = (xs: number[], ys: number[]) => {
    const mx = mean(xs);
    const my = mean(ys);
    const slope =
      xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const intercept = my - slope * mx;
    const resid = ys.map((y, i) => y - (intercept + slope * xs[i]));
    return { slope: r3(slope), intercept: r3(intercept), r: r3(corr(xs, ys)), rmse: r3(Math.sqrt(mean(resid.map((e) => e * e)))) };
  };
  const withLast = rows.filter((r) => r.lastWins82 != null);
  const withProj = rows.filter((r) => r.projWar != null);
  const withPay = rows.filter((r) => r.payrollShare != null);
  return {
    rows: rows.map((r) => ({
      ...r,
      wins82: Number(r.wins82.toFixed(1)),
      lastWins82: r.lastWins82 == null ? null : Number(r.lastWins82.toFixed(1)),
      actualWar: Number(r.actualWar.toFixed(2)),
      projWarActualPoss: Number(r.projWarActualPoss.toFixed(2)),
      projWar: r.projWar == null ? null : Number(r.projWar.toFixed(2)),
      payrollShare: r.payrollShare == null ? null : r3(r.payrollShare),
    })),
    sameSeasonDrbl: fitLine(rows.map((r) => r.actualWar), rows.map((r) => r.wins82)),
    preseasonDrblActualMinutes: fitLine(rows.map((r) => r.projWarActualPoss), rows.map((r) => r.wins82)),
    preseasonDrblProjectedMinutes: withProj.length
      ? { ...fitLine(withProj.map((r) => r.projWar!), withProj.map((r) => r.wins82)), n: withProj.length }
      : null,
    lastSeasonWins: { ...fitLine(withLast.map((r) => r.lastWins82!), withLast.map((r) => r.wins82)), n: withLast.length },
    payroll: withPay.length
      ? { ...fitLine(withPay.map((r) => r.payrollShare!), withPay.map((r) => r.wins82)), n: withPay.length }
      : null,
  };
}

async function main() {
  const fits = new Map<number, FittedModel>();
  for (let a = firstStart + 1; a <= lastStart; a++) fits.set(a, fitModel(inputs, a));
  const finalFit = fits.get(lastStart)!;
  const oos = outOfSample(inputs, TODAY_CAP);
  const { anchors, years, contracts } = oos;
  const yearsIn = anchors.flatMap((a) => evaluateAnchor(inputs, a, finalFit, TODAY_CAP).years);

  const byHorizon = [1, 2, 3]
    .map((h) => ({ horizon: h, ...summarize(years.filter((r) => r.horizon === h)) }))
    .filter((r) => r.n > 0);
  const byAnchor = anchors.map((a) => ({ anchor: seasonLabel(a), ...summarize(years.filter((r) => r.anchor === a)) }));

  const contractPred = contracts.map((c) => c.predSurplus);
  const contractReal = contracts.map((c) => c.realSurplus);
  const contractSummary = {
    n: contracts.length,
    corr: r3(corr(contractPred, contractReal)),
    spearman: r3(spearman(contractPred, contractReal)),
    rmse: M(rmse(contractPred, contractReal)),
    coverage80: r3(mean(contracts.map((c) => (c.realSurplus >= c.low - 1 && c.realSurplus <= c.high + 1 ? 1 : 0)))),
    meanPred: M(mean(contractPred)),
    meanReal: M(mean(contractReal)),
  };

  const salaryBands: Array<[string, number, number]> = [
    ["Under 3% of cap", 0, 0.03],
    ["3-10%", 0.03, 0.1],
    ["10-20%", 0.1, 0.2],
    ["20-30%", 0.2, 0.3],
    ["30% and up", 0.3, 9],
  ];
  const ageBands: Array<[string, number, number]> = [
    ["23 and under", 0, 23],
    ["24-27", 24, 27],
    ["28-31", 28, 31],
    ["32 and up", 32, 99],
  ];
  const band = (bands: Array<[string, number, number]>, upperInclusive: boolean) => (x: number) =>
    bands.find(([, lo, hi]) => x >= lo && (upperInclusive ? x <= hi : x < hi))?.[0] ?? "?";

  const pick = (anchor: number, n: number) => {
    const list = contracts.filter((c) => c.anchor === anchor).sort((a, b) => b.predSurplus - a.predSurplus);
    const fmt = (c: ContractRow) => ({
      name: c.name,
      age: c.age,
      years: `${seasonLabel(anchor + 1)} to ${seasonLabel(anchor + c.years)}`,
      salary: M(c.salary),
      pred: M(c.predSurplus),
      low: M(c.low),
      high: M(c.high),
      real: M(c.realSurplus),
    });
    return { anchor: seasonLabel(anchor), best: list.slice(0, n).map(fmt), worst: list.slice(-n).reverse().map(fmt) };
  };

  let team: ReturnType<typeof teamCheck> | { error: string };
  try {
    team = teamCheck(await fetchStandings(), fits);
  } catch (err) {
    team = { error: String(err) };
  }

  const result = {
    generatedAt: new Date().toISOString(),
    dollars: "2026-27 cap ($164.961M)",
    anchors: anchors.map(seasonLabel),
    targetsThrough: seasonLabel(lastSalaried),
    fits: anchors.map((a) => {
      const f = fits.get(a)!;
      return {
        through: seasonLabel(a),
        pricePerWinShare: r3(f.pricePerWinShare),
        replacementPer1000: r3(f.replacementRate * 1000),
        K: f.best.K,
        weights: f.best.weights,
      };
    }),
    finalFit: { pricePerWinShare: r3(finalFit.pricePerWinShare), K: finalFit.best.K },
    byHorizon,
    byAnchor,
    inSampleByHorizon: [1, 2, 3]
      .map((h) => ({ horizon: h, ...summarize(yearsIn.filter((r) => r.horizon === h)) }))
      .filter((r) => r.n > 0),
    tails: { model: tailHits(years, "predSurplus"), carry: tailHits(years, "carry") },
    deciles: deciles(years),
    contracts: contractSummary,
    bySalary: bucket(years, (r) => band(salaryBands, false)(r.share), salaryBands.map((b) => b[0])),
    byAge: bucket(years, (r) => band(ageBands, true)(r.age), ageBands.map((b) => b[0])),
    coverageByHistory: (
      [
        ["Under 4,000 recent possessions", 0, 4000],
        ["4,000-10,000", 4000, 10000],
        ["10,000 and up", 10000, 1e9],
      ] as Array<[string, number, number]>
    ).map(([label, lo, hi]) => ({
      group: label,
      ...summarize(years.filter((r) => r.recentPossessions >= lo && r.recentPossessions < hi)),
    })),
    picks: anchors.map((a) => pick(a, 10)),
    team,
  };
  writeFileSync(outPath, JSON.stringify(result, null, 1));
  if (process.argv.includes("--rows")) writeFileSync(outPath.replace(/\.json$/, "-rows.json"), JSON.stringify(years));

  console.log(`contract-value eval: anchors ${result.anchors.join(", ")}, targets through ${result.targetsThrough}`);
  console.log("fits", result.fits);
  const brief = (r: ReturnType<typeof summarize>) =>
    `n=${r.n} wins rmse ${r.rmseWins} (repeat ${r.rmseWinsCarry}) bias ${r.biasWins} crps ${r.crps} ` +
    `corr ${r.corrModel} above/below ${r.aboveHigh}/${r.belowLow} $rmse ${r.rmseModel}M`;
  for (const r of byHorizon) console.log(`h${r.horizon}`, brief(r));
  for (const r of byAnchor) console.log(r.anchor, brief(r));
  console.log("tails", result.tails, "contracts", contractSummary);
  console.table(result.deciles);
  console.table(result.bySalary);
  console.table(result.byAge);
  console.table(
    result.coverageByHistory.map((g) => ({
      group: g.group,
      n: g.n,
      rmseWins: g.rmseWins,
      biasWins: g.biasWins,
      crps: g.crps,
      aboveHigh: g.aboveHigh,
      belowLow: g.belowLow,
    }))
  );
  if ("error" in team) console.log("team check skipped:", team.error);
  else {
    const { rows, ...fitsOnly } = team;
    console.log("team check", rows.length, fitsOnly);
  }
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
