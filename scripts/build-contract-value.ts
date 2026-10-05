/**
 * Bake contract surplus estimates for every current contract.
 *
 * Fits the model on DRBL seasons (WAR1) joined to historical salaries:
 * replacement rate, price per win, regression, aging, playing time and the
 * size of projection misses by horizon. Then values each contract year.
 *
 * Writes src/data/runtime/contract-value-snapshot.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  baseRate,
  possessionFeatures,
  projectSeasons,
  seasonLabel,
  seasonStartYear,
  valueContract,
  weightedLeastSquares,
  type AgingCurve,
  type ContractYearInput,
  type PossessionModel,
  type ProjectionParams,
  type SeasonLine,
} from "../src/contracts/value-model";

const root = process.cwd();
const readJson = <T>(rel: string): T =>
  JSON.parse(readFileSync(path.join(root, rel), "utf8")) as T;

type OverlayRow = [string, string, string, ...Array<number | null>];
const overlay = readJson<{ seasons: Record<string, OverlayRow[]> }>(
  "src/data/runtime/drbl-overlay-snapshot.json"
).seasons;
const bref = readJson<{ seasons: Record<string, { perGame?: Array<{ n: string; age?: number }> }> }>(
  "src/data/runtime/bref-advanced-snapshot.json"
).seasons;
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

const looseName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Salary CSV: the Season column is the year the season ends (2025 = 2024-25).
const salaryBySeason = new Map<string, Map<string, number>>();
for (const line of readFileSync(path.join(root, "data/salaries/player-salaries-2000-2025.csv"), "utf8")
  .split("\n")
  .slice(1)) {
  const m = line.match(/^(.*),(\d+),(\d{4})\s*$/);
  if (!m) continue;
  const season = seasonLabel(Number(m[3]) - 1);
  const bucket = salaryBySeason.get(season) ?? new Map<string, number>();
  const key = looseName(m[1].replace(/^"|"$/g, ""));
  bucket.set(key, (bucket.get(key) ?? 0) + Number(m[2]));
  salaryBySeason.set(season, bucket);
}

const seasons = Object.keys(overlay).sort();
const lastSeason = seasons[seasons.length - 1];
const lastStart = seasonStartYear(lastSeason);

function capFor(startYear: number): { cap: number; minimum: number } | null {
  const row = capByEndYear[String(startYear + 1)];
  return row ? { cap: row.salaryCapM * 1e6, minimum: row.minSalaryM * 1e6 } : null;
}

// ---- Player histories keyed by NBA id
const histories = new Map<string, { name: string; lines: SeasonLine[] }>();
const namesById = new Map<string, string>();
for (const season of seasons) {
  const ageCounts = new Map<string, number>();
  const ages = new Map<string, number>();
  for (const row of bref[season]?.perGame ?? []) {
    const key = looseName(row.n);
    ageCounts.set(key, (ageCounts.get(key) ?? 0) + 1);
    if (row.age != null) ages.set(key, row.age);
  }
  for (const row of overlay[season]) {
    const [id, name] = row;
    const possessions = Number(row[5]);
    const war1 = row[12];
    if (war1 == null || !Number.isFinite(possessions)) continue;
    const key = looseName(name);
    const entry = histories.get(id) ?? { name, lines: [] };
    entry.lines.push({
      season,
      possessions,
      war1,
      age: ageCounts.get(key) === 1 ? ages.get(key) ?? null : null,
    });
    entry.name = name;
    histories.set(id, entry);
    namesById.set(id, name);
  }
}
const lineAt = (id: string, startYear: number) =>
  histories.get(id)?.lines.find((l) => seasonStartYear(l.season) === startYear) ?? null;

// ---- Replacement rate and price per win (pooled over seasons with salaries)
const REPLACEMENT_MAX_SHARE = 0.015;
let repWins = 0;
let repPoss = 0;
const salaried: Array<{ season: string; share: number; minShare: number; possessions: number; war1: number }> = [];
for (const season of seasons) {
  const salaries = salaryBySeason.get(season);
  const cap = capFor(seasonStartYear(season));
  if (!salaries || !cap) continue;
  for (const row of overlay[season]) {
    const salary = salaries.get(looseName(row[1]));
    const war1 = row[12];
    if (salary == null || war1 == null) continue;
    const share = salary / cap.cap;
    salaried.push({ season, share, minShare: cap.minimum / cap.cap, possessions: Number(row[5]), war1 });
    if (share <= REPLACEMENT_MAX_SHARE) {
      repWins += war1;
      repPoss += Number(row[5]);
    }
  }
}
const replacementRate = repWins / repPoss;
const priceSeasons = [...new Set(salaried.map((r) => r.season))].sort();
const sumAbove = salaried.reduce((s, r) => s + (r.share - r.minShare), 0);
// Wins are floored at replacement on both sides: here for what teams paid for,
// and in each simulated season when valuing a contract.
const flooredWins = (r: { war1: number; possessions: number }) =>
  Math.max(0, r.war1 - replacementRate * r.possessions);
const sumWins = salaried.reduce((s, r) => s + flooredWins(r), 0);
const pricePerWinShare = sumAbove / sumWins;
const priceBySeason = Object.fromEntries(
  priceSeasons.map((season) => {
    const rows = salaried.filter((r) => r.season === season);
    const above = rows.reduce((s, r) => s + (r.share - r.minShare), 0);
    const wins = rows.reduce((s, r) => s + flooredWins(r), 0);
    return [season, Number((above / wins).toFixed(4))];
  })
);

let leagueWins = 0;
let leaguePoss = 0;
for (const h of histories.values()) for (const l of h.lines) {
  leagueWins += l.war1;
  leaguePoss += l.possessions;
}
const leagueRate = leagueWins / leaguePoss;

// ---- Aging: year-over-year change in WAR1 rate by age (delta method)
const agingRows: number[][] = [];
const agingY: number[] = [];
const agingW: number[] = [];
for (const h of histories.values()) {
  for (const a of h.lines) {
    const b = h.lines.find((l) => seasonStartYear(l.season) === seasonStartYear(a.season) + 1);
    if (!b || a.age == null || a.possessions < 1000 || b.possessions < 1000) continue;
    agingRows.push([1, a.age]);
    agingY.push(b.war1 / b.possessions - a.war1 / a.possessions);
    agingW.push((2 * a.possessions * b.possessions) / (a.possessions + b.possessions));
  }
}
const [agingIntercept, agingSlope] = weightedLeastSquares(agingRows, agingY, agingW);
const aging: AgingCurve = {
  intercept: agingIntercept,
  slope: agingSlope,
  min: -0.0003,
  max: 0.0002,
};

// ---- Playing time: possessions in seasons a player was under contract
const AGE_KNEE = 30;
const LOW_SHARE_CAP = 0.05;
const shareFor = (id: string, startYear: number): number | null => {
  const salaries = salaryBySeason.get(seasonLabel(startYear));
  const cap = capFor(startYear);
  const name = namesById.get(id);
  if (!salaries || !cap || !name) return null;
  const salary = salaries.get(looseName(name));
  return salary != null ? salary / cap.cap : null;
};
const possRows: number[][] = [];
const possY: number[] = [];
for (let i = 1; i < seasons.length; i++) {
  const t = seasonStartYear(seasons[i]);
  for (const id of histories.keys()) {
    const last = lineAt(id, t - 1);
    const share = shareFor(id, t);
    if (!last || last.age == null || share == null) continue;
    const prior = lineAt(id, t - 2)?.possessions ?? last.possessions;
    possRows.push(
      possessionFeatures(last.possessions, prior, last.age + 1, share, {
        ageKnee: AGE_KNEE,
        lowShareCap: LOW_SHARE_CAP,
      })
    );
    possY.push(lineAt(id, t)?.possessions ?? 0);
  }
}
const [pI, pLast, pPrior, pAge, pShare, pShareLow, pBounce] = weightedLeastSquares(
  possRows,
  possY,
  possY.map(() => 1)
);
const possessions: PossessionModel = {
  intercept: pI,
  last: pLast,
  prior: pPrior,
  agePenalty: pAge,
  ageKnee: AGE_KNEE,
  salaryShare: pShare,
  salaryShareLow: pShareLow,
  lowShareCap: LOW_SHARE_CAP,
  bounce: pBounce,
  max: Math.max(...[...histories.values()].flatMap((h) => h.lines.map((l) => l.possessions))),
};

// ---- Regression strength and season weights: grid search on next-season rate
function rateError(weights: number[], K: number): number {
  const params = { weights, regressionPossessions: K, leagueRate } as ProjectionParams;
  let se = 0;
  let n = 0;
  for (let i = 1; i < seasons.length; i++) {
    const t = seasonStartYear(seasons[i]);
    for (const [id, h] of histories) {
      const actual = lineAt(id, t);
      if (!actual || actual.possessions < 1000) continue;
      const base = baseRate(h.lines.filter((l) => seasonStartYear(l.season) < t), t - 1, params);
      if (!base) continue;
      se += ((base.rate - actual.war1 / actual.possessions) * actual.possessions) ** 2;
      n += 1;
    }
  }
  return Math.sqrt(se / n);
}
let best = { weights: [3, 2, 1], K: 8000, err: Infinity };
for (const weights of [[3, 2, 1], [2, 1.5, 1], [5, 4, 3], [1, 1, 1], [1]])
  for (const K of [2000, 4000, 6000, 8000, 10000, 12000, 15000, 20000]) {
    const err = rateError(weights, K);
    if (err < best.err) best = { weights, K, err };
  }

const params: ProjectionParams = {
  weights: best.weights,
  regressionPossessions: best.K,
  leagueRate,
  replacementRate,
  aging,
  possessions,
  errorByHorizon: [{ base: 1, perK: 0 }],
};


// ---- Projection misses by horizon (wins above replacement at projected minutes)
type Miss = { horizon: number; projected: number; possessions: number; actual: number; sd?: number };
function backtest(horizons: number[]): Miss[] {
  const misses: Miss[] = [];
  for (const horizon of horizons) {
    for (let i = horizon; i < seasons.length; i++) {
      const target = seasonStartYear(seasons[i]);
      const lastObserved = target - horizon;
      for (const [id, h] of histories) {
        const anchor = lineAt(id, lastObserved);
        if (!anchor || anchor.age == null) continue;
        const shares = new Map<number, number>();
        for (let y = lastObserved + 1; y <= target; y++) {
          const share = shareFor(id, y);
          if (share != null) shares.set(y, share);
        }
        if (!shares.has(target)) continue;
        const known = h.lines.filter((l) => seasonStartYear(l.season) <= lastObserved);
        const proj = projectSeasons(known, lastObserved, anchor.age, [target], shares, params)?.[0];
        if (!proj) continue;
        const actual = lineAt(id, target);
        const actualWins = actual ? actual.war1 - replacementRate * actual.possessions : 0;
        misses.push({ horizon, projected: proj.wins, possessions: proj.possessions, actual: actualWins });
      }
    }
  }
  return misses;
}
const HORIZONS = [1, 2, 3];
const firstPass = backtest(HORIZONS);
params.errorByHorizon = HORIZONS.map((horizon) => {
  const rows = firstPass.filter((m) => m.horizon === horizon);
  // Mean absolute miss × √(π/2) estimates a normal sd; fit it against minutes.
  const [base, perK] = weightedLeastSquares(
    rows.map((m) => [1, m.possessions / 1000]),
    rows.map((m) => Math.abs(m.actual - m.projected) * Math.sqrt(Math.PI / 2)),
    rows.map(() => 1)
  );
  return { base: Number(base.toFixed(4)), perK: Number(perK.toFixed(4)) };
});
const checks = HORIZONS.map((horizon) => {
  const rows = firstPass.filter((m) => m.horizon === horizon);
  const { base, perK } = params.errorByHorizon[horizon - 1];
  let inside = 0;
  let se = 0;
  let seNaive = 0;
  for (const m of rows) {
    const sd = Math.max(0.05, base + (perK * m.possessions) / 1000);
    if (Math.abs(m.actual - m.projected) <= 1.2816 * sd) inside += 1;
    se += (m.actual - m.projected) ** 2;
    const naive = (leagueRate - replacementRate) * m.possessions;
    seNaive += (m.actual - naive) ** 2;
  }
  return {
    horizon,
    n: rows.length,
    rmse: Number(Math.sqrt(se / rows.length).toFixed(3)),
    naiveRmse: Number(Math.sqrt(seNaive / rows.length).toFixed(3)),
    coverage80: Number((inside / rows.length).toFixed(3)),
  };
});

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
console.log("aging per 1000 at 22/27/32/36", [22, 27, 32, 36].map((a) => ((agingIntercept + agingSlope * a) * 1000).toFixed(3)));
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
