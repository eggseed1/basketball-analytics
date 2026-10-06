/**
 * Inputs and fitting for the contract surplus model, shared by the bake
 * (scripts/build-contract-value.ts) and the out-of-sample check
 * (scripts/eval-contract-value.ts).
 *
 * `fitModel(inputs, throughStartYear)` only looks at seasons that started in
 * or before `throughStartYear`, so the check can refit as of a past season.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  baseRate,
  possessionFeatures,
  projectSeasons,
  seasonLabel,
  seasonStartYear,
  weightedLeastSquares,
  type AgingCurve,
  type PossessionModel,
  type ProjectionParams,
  type SeasonLine,
} from "../../src/contracts/value-model";

const root = process.cwd();
export const readJson = <T>(rel: string): T =>
  JSON.parse(readFileSync(path.join(root, rel), "utf8")) as T;

export const looseName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

type OverlayRow = [string, string, string, ...Array<number | null>];

export type ContractValueInputs = {
  overlay: Record<string, OverlayRow[]>;
  seasons: string[];
  salaryBySeason: Map<string, Map<string, number>>;
  histories: Map<string, { name: string; lines: SeasonLine[] }>;
  namesById: Map<string, string>;
  /** Team (NBA id) a player logged the most possessions for, by season. */
  teamBySeason: Map<string, Map<string, string>>;
  capFor: (startYear: number) => { cap: number; minimum: number } | null;
  lineAt: (id: string, startYear: number) => SeasonLine | null;
  shareFor: (id: string, startYear: number) => number | null;
};

/** Games per team in seasons shorter than 82. */
const SEASON_GAMES: Record<string, number> = { "2020-21": 72 };

export function loadInputs(): ContractValueInputs {
  // Possessions and wins are put on an 82-game basis so a short season doesn't
  // read as lost playing time or cheap wins.
  const overlay = Object.fromEntries(
    Object.entries(
      readJson<{ seasons: Record<string, OverlayRow[]> }>("src/data/runtime/drbl-overlay-snapshot.json").seasons
    ).map(([season, rows]) => {
      const scale = 82 / (SEASON_GAMES[season] ?? 82);
      if (scale === 1) return [season, rows];
      return [
        season,
        rows.map((row) => {
          const out = [...row] as OverlayRow;
          out[5] = Math.round(Number(row[5]) * scale);
          if (row[12] != null) out[12] = Number(row[12]) * scale;
          return out;
        }),
      ];
    })
  ) as Record<string, OverlayRow[]>;
  const bref = readJson<{ seasons: Record<string, { perGame?: Array<{ n: string; age?: number }> }> }>(
    "src/data/runtime/bref-advanced-snapshot.json"
  ).seasons;
  const capByEndYear = readJson<{
    bySeasonEndYear: Record<string, { salaryCapM: number; minSalaryM: number }>;
  }>("data/cba/salary-cap-by-year.json").bySeasonEndYear;

  // Salary CSVs: the Season column is the year the season ends (2025 = 2024-25).
  // The supplement only fills players and seasons the main file lacks.
  const salaryBySeason = new Map<string, Map<string, number>>();
  const readSalaries = (rel: string) => {
    const out = new Map<string, Map<string, number>>();
    for (const line of readFileSync(path.join(root, rel), "utf8").split("\n").slice(1)) {
      const m = line.match(/^(.*),(\d+),(\d{4})\s*$/);
      if (!m) continue;
      const season = seasonLabel(Number(m[3]) - 1);
      const bucket = out.get(season) ?? new Map<string, number>();
      const key = looseName(m[1].replace(/^"|"$/g, ""));
      bucket.set(key, (bucket.get(key) ?? 0) + Number(m[2]));
      out.set(season, bucket);
    }
    return out;
  };
  for (const [season, bucket] of readSalaries("data/salaries/player-salaries-2000-2025.csv"))
    salaryBySeason.set(season, bucket);
  for (const [season, extra] of readSalaries("data/salaries/player-salaries-supplement.csv")) {
    const bucket = salaryBySeason.get(season) ?? new Map<string, number>();
    for (const [key, salary] of extra) if (!bucket.has(key)) bucket.set(key, salary);
    salaryBySeason.set(season, bucket);
  }

  const seasons = Object.keys(overlay).sort();
  const capFor = (startYear: number) => {
    const row = capByEndYear[String(startYear + 1)];
    return row ? { cap: row.salaryCapM * 1e6, minimum: row.minSalaryM * 1e6 } : null;
  };

  const histories = new Map<string, { name: string; lines: SeasonLine[] }>();
  const namesById = new Map<string, string>();
  const teamBySeason = new Map<string, Map<string, string>>();
  for (const season of seasons) {
    const ageCounts = new Map<string, number>();
    const ages = new Map<string, number>();
    for (const row of bref[season]?.perGame ?? []) {
      const key = looseName(row.n);
      ageCounts.set(key, (ageCounts.get(key) ?? 0) + 1);
      if (row.age != null) ages.set(key, row.age);
    }
    const teams = new Map<string, string>();
    for (const row of overlay[season]) {
      const [id, name, teamId] = row;
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
      teams.set(id, teamId);
    }
    teamBySeason.set(season, teams);
  }
  const lineAt = (id: string, startYear: number) =>
    histories.get(id)?.lines.find((l) => seasonStartYear(l.season) === startYear) ?? null;
  const shareFor = (id: string, startYear: number): number | null => {
    const salaries = salaryBySeason.get(seasonLabel(startYear));
    const cap = capFor(startYear);
    const name = namesById.get(id);
    if (!salaries || !cap || !name) return null;
    const salary = salaries.get(looseName(name));
    return salary != null ? salary / cap.cap : null;
  };

  return { overlay, seasons, salaryBySeason, histories, namesById, teamBySeason, capFor, lineAt, shareFor };
}

