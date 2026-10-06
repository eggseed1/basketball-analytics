/**
 * Bake contract surplus estimates for every current contract.
 *
 * Fits the model on DRBL seasons (WAR1) joined to historical salaries:
 * replacement rate, price per win, regression, aging, playing time and the
 * size of projection misses by horizon. Then values each contract year.
 *
 * Writes src/data/runtime/contract-value-snapshot.json.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  baseRate,
  projectSeasons,
  seasonLabel,
  seasonStartYear,
  valueContract,
  type ContractYearInput,
} from "../src/contracts/value-model";
import { outOfSample, summarize } from "./lib/contract-value-eval";
import { fitModel, loadInputs, looseName, readJson, REPLACEMENT_MAX_SHARE } from "./lib/contract-value-fit";

const root = process.cwd();
const capByEndYear = readJson<{
  bySeasonEndYear: Record<string, { salaryCapM: number; minSalaryM: number }>;
}>("data/cba/salary-cap-by-year.json").bySeasonEndYear;
const capSeasons = readJson<{ seasons: Array<{ seasonStartYear: number; salaryCap: number }> }>(
  "data/cba/league-cap-seasons.json"
).seasons;
type ContractCell = { amount: number; option?: "player" | "team"; notGuaranteed?: true } | null;
const contractTeams = readJson<{
  teams: Record<
    string,
    {
      code: string;
      seasons: string[];
      rows: Array<{ name: string; brefId: string; age?: number; years: ContractCell[] }>;
      notes: Record<string, string>;
    }
  >;
}>("src/data/runtime/bref-team-contracts-snapshot.json").teams;
const aliases = readJson<{ aliases: Array<{ nbaPlayerId?: string; brefSlug?: string }> }>(
  "src/data/runtime/player-id-aliases-snapshot.json"
).aliases;

const inputs = loadInputs();
const { seasons, histories, namesById, capFor } = inputs;
const lastSeason = seasons[seasons.length - 1];
const lastStart = seasonStartYear(lastSeason);
const fit = fitModel(inputs, lastStart);
const { params, replacementRate, leagueRate, pricePerWinShare, priceSeasons, priceBySeason, aging, possessions, best } = fit;
const checks = fit.backtest;

// ---- Cap path for contract seasons
const knownCaps = new Map<number, number>();
for (const [end, row] of Object.entries(capByEndYear)) knownCaps.set(Number(end) - 1, row.salaryCapM * 1e6);
for (const row of capSeasons) knownCaps.set(row.seasonStartYear, row.salaryCap);
const capYears = [...knownCaps.keys()].sort((a, b) => a - b);
const lastCapYear = capYears[capYears.length - 1];
const CAP_GROWTH_MAX = 0.1;
const growths = capYears
  .slice(-11)
  .slice(1)
  .map((y) => Math.min(CAP_GROWTH_MAX, knownCaps.get(y)! / knownCaps.get(y - 1)! - 1));
const capGrowth = growths.reduce((a, b) => a + b, 0) / growths.length;
const capFor2 = (startYear: number) =>
  knownCaps.get(startYear) ??
  knownCaps.get(lastCapYear)! * (1 + capGrowth) ** (startYear - lastCapYear);
const latestCap = capFor(lastStart);
const minimumShare = latestCap ? latestCap.minimum / latestCap.cap : 0.008;
const MAX_SHARE = 0.35;

// ---- Value every current contract
const nbaByBref = new Map<string, string>();
for (const a of aliases) if (a.brefSlug && a.nbaPlayerId) nbaByBref.set(a.brefSlug.toLowerCase(), String(a.nbaPlayerId));
const idsByName = new Map<string, string[]>();
for (const [id, name] of namesById) {
  const key = looseName(name);
  idsByName.set(key, [...(idsByName.get(key) ?? []), id]);
}

const MIN_RECENT_POSSESSIONS = 500;
type Out = {
  team: string;
  /** [season, salary, worthLow, worth, worthHigh, surplus, wins, winsSd, aboveMax] */
  years: Array<[string, number, number, number, number, number, number, number, 0 | 1]>;
  salary: number;
  worth: number;
  surplus: number;
  low: number;
  high: number;
  basis: { seasons: string[]; possessions: number };
  pct?: number;
};
type Reason = "no-drbl" | "thin" | "waived";
const players: Record<string, Out | { team: string; reason: Reason }> = {};
let matchedById = 0;
let matchedByName = 0;
for (const [teamId, team] of Object.entries(contractTeams)) {
  for (const row of team.rows) {
    const years: ContractYearInput[] = [];
    row.years.forEach((cell, i) => {
      const season = team.seasons[i];
      if (!cell || !season || !Number.isFinite(cell.amount)) return;
      years.push({
        season,
        salary: cell.amount,
        cap: capFor2(seasonStartYear(season)),
        option: cell.option ?? null,
        notGuaranteed: cell.notGuaranteed === true,
      });
    });
    const key = `${teamId}:${row.brefId}`;
    if (!years.length || players[key]) continue;
    // Notes list the newest event first; a waived row is dead money.
    if (/^Waived\b/.test(team.notes[row.brefId] ?? "")) {
      players[key] = { team: teamId, reason: "waived" };
      continue;
    }
    let nbaId = nbaByBref.get(row.brefId.toLowerCase()) ?? null;
    if (nbaId && histories.has(nbaId)) matchedById += 1;
    else {
      const named = idsByName.get(looseName(row.name)) ?? [];
      nbaId = named.length === 1 ? named[0] : null;
      if (nbaId) matchedByName += 1;
    }
    const history = nbaId ? histories.get(nbaId) : null;
    const base = history ? baseRate(history.lines, lastStart, params) : null;
    if (!history || !base) {
      players[key] = { team: teamId, reason: "no-drbl" };
      continue;
    }
    if (base.recentPossessions < MIN_RECENT_POSSESSIONS) {
      players[key] = { team: teamId, reason: "thin" };
      continue;
    }
    const capStart = seasonStartYear(years[0].season);
    const lastAge = [...history.lines].reverse().find((l) => l.age != null);
    const ageAtLast =
      row.age != null
        ? row.age - (capStart - lastStart)
        : lastAge?.age != null
          ? lastAge.age + (lastStart - seasonStartYear(lastAge.season))
          : null;
    if (ageAtLast == null) {
      players[key] = { team: teamId, reason: "thin" };
      continue;
    }
    const shares = new Map(years.map((y) => [seasonStartYear(y.season), y.salary / y.cap]));
    const projections = projectSeasons(
      history.lines,
      lastStart,
      ageAtLast,
      years.map((y) => seasonStartYear(y.season)),
      shares,
      params
    );
    if (!projections) continue;
    const value = valueContract(years, projections, {
      pricePerWinShare,
      minimumShare,
      maxShare: MAX_SHARE,
    });
    const round = (n: number) => Math.round(n / 1000) * 1000;
    const recent = history.lines.filter((l) => seasonStartYear(l.season) > lastStart - params.weights.length);
    players[key] = {
      team: teamId,
      years: value.years.map((y) => [
        y.season,
        y.salary,
        round(y.worthLow),
        round(y.worth),
        round(y.worthHigh),
        round(y.surplus),
        Number(y.wins.toFixed(2)),
        Number(y.winsSd.toFixed(2)),
        y.worthAboveMax ? 1 : 0,
      ]),
      salary: value.totalSalary,
      worth: round(value.totalWorth),
      surplus: round(value.surplus),
      low: round(value.surplusLow),
      high: round(value.surplusHigh),
      basis: {
        seasons: recent.map((l) => l.season),
        possessions: recent.reduce((s, l) => s + l.possessions, 0),
      },
    };
  }
}

