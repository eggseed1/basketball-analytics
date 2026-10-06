/**
 * Player-level out-of-sample check, shared by the bake (which publishes a
 * summary) and scripts/eval-contract-value.ts (which reports the detail).
 *
 * For a past season `anchor`, the caller passes a model fitted on seasons
 * through `anchor` only. Each player is valued on the salaries he was actually
 * paid over the next one to three seasons and compared with what he delivered,
 * priced the same way, so misses come from the projection.
 */
import {
  baseRate,
  normalQuantile,
  projectSeasons,
  seasonLabel,
  seasonStartYear,
  valueContract,
  type ContractYearInput,
} from "../../src/contracts/value-model";
import { fitModel, type ContractValueInputs, type FittedModel } from "./contract-value-fit";

const MAX_HORIZON = 3;
const MIN_RECENT_POSSESSIONS = 500;
const MAX_SHARE = 0.35;

export type YearRow = {
  anchor: number;
  horizon: number;
  id: string;
  name: string;
  age: number;
  share: number;
  predWorth: number;
  worthLow: number;
  worthHigh: number;
  predSurplus: number;
  realWorth: number;
  realSurplus: number;
  carryWorth: number;
  predWins: number;
  realWins: number;
  played: boolean;
  /** Projected wins above replacement before the floor, and its sd. */
  mu: number;
  sd: number;
  recentPossessions: number;
  projPossessions: number;
  realPossessions: number;
  /** Dollars per win for this row, to report misses in wins. */
  winPrice: number;
};
export type ContractRow = {
  anchor: number;
  id: string;
  name: string;
  age: number;
  years: number;
  salary: number;
  predSurplus: number;
  low: number;
  high: number;
  realSurplus: number;
};

export function evaluateAnchor(
  inputs: ContractValueInputs,
  anchor: number,
  fit: FittedModel,
  /** Dollars are reported at this cap so seasons compare. */
  reportCap: number
) {
  const { histories, salaryBySeason, capFor, lineAt, shareFor } = inputs;
  const lastSalaried = Math.max(
    ...inputs.seasons.map(seasonStartYear).filter((y) => salaryBySeason.has(seasonLabel(y)) && capFor(y))
  );
  const ageAt = (id: string, year: number): number | null => {
    const lines = histories.get(id)?.lines ?? [];
    const known = [...lines].reverse().find((l) => l.age != null && seasonStartYear(l.season) <= year);
    return known?.age != null ? known.age + (year - seasonStartYear(known.season)) : null;
  };
  const years: YearRow[] = [];
  const contracts: ContractRow[] = [];
  const anchorCap = capFor(anchor)!;
  const market = {
    pricePerWinShare: fit.pricePerWinShare,
    minimumShare: anchorCap.minimum / anchorCap.cap,
    maxShare: MAX_SHARE,
  };
  for (const [id, h] of histories) {
    const known = h.lines.filter((l) => seasonStartYear(l.season) <= anchor);
    const base = baseRate(known, anchor, fit.params);
    const age = ageAt(id, anchor);
    if (!base || base.recentPossessions < MIN_RECENT_POSSESSIONS || age == null) continue;
    const targets: number[] = [];
    for (let y = anchor + 1; y <= Math.min(anchor + MAX_HORIZON, lastSalaried); y++) {
      if (shareFor(id, y) == null) break;
      targets.push(y);
    }
    if (!targets.length) continue;
    const shares = new Map(targets.map((y) => [y, shareFor(id, y)!]));
    const proj = projectSeasons(known, anchor, age, targets, shares, fit.params);
    if (!proj) continue;
    const input: ContractYearInput[] = targets.map((y) => ({
      season: seasonLabel(y),
      salary: shares.get(y)! * reportCap,
      cap: reportCap,
      option: null,
      notGuaranteed: false,
    }));
    const value = valueContract(input, proj, market);
    const anchorLine = lineAt(id, anchor);
    const carryWins = anchorLine
      ? Math.max(0, anchorLine.war1 - fit.replacementRate * anchorLine.possessions)
      : 0;
    let realTotal = 0;
    value.years.forEach((v, i) => {
      const y = targets[i];
      const line = lineAt(id, y);
      const wins = line ? Math.max(0, line.war1 - fit.replacementRate * line.possessions) : 0;
      const minimum = market.minimumShare * reportCap;
      const realWorth = minimum + wins * market.pricePerWinShare * reportCap;
      realTotal += realWorth - v.salary;
      years.push({
        anchor,
        horizon: y - anchor,
        id,
        name: h.name,
        age: age + (y - anchor),
        share: shares.get(y)!,
        predWorth: v.worth,
        worthLow: v.worthLow,
        worthHigh: v.worthHigh,
        predSurplus: v.surplus,
        realWorth,
        realSurplus: realWorth - v.salary,
        carryWorth: minimum + carryWins * market.pricePerWinShare * reportCap,
        predWins: v.wins,
        realWins: wins,
        played: line != null,
        mu: proj[i].wins,
        sd: proj[i].sd,
        recentPossessions: base.recentPossessions,
        projPossessions: proj[i].possessions,
        realPossessions: line?.possessions ?? 0,
        winPrice: market.pricePerWinShare * reportCap,
      });
    });
    contracts.push({
      anchor,
      id,
      name: h.name,
      age,
      years: targets.length,
      salary: value.totalSalary,
      predSurplus: value.surplus,
      low: value.surplusLow,
      high: value.surplusHigh,
      realSurplus: realTotal,
    });
  }
  return { years, contracts };
}

