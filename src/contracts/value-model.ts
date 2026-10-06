/**
 * Contract surplus model. Pure functions only; the bake script fits the
 * parameters and the site reads the baked snapshot.
 *
 * Production is DRBL wins (WAR1) re-based to replacement level: WAR1 sits near
 * an average-player baseline, so we add back what a minimum-salary player
 * would lose over the same possessions. Value is those wins times the
 * league's going price per win, expressed as a share of the cap.
 */

export type SeasonLine = {
  season: string;
  possessions: number;
  war1: number;
  /** Age that season (Basketball Reference, as of Feb 1). */
  age: number | null;
};

export type AgingCurve = {
  /** Change in WAR1 per possession per year of age: intercept + slope × age. */
  intercept: number;
  slope: number;
  /** Clamp on the yearly change, per possession. */
  min: number;
  max: number;
};

export type PossessionModel = {
  intercept: number;
  /** Weight on last season's possessions. */
  last: number;
  /** Weight on the season before. */
  prior: number;
  /** Change per year of age past `ageKnee`. */
  agePenalty: number;
  ageKnee: number;
  /** Salary that season as a share of the cap; teams play the players they pay. */
  salaryShare: number;
  /** Extra weight on the first `lowShareCap` of salary share. */
  salaryShareLow: number;
  lowShareCap: number;
  /** Weight on how far last season fell short of the one before (a lost season). */
  bounce: number;
  max: number;
};

export function possessionFeatures(
  last: number,
  prior: number,
  age: number,
  salaryShare: number,
  model: Pick<PossessionModel, "ageKnee" | "lowShareCap">
): number[] {
  return [
    1,
    last,
    prior,
    Math.max(0, age - model.ageKnee),
    salaryShare,
    Math.min(salaryShare, model.lowShareCap),
    Math.max(0, prior - last),
  ];
}

export function predictPossessions(
  model: PossessionModel,
  last: number,
  prior: number,
  age: number,
  salaryShare: number
): number {
  const x = possessionFeatures(last, prior, age, salaryShare, model);
  const b = [
    model.intercept,
    model.last,
    model.prior,
    model.agePenalty,
    model.salaryShare,
    model.salaryShareLow,
    model.bounce,
  ];
  const raw = x.reduce((sum, v, i) => sum + v * b[i], 0);
  return Math.min(model.max, Math.max(0, raw));
}

export type ProjectionParams = {
  /** Weights on the last three seasons, newest first. */
  weights: number[];
  /** League-average possessions mixed in before dividing (regression to the mean). */
  regressionPossessions: number;
  /** League WAR1 per possession, the regression target. */
  leagueRate: number;
  /**
   * Regression target by salary instead of the league mean: what players paid
   * this share of the cap produce per possession. Teams know things the box
   * score doesn't, so pay is a fair prior.
   */
  priorByShare?: { intercept: number; slope: number; maxShare: number };
  /** WAR1 per possession of minimum-salary players. */
  replacementRate: number;
  aging: AgingCurve;
  possessions: PossessionModel;
  /** Error of projected wins above replacement: sd = base + perK × possessions / 1000, by horizon. */
  errorByHorizon: Array<{ base: number; perK: number }>;
};

export type Projection = {
  season: string;
  possessions: number;
  /** Wins above replacement, central estimate. */
  wins: number;
  sd: number;
};

export function seasonStartYear(season: string): number {
  return Number(season.slice(0, 4));
}

export function seasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function agingDelta(curve: AgingCurve, age: number): number {
  const raw = curve.intercept + curve.slope * age;
  return Math.min(curve.max, Math.max(curve.min, raw));
}