const valued = Object.values(players).filter((p): p is Out => "surplus" in p);
const sorted = valued.map((p) => p.surplus).sort((a, b) => a - b);
for (const p of valued) {
  const below = sorted.filter((s) => s < p.surplus).length;
  const equal = sorted.filter((s) => s === p.surplus).length;
  p.pct = Math.round(((below + equal / 2) / sorted.length) * 100);
}

const capStartYear = Math.min(
  ...Object.values(contractTeams).map((t) => seasonStartYear(t.seasons[0]))
);

// ---- Out-of-sample check: refit as of past seasons, score the salaries paid afterward
const oos = outOfSample(inputs, capFor2(capStartYear));
const testedOutOfSample = {
  fitThrough: oos.anchors.map(seasonLabel),
  checkedThrough: seasonLabel(oos.lastSalaried),
  byHorizon: [1, 2, 3]
    .map((horizon) => {
      const rows = oos.years.filter((r) => r.horizon === horizon);
      if (!rows.length) return null;
      const s = summarize(rows, capFor2(capStartYear));
      return {
        horizon,
        n: s.n,
        rmseWins: s.rmseWins,
        repeatRmseWins: s.rmseWinsCarry,
        aboveHigh: s.aboveHigh,
        belowLow: s.belowLow,
        corr: s.corrModel,
      };
    })
    .filter((r) => r != null),
};

