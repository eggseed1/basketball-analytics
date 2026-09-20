/**
 * Run: npx tsx --test src/lib/trade-salary-matching.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CAP_BASELINE_2024_25,
  EXPANDED_PAD_BASELINE_2024_25,
  expandedPadForCap,
  maxIncomingSalary,
  salaryFitForSide,
  salaryFitTrade,
  teamSalaryBand,
} from "./trade-salary-matching";
import type { TradeSimPlayer, TradeSimTeam } from "./trade-simulator";

const LINES_2425 = {
  salaryCap: CAP_BASELINE_2024_25,
  luxuryTax: 170_814_000,
  firstApron: 178_132_000,
  secondApron: 188_931_000,
};

function player(
  partial: Pick<TradeSimPlayer, "id" | "salary"> & Partial<TradeSimPlayer>
): TradeSimPlayer {
  return {
    name: partial.id,
    href: null,
    drbl100: partial.drbl100 ?? null,
    drblO: null,
    drblD: null,
    war1: null,
    position: null,
    age: null,
    games: null,
    mpg: null,
    points: null,
    assists: null,
    rebounds: null,
    steals: null,
    blocks: null,
    ts: null,
    usg: null,
    bpm: null,
    ...partial,
  };
}

function team(
  id: string,
  knownCommitments: number,
  players: TradeSimPlayer[]
): TradeSimTeam {
  return {
    id,
    abbr: id,
    name: id,
    knownCommitments,
    playersWithoutSalary: players.filter((row) => row.salary == null).length,
    players,
  };
}

test("indexes Expanded pad with the salary cap", () => {
  assert.equal(expandedPadForCap(CAP_BASELINE_2024_25), EXPANDED_PAD_BASELINE_2024_25);
  const next = expandedPadForCap(154_647_000);
  assert.ok(next > EXPANDED_PAD_BASELINE_2024_25);
  assert.equal(
    next,
    Math.round(EXPANDED_PAD_BASELINE_2024_25 * (154_647_000 / CAP_BASELINE_2024_25))
  );
});

test("classifies team salary bands from known commitments", () => {
  assert.equal(teamSalaryBand(100_000_000, LINES_2425), "underCap");
  assert.equal(teamSalaryBand(150_000_000, LINES_2425), "belowFirstApron");
  assert.equal(teamSalaryBand(180_000_000, LINES_2425), "belowSecondApron");
  assert.equal(teamSalaryBand(190_000_000, LINES_2425), "secondApron");
});

test("Expanded: Tre Mann-style small outgoing uses 200% + $250k", () => {
  const out = 3_191_400;
  const max = maxIncomingSalary({
    outgoing: out,
    band: "belowFirstApron",
    knownCommitments: 150_000_000,
    lines: LINES_2425,
  });
  assert.equal(max.mechanism, "expanded");
  assert.equal(max.max, 2 * out + 250_000);
  assert.equal(max.max, 6_632_800);
});

test("Expanded: mid outgoing uses Out + pad when tighter than 200%", () => {
  const out = 9_450_000;
  const pad = EXPANDED_PAD_BASELINE_2024_25;
  const max = maxIncomingSalary({
    outgoing: out,
    band: "belowFirstApron",
    knownCommitments: 150_000_000,
    lines: LINES_2425,
  });
  // min(2*Out+250k, Out+pad) = Out+pad; max with 1.25*Out+250k
  const expected = Math.max(
    Math.min(2 * out + 250_000, out + pad),
    1.25 * out + 250_000
  );
  assert.equal(max.max, expected);
  assert.equal(max.max, out + pad);
});

test("first-apron Standard cannot take Out + 1 when cushion zeroed", () => {
  const out = 10_000_000;
  const teamRow = team("A", 180_000_000, [
    player({ id: "a1", salary: out }),
  ]);
  const fit = salaryFitForSide({
    team: teamRow,
    outgoingPlayers: [player({ id: "a1", salary: out })],
    incomingPlayers: [player({ id: "b1", salary: out + 1 })],
    lines: LINES_2425,
  });
  assert.equal(fit.ok, false);
  assert.equal(fit.mechanism, "standard");
});

test("first-apron Standard allows Out + $250k when post-trade stays at/under first apron", () => {
  // Pre-trade just over first apron; taking back Out keeps commitments flat
  const out = 10_000_000;
  const known = LINES_2425.firstApron! + 1_000_000;
  const teamRow = team("A", known, [player({ id: "a1", salary: out })]);
  const fitOk = salaryFitForSide({
    team: teamRow,
    outgoingPlayers: [player({ id: "a1", salary: out })],
    incomingPlayers: [player({ id: "b1", salary: out })],
    lines: LINES_2425,
  });
  assert.equal(fitOk.ok, true);

  const fitCushion = salaryFitForSide({
    team: teamRow,
    outgoingPlayers: [player({ id: "a1", salary: out })],
    incomingPlayers: [player({ id: "b1", salary: out + 250_000 })],
    lines: LINES_2425,
  });
  // post = known - out + (out+250k) = known + 250k, still over first apron → cushion 0
  // so Out+250k should fail when already over first apron
  assert.equal(fitCushion.ok, false);
});

test("second apron rejects aggregation and accepts 1:1 at 100%", () => {
  const known = LINES_2425.secondApron!;
  const a1 = player({ id: "a1", salary: 8_000_000 });
  const a2 = player({ id: "a2", salary: 7_000_000 });
  const b1 = player({ id: "b1", salary: 15_000_000 });
  const teamRow = team("A", known, [a1, a2]);

  const aggregated = salaryFitForSide({
    team: teamRow,
    outgoingPlayers: [a1, a2],
    incomingPlayers: [b1],
    lines: LINES_2425,
  });
  assert.equal(aggregated.ok, false);
  assert.ok(
    aggregated.reasons.some((reason) => reason.includes("aggregate"))
  );

  const oneToOne = salaryFitForSide({
    team: teamRow,
    outgoingPlayers: [a1],
    incomingPlayers: [player({ id: "b2", salary: 8_000_000 })],
    lines: LINES_2425,
  });
  assert.equal(oneToOne.ok, true);
  assert.equal(oneToOne.mechanism, "secondApron");

  const over = salaryFitForSide({
    team: teamRow,
    outgoingPlayers: [a1],
    incomingPlayers: [player({ id: "b3", salary: 8_000_001 })],
    lines: LINES_2425,
  });
  assert.equal(over.ok, false);
});

test("under-cap room path allows incoming up to room + $250k", () => {
  const known = 100_000_000;
  const room = LINES_2425.salaryCap - known;
  const teamRow = team("A", known, [
    player({ id: "a1", salary: 5_000_000 }),
  ]);
  const fit = salaryFitForSide({
    team: teamRow,
    outgoingPlayers: [],
    incomingPlayers: [player({ id: "b1", salary: room + 250_000 })],
    lines: LINES_2425,
  });
  assert.equal(fit.ok, true);
  assert.equal(fit.mechanism, "room");

  const over = salaryFitForSide({
    team: teamRow,
    outgoingPlayers: [],
    incomingPlayers: [player({ id: "b2", salary: room + 250_001 })],
    lines: LINES_2425,
  });
  assert.equal(over.ok, false);
});

test("salaryFitTrade requires both sides to fit", () => {
  const a = team("A", 150_000_000, [
    player({ id: "a1", salary: 12_000_000, drbl100: 1 }),
  ]);
  const b = team("B", LINES_2425.secondApron!, [
    player({ id: "b1", salary: 10_000_000, drbl100: 2 }),
  ]);
  // B is second apron taking 12M for 10M out — over 100%
  const bad = salaryFitTrade(a, ["a1"], b, ["b1"], LINES_2425);
  assert.equal(bad.ok, false);
  assert.equal(bad.sideB.ok, false);

  const good = salaryFitTrade(
    a,
    ["a1"],
    team("B", 150_000_000, [
      player({ id: "b1", salary: 12_000_000, drbl100: 2 }),
    ]),
    ["b1"],
    LINES_2425
  );
  assert.equal(good.ok, true);
});