export function horizonError(
  params: ProjectionParams,
  horizon: number,
  possessions: number
): number {
  const table = params.errorByHorizon;
  const last = table.length - 1;
  let row = table[Math.min(horizon, last + 1) - 1];
  if (horizon > table.length && table.length >= 2) {
    const grow = {
      base: table[last].base - table[last - 1].base,
      perK: table[last].perK - table[last - 1].perK,
    };
    const extra = horizon - table.length;
    row = {
      base: table[last].base + Math.max(0, grow.base) * extra,
      perK: table[last].perK + Math.max(0, grow.perK) * extra,
    };
  }
  return Math.max(0.05, row.base + (row.perK * possessions) / 1000);
}

/**
 * Regressed WAR1 rate from the seasons before `targetStartYear`, newest first.
 * Returns null when there is no history in the weighting window.
 */
export function priorRate(params: ProjectionParams, salaryShare: number | null | undefined): number {
  const prior = params.priorByShare;
  if (!prior || salaryShare == null) return params.leagueRate;
  return prior.intercept + prior.slope * Math.min(salaryShare, prior.maxShare);
}

export function baseRate(
  history: SeasonLine[],
  lastObservedStartYear: number,
  params: ProjectionParams,
  salaryShare?: number | null
): { rate: number; recentPossessions: number } | null {
  const byYear = new Map(history.map((line) => [seasonStartYear(line.season), line]));
  let num = 0;
  let den = 0;
  let recent = 0;
  params.weights.forEach((weight, k) => {
    const line = byYear.get(lastObservedStartYear - k);
    if (!line) return;
    num += weight * line.war1;
    den += weight * line.possessions;
    recent += line.possessions;
  });
  if (den <= 0) return null;
  const K = params.regressionPossessions;
  return { rate: (num + K * priorRate(params, salaryShare)) / (den + K), recentPossessions: recent };
}

/**
 * Project wins above replacement for each future season.
 * `lastObservedStartYear` is the newest season with data (it may be missing
 * for this player, which reads as a lost season).
 */
export function projectSeasons(
  history: SeasonLine[],
  lastObservedStartYear: number,
  ageAtLastObserved: number,
  targetStartYears: number[],
  salaryShareByYear: Map<number, number>,
  params: ProjectionParams
): Projection[] | null {
  const firstTarget = Math.min(...targetStartYears);
  const base = baseRate(history, lastObservedStartYear, params, salaryShareByYear.get(firstTarget));
  if (!base) return null;
  const byYear = new Map(history.map((line) => [seasonStartYear(line.season), line]));
  let last = byYear.get(lastObservedStartYear)?.possessions ?? 0;
  let prior = byYear.get(lastObservedStartYear - 1)?.possessions ?? last;
  let aging = 0;
  let year = lastObservedStartYear;
  const out: Projection[] = [];
  let share = 0;
  for (const target of [...targetStartYears].sort((a, b) => a - b)) {
    while (year < target) {
      const age = ageAtLastObserved + (year - lastObservedStartYear);
      aging += agingDelta(params.aging, age);
      share = salaryShareByYear.get(year + 1) ?? share;
      const projected = predictPossessions(params.possessions, last, prior, age + 1, share);
      prior = last;
      last = projected;
      year += 1;
    }
    const horizon = target - lastObservedStartYear;
    out.push({
      season: seasonLabel(target),
      possessions: last,
      wins: (base.rate + aging - params.replacementRate) * last,
      sd: horizonError(params, horizon, last),
    });
  }
  return out;
}

export type MarketParams = {
  /** Price of one win above replacement, as a share of that season's cap. */
  pricePerWinShare: number;
  /** League minimum salary as a share of the cap. */
  minimumShare: number;
  /** Largest possible salary as a share of the cap. */
  maxShare: number;
};

export type ContractYearInput = {
  season: string;
  salary: number;
  cap: number;
  option: "player" | "team" | null;
  notGuaranteed: boolean;
};

export type ContractYearValue = {
  season: string;
  salary: number;
  /** Estimated worth in dollars: 10th percentile, mean, 90th percentile. */
  worthLow: number;
  worth: number;
  worthHigh: number;
  /** Expected surplus to the team after options and guarantees. */
  surplus: number;
  wins: number;
  winsSd: number;
  worthAboveMax: boolean;
};