const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  model: {
    lastSeason,
    capSeason: seasonLabel(capStartYear),
    capSeasonCap: Math.round(capFor2(capStartYear)),
    replacementPer1000: Number((replacementRate * 1000).toFixed(4)),
    replacementMaxShare: REPLACEMENT_MAX_SHARE,
    leaguePer1000: Number((leagueRate * 1000).toFixed(4)),
    pricePerWinShare: Number(pricePerWinShare.toFixed(4)),
    priceSeasons,
    priceBySeason,
    minimumShare: Number(minimumShare.toFixed(5)),
    maxShare: MAX_SHARE,
    capGrowth: Number(capGrowth.toFixed(4)),
    capKnownThrough: seasonLabel(lastCapYear),
    weights: params.weights,
    regressionPossessions: params.regressionPossessions,
    aging,
    possessions,
    errorByHorizon: params.errorByHorizon,
    backtest: checks,
    outOfSample: testedOutOfSample,
    contracts: valued.length,
  },
  players,
};
writeFileSync(path.join(root, "src/data/runtime/contract-value-snapshot.json"), JSON.stringify(out));

const fmt = (n: number) => `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
console.log(
  `contract-value: rows=${Object.keys(players).length} valued=${valued.length} byId=${matchedById} byName=${matchedByName} ` +
    `rep/1000=${(replacementRate * 1000).toFixed(3)} league/1000=${(leagueRate * 1000).toFixed(3)} ` +
    `price=${(pricePerWinShare * 100).toFixed(2)}% of cap (${fmt(pricePerWinShare * capFor2(lastStart + 1))} in ${seasonLabel(lastStart + 1)}) ` +
    `K=${best.K} w=${best.weights.join("/")} capGrowth=${(capGrowth * 100).toFixed(1)}%`
);
console.log("price by season", priceBySeason);
console.log("aging per 1000 at 22/27/32/36", [22, 27, 32, 36].map((a) => ((aging.intercept + aging.slope * a) * 1000).toFixed(3)));
console.log("possessions", possessions);
console.log("error by horizon", params.errorByHorizon, "backtest", checks);
const top = [...valued].sort((a, b) => b.surplus - a.surplus);
const nameOf = (key: string) =>
  Object.values(contractTeams).flatMap((t) => t.rows).find((r) => r.brefId === key.split(":")[1])?.name ?? key;
const idOf = (p: Out) => Object.keys(players).find((k) => players[k] === p)!;
console.log("top", top.slice(0, 8).map((p) => `${nameOf(idOf(p))} ${fmt(p.surplus)} [${fmt(p.low)}, ${fmt(p.high)}]`));
const firstYear = valued.map((p) => p.years[0]);
console.log(
  "first-year totals: salary", fmt(firstYear.reduce((a, y) => a + y[1], 0)),
  "worth", fmt(firstYear.reduce((a, y) => a + y[3], 0)),
  "surplus", fmt(firstYear.reduce((a, y) => a + y[5], 0)),
  "aboveMax", valued.filter((p) => p.years.some((y) => y[8])).length
);
console.log("bottom", top.slice(-8).map((p) => `${nameOf(idOf(p))} ${fmt(p.surplus)} [${fmt(p.low)}, ${fmt(p.high)}]`));