// ---- Stats helpers
export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export function corr(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  });
  return sxy / Math.sqrt(sxx * syy);
}
export const ranks = (xs: number[]) => {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  order.forEach(([, i], k) => (r[i] = k));
  return r;
};
export const spearman = (xs: number[], ys: number[]) => corr(ranks(xs), ranks(ys));
export const rmse = (xs: number[], ys: number[]) => Math.sqrt(mean(xs.map((x, i) => (x - ys[i]) ** 2)));
export const M = (n: number) => Number((n / 1e6).toFixed(2));
export const r3 = (n: number) => Number(n.toFixed(3));

const Z = Array.from({ length: 200 }, (_, i) => normalQuantile((i + 0.5) / 200));
/** Continuous ranked probability score of the floored-wins forecast, in wins. */
export function crps(r: YearRow): number {
  const draws = Z.map((z) => Math.max(0, r.mu + r.sd * z)).sort((a, b) => a - b);
  const n = draws.length;
  let e1 = 0;
  let e2 = 0;
  draws.forEach((x, i) => {
    e1 += Math.abs(x - r.realWins);
    e2 += x * (2 * i - n + 1);
  });
  return e1 / n - e2 / (n * n);
}

export function summarize(rows: YearRow[], reportCap: number) {
  const pred = rows.map((r) => r.predSurplus);
  const real = rows.map((r) => r.realSurplus);
  const carry = rows.map((r) => r.carryWorth - r.share * reportCap);
  const winsErr = rows.map((r) => (r.predWorth - r.realWorth) / r.winPrice);
  const carryErr = rows.map((r) => (r.carryWorth - r.realWorth) / r.winPrice);
  return {
    n: rows.length,
    rmseWins: r3(Math.sqrt(mean(winsErr.map((e) => e * e)))),
    rmseWinsCarry: r3(Math.sqrt(mean(carryErr.map((e) => e * e)))),
    biasWins: r3(mean(winsErr)),
    crps: r3(mean(rows.map(crps))),
    meanPred: M(mean(pred)),
    meanReal: M(mean(real)),
    rmseModel: M(rmse(pred, real)),
    rmseCarry: M(rmse(carry, real)),
    rmseMarket: M(rmse(pred.map(() => 0), real)),
    corrModel: r3(corr(pred, real)),
    corrCarry: r3(corr(carry, real)),
    spearmanModel: r3(spearman(pred, real)),
    spearmanCarry: r3(spearman(carry, real)),
    coverage80: r3(mean(rows.map((r) => (r.realWorth >= r.worthLow - 1 && r.realWorth <= r.worthHigh + 1 ? 1 : 0)))),
    belowLow: r3(mean(rows.map((r) => (r.realWorth < r.worthLow - 1 ? 1 : 0)))),
    aboveHigh: r3(mean(rows.map((r) => (r.realWorth > r.worthHigh + 1 ? 1 : 0)))),
  };
}


/**
 * Refit as of every past season that leaves salaries to check against, and
 * summarize misses one and two seasons out.
 */
export function outOfSample(inputs: ContractValueInputs, reportCap: number) {
  const starts = inputs.seasons.map(seasonStartYear);
  const lastSalaried = Math.max(
    ...starts.filter((y) => inputs.salaryBySeason.has(seasonLabel(y)) && inputs.capFor(y))
  );
  const fits = new Map<number, FittedModel>();
  for (let a = starts[0] + 1; a < lastSalaried; a++) {
    const fit = fitModel(inputs, a);
    // Two seasons are too few to fit playing time (no season-before-last).
    if (Object.values(fit.possessions).every((v) => typeof v !== "number" || Number.isFinite(v))) fits.set(a, fit);
  }
  const runs = [...fits].map(([a, fit]) => evaluateAnchor(inputs, a, fit, reportCap));
  const years = runs.flatMap((r) => r.years);
  return { fits, anchors: [...fits.keys()], lastSalaried, years, contracts: runs.flatMap((r) => r.contracts) };
}