export type ContractValue = {
  years: ContractYearValue[];
  totalSalary: number;
  totalWorth: number;
  surplus: number;
  surplusLow: number;
  surplusHigh: number;
};

/** Acklam's rational approximation to the standard normal quantile. */
export function normalQuantile(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const DRAWS = 400;
const Z = Array.from({ length: DRAWS }, (_, i) => normalQuantile((i + 0.5) / DRAWS));

function quantile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Value a contract year by year. One draw of player quality is shared across
 * years, so a good outcome in one season goes with good outcomes in the rest.
 * Production never goes below replacement: a team can always bench him.
 * A player option is declined when he is worth more, so the team keeps only
 * the downside; a team option or non-guaranteed year keeps only the upside.
 */
export function valueContract(
  years: ContractYearInput[],
  projections: Projection[],
  market: MarketParams
): ContractValue {
  const projBySeason = new Map(projections.map((p) => [p.season, p]));
  const totals = new Array<number>(DRAWS).fill(0);
  const out: ContractYearValue[] = [];
  for (const year of years) {
    const proj = projBySeason.get(year.season);
    if (!proj) throw new Error(`no projection for ${year.season}`);
    const price = market.pricePerWinShare * year.cap;
    const minimum = market.minimumShare * year.cap;
    const worths: number[] = [];
    let worthSum = 0;
    let surplusSum = 0;
    let winSum = 0;
    for (let i = 0; i < DRAWS; i++) {
      const wins = Math.max(0, proj.wins + proj.sd * Z[i]);
      const worth = minimum + wins * price;
      let surplus = worth - year.salary;
      if (year.option === "player") surplus = Math.min(0, surplus);
      else if (year.option === "team" || year.notGuaranteed) surplus = Math.max(0, surplus);
      worths.push(worth);
      worthSum += worth;
      surplusSum += surplus;
      winSum += wins;
      totals[i] += surplus;
    }
    const worth = worthSum / DRAWS;
    out.push({
      season: year.season,
      salary: year.salary,
      worthLow: quantile(worths, 0.1),
      worth,
      worthHigh: quantile(worths, 0.9),
      surplus: surplusSum / DRAWS,
      wins: winSum / DRAWS,
      winsSd: proj.sd,
      worthAboveMax: worth > market.maxShare * year.cap,
    });
  }
  const sortedTotals = [...totals].sort((a, b) => a - b);
  return {
    years: out,
    totalSalary: out.reduce((sum, y) => sum + y.salary, 0),
    totalWorth: out.reduce((sum, y) => sum + y.worth, 0),
    surplus: totals.reduce((a, b) => a + b, 0) / DRAWS,
    surplusLow: quantile(sortedTotals, 0.1),
    surplusHigh: quantile(sortedTotals, 0.9),
  };
}

/** Weighted least squares; returns coefficients for the given design rows. */
export function weightedLeastSquares(
  rows: number[][],
  ys: number[],
  weights: number[]
): number[] {
  const k = rows[0].length;
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  rows.forEach((row, n) => {
    const w = weights[n];
    for (let i = 0; i < k; i++) {
      xty[i] += w * row[i] * ys[n];
      for (let j = 0; j < k; j++) xtx[i][j] += w * row[i] * row[j];
    }
  });
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(xtx[r][col]) > Math.abs(xtx[pivot][col])) pivot = r;
    [xtx[col], xtx[pivot]] = [xtx[pivot], xtx[col]];
    [xty[col], xty[pivot]] = [xty[pivot], xty[col]];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = xtx[r][col] / xtx[col][col];
      for (let c = col; c < k; c++) xtx[r][c] -= f * xtx[col][c];
      xty[r] -= f * xty[col];
    }
  }
  return xty.map((v, i) => v / xtx[i][i]);
}
