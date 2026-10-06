/**
 * Contract surplus model: option handling, replacement floor, projections and
 * the baked snapshot's shape.
 * Run: npx tsx scripts/test-contract-value.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  agingDelta,
  normalQuantile,
  priorRate,
  projectSeasons,
  valueContract,
  weightedLeastSquares,
  type ContractYearInput,
  type ProjectionParams,
} from "../src/contracts/value-model";

const CAP = 100_000_000;
const market = { pricePerWinShare: 0.1, minimumShare: 0.01, maxShare: 0.35 };
const year = (overrides: Partial<ContractYearInput> = {}): ContractYearInput => ({
  season: "2026-27",
  salary: 20_000_000,
  cap: CAP,
  option: null,
  notGuaranteed: false,
  ...overrides,
});
const proj = (wins: number, sd: number) => [{ season: "2026-27", possessions: 8000, wins, sd }];

function testNormalQuantile() {
  assert.ok(Math.abs(normalQuantile(0.5)) < 1e-9);
  assert.ok(Math.abs(normalQuantile(0.9) - 1.2816) < 1e-3);
  assert.ok(Math.abs(normalQuantile(0.01) + 2.3263) < 1e-3);
}

function testCertainValue() {
  // 3 wins × $10M + $1M minimum = $31M worth against $20M salary.
  const v = valueContract([year()], proj(3, 0.0001), market);
  assert.ok(Math.abs(v.years[0].worth - 31_000_000) < 10_000);
  assert.ok(Math.abs(v.surplus - 11_000_000) < 10_000);
  assert.equal(v.years[0].worthAboveMax, false);
}

function testReplacementFloor() {
  const v = valueContract([year()], proj(-5, 0.0001), market);
  assert.ok(Math.abs(v.years[0].worth - 1_000_000) < 1, "worth never drops below the minimum");
}

function testOptions() {
  const good = proj(3, 1);
  const bad = proj(0.5, 1);
  const player = valueContract([year({ option: "player" })], good, market);
  assert.ok(player.surplus <= 0, "player option keeps only the downside");
  const team = valueContract([year({ option: "team" })], bad, market);
  assert.ok(team.surplus >= 0, "team option keeps only the upside");
  const cut = valueContract([year({ notGuaranteed: true })], bad, market);
  assert.ok(cut.surplus >= 0, "non-guaranteed year keeps only the upside");
  const plain = valueContract([year()], bad, market);
  assert.ok(plain.surplus < team.surplus);
}

function testRangeOrder() {
  const v = valueContract([year(), year({ season: "2027-28" })], [
    ...proj(2, 1),
    { season: "2027-28", possessions: 8000, wins: 2, sd: 1.2 },
  ], market);
  assert.ok(v.surplusLow < v.surplus && v.surplus < v.surplusHigh);
  for (const y of v.years) assert.ok(y.worthLow <= y.worth && y.worth <= y.worthHigh);
}

function testAboveMax() {
  const v = valueContract([year({ salary: 35_000_000 })], proj(5, 0.0001), market);
  assert.equal(v.years[0].worthAboveMax, true);
}

function testWeightedLeastSquares() {
  const rows = [[1, 0], [1, 1], [1, 2], [1, 3]];
  const [a, b] = weightedLeastSquares(rows, [1, 3, 5, 7], [1, 1, 1, 1]);
  assert.ok(Math.abs(a - 1) < 1e-9 && Math.abs(b - 2) < 1e-9);
}

const params: ProjectionParams = {
  weights: [3, 2, 1],
  regressionPossessions: 10_000,
  leagueRate: 0.00004,
  replacementRate: -0.00004,
  aging: { intercept: 0.0002, slope: -0.0000075, min: -0.0003, max: 0.0002 },
  possessions: {
    intercept: 500,
    last: 0.55,
    prior: 0.05,
    agePenalty: -200,
    ageKnee: 30,
    salaryShare: 5000,
    salaryShareLow: 30000,
    lowShareCap: 0.05,
    bounce: 0.05,
    max: 12_000,
  },
  errorByHorizon: [{ base: 0.2, perK: 0.15 }, { base: 0.1, perK: 0.2 }],
};

function testProjection() {
  const history = [
    { season: "2023-24", possessions: 9000, war1: 4, age: 25 },
    { season: "2024-25", possessions: 9000, war1: 5, age: 26 },
    { season: "2025-26", possessions: 9000, war1: 6, age: 27 },
  ];
  const shares = new Map([[2026, 0.3], [2027, 0.3], [2028, 0.3]]);
  const out = projectSeasons(history, 2025, 27, [2026, 2027, 2028], shares, params);
  assert.ok(out && out.length === 3);
  assert.deepEqual(out.map((p) => p.season), ["2026-27", "2027-28", "2028-29"]);
  const rawRate = (3 * 6 + 2 * 5 + 4) / (6 * 9000);
  const firstRate = out[0].wins / out[0].possessions + params.replacementRate;
  assert.ok(firstRate < rawRate, "regression pulls a strong player toward average");
  assert.ok(out[2].sd > out[0].sd, "uncertainty grows with horizon");
  assert.equal(projectSeasons([], 2025, 27, [2026], shares, params), null);

  const older = projectSeasons(
    history.map((l) => ({ ...l, age: (l.age ?? 0) + 8 })),
    2025,
    35,
    [2026],
    shares,
    params
  )!;
  assert.ok(older[0].wins < out[0].wins, "age lowers the projection");
  assert.ok(agingDelta(params.aging, 40) >= params.aging.min);
}

function testSalaryPrior() {
  const withPrior: ProjectionParams = {
    ...params,
    priorByShare: { intercept: 0, slope: 0.002, maxShare: 0.35 },
  };
  assert.equal(priorRate(params, 0.3), params.leagueRate, "no prior falls back to league average");
  assert.equal(priorRate(withPrior, null), params.leagueRate, "unknown salary falls back to league average");
  assert.ok(Math.abs(priorRate(withPrior, 0.5) - 0.002 * 0.35) < 1e-12, "salary is capped at the max share");
  const thin = [{ season: "2025-26", possessions: 1000, war1: 0, age: 27 }];
  const rich = projectSeasons(thin, 2025, 27, [2026], new Map([[2026, 0.3]]), withPrior)![0];
  const cheap = projectSeasons(thin, 2025, 27, [2026], new Map([[2026, 0.02]]), withPrior)![0];
  assert.ok(
    rich.wins / rich.possessions > cheap.wins / cheap.possessions,
    "a thin history leans on what his salary says"
  );
}

function testSnapshot() {
  const file = path.join(process.cwd(), "src/data/runtime/contract-value-snapshot.json");
  type SnapEntry = { reason?: string; surplus?: number; low: number; high: number; pct: number; years: unknown[] };
  const snap = JSON.parse(readFileSync(file, "utf8")) as {
    model: {
      pricePerWinShare: number;
      contracts: number;
      backtest: Array<{ coverage80: number }>;
      outOfSample: { byHorizon: Array<{ horizon: number; rmseWins: number; repeatRmseWins: number; aboveHigh: number }> };
    };
    players: Record<string, SnapEntry>;
  };
  assert.ok(snap.model.pricePerWinShare > 0 && snap.model.pricePerWinShare < 0.5);
  assert.ok(snap.model.backtest.every((b) => b.coverage80 > 0.7 && b.coverage80 < 0.9));
  const next = snap.model.outOfSample.byHorizon.find((b) => b.horizon === 1);
  assert.ok(next, "out-of-sample check ran");
  assert.ok(next.rmseWins < next.repeatRmseWins, "beats repeating last season out of sample");
  assert.ok(next.aboveHigh > 0.05 && next.aboveHigh < 0.2, "top of the range is roughly a 90th percentile");
  const valued = Object.values(snap.players).filter((p) => "surplus" in p);
  assert.equal(valued.length, snap.model.contracts);
  for (const p of valued) {
    assert.ok(p.pct >= 0 && p.pct <= 100);
    assert.ok(p.low <= p.high);
    assert.ok(p.years.length > 0);
  }
  for (const [key, p] of Object.entries(snap.players)) {
    assert.match(key, /^\d+:[a-z0-9.'-]+$/);
    if (p.reason !== undefined) assert.ok(["no-drbl", "thin", "waived"].includes(p.reason));
  }
}

testNormalQuantile();
testCertainValue();
testReplacementFloor();
testOptions();
testRangeOrder();
testAboveMax();
testWeightedLeastSquares();
testProjection();
testSalaryPrior();
testSnapshot();
console.log("contract-value: ok");