export type FittedModel = {
  params: ProjectionParams;
  replacementRate: number;
  leagueRate: number;
  pricePerWinShare: number;
  priceSeasons: string[];
  priceBySeason: Record<string, number>;
  aging: AgingCurve;
  possessions: PossessionModel;
  best: { weights: number[]; K: number; err: number };
  backtest: Array<{ horizon: number; n: number; rmse: number; naiveRmse: number; coverage80: number }>;
};

export const REPLACEMENT_MAX_SHARE = 0.015;
const AGE_KNEE = 30;
const LOW_SHARE_CAP = 0.05;

export function fitModel(inputs: ContractValueInputs, throughStartYear: number): FittedModel {
  const { overlay, salaryBySeason, histories, capFor, lineAt, shareFor } = inputs;
  const seasons = inputs.seasons.filter((s) => seasonStartYear(s) <= throughStartYear);
  const linesThrough = (lines: SeasonLine[]) =>
    lines.filter((l) => seasonStartYear(l.season) <= throughStartYear);

  // ---- Replacement rate and price per win (pooled over seasons with salaries)
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
  for (const h of histories.values()) for (const l of linesThrough(h.lines)) {
    leagueWins += l.war1;
    leaguePoss += l.possessions;
  }
  const leagueRate = leagueWins / leaguePoss;

  // ---- Regression target by salary: WAR1 per possession against salary share, same season
  const PRIOR_MAX_SHARE = 0.35;
  const priorRows = salaried.filter((r) => r.possessions > 0);
  const [priorIntercept, priorSlope] = weightedLeastSquares(
    priorRows.map((r) => [1, Math.min(r.share, PRIOR_MAX_SHARE)]),
    priorRows.map((r) => r.war1 / r.possessions),
    priorRows.map((r) => r.possessions)
  );
  const priorByShare = { intercept: priorIntercept, slope: priorSlope, maxShare: PRIOR_MAX_SHARE };

  // ---- Aging: year-over-year change in WAR1 rate by age (delta method)
  const agingRows: number[][] = [];
  const agingY: number[] = [];
  const agingW: number[] = [];
  for (const h of histories.values()) {
    const lines = linesThrough(h.lines);
    for (const a of lines) {
      const b = lines.find((l) => seasonStartYear(l.season) === seasonStartYear(a.season) + 1);
      if (!b || a.age == null || a.possessions < 1000 || b.possessions < 1000) continue;
      agingRows.push([1, a.age]);
      agingY.push(b.war1 / b.possessions - a.war1 / a.possessions);
      agingW.push((2 * a.possessions * b.possessions) / (a.possessions + b.possessions));
    }
  }
  const [agingIntercept, agingSlope] = weightedLeastSquares(agingRows, agingY, agingW);
  const aging: AgingCurve = { intercept: agingIntercept, slope: agingSlope, min: -0.0003, max: 0.0002 };

  // ---- Playing time: possessions in seasons a player was under contract
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
    max: Math.max(...[...histories.values()].flatMap((h) => linesThrough(h.lines).map((l) => l.possessions))),
  };

  // ---- Regression strength and season weights: grid search on next-season rate
  function rateError(weights: number[], K: number): number {
    const p = { weights, regressionPossessions: K, leagueRate, priorByShare } as ProjectionParams;
    let se = 0;
    let n = 0;
    for (let i = 1; i < seasons.length; i++) {
      const t = seasonStartYear(seasons[i]);
      for (const [id, h] of histories) {
        const actual = lineAt(id, t);
        if (!actual || actual.possessions < 1000) continue;
        const base = baseRate(h.lines.filter((l) => seasonStartYear(l.season) < t), t - 1, p, shareFor(id, t));
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
    priorByShare,
    replacementRate,
    aging,
    possessions,
    errorByHorizon: [{ base: 1, perK: 0 }],
  };

  // ---- Projection misses by horizon (wins above replacement at projected minutes)
  type Miss = { horizon: number; projected: number; possessions: number; actual: number };
  const horizons = [1, 2, 3].filter((h) => h < seasons.length);
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
  params.errorByHorizon = horizons.map((horizon) => {
    const rows = misses.filter((m) => m.horizon === horizon);
    // Mean absolute miss × √(π/2) estimates a normal sd; fit it against minutes.
    const [base, perK] = weightedLeastSquares(
      rows.map((m) => [1, m.possessions / 1000]),
      rows.map((m) => Math.abs(m.actual - m.projected) * Math.sqrt(Math.PI / 2)),
      rows.map(() => 1)
    );
    return { base: Number(base.toFixed(4)), perK: Number(perK.toFixed(4)) };
  });
  const backtest = horizons.map((horizon) => {
    const rows = misses.filter((m) => m.horizon === horizon);
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

  return {
    params,
    replacementRate,
    leagueRate,
    pricePerWinShare,
    priceSeasons,
    priceBySeason,
    aging,
    possessions,
    best,
    backtest,
  };
}
