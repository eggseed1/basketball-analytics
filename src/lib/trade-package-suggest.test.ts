/**
 * Run: npx tsx --test src/lib/trade-package-suggest.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { suggestMatchingPackages } from "./trade-package-suggest";
import { salaryFitTrade } from "./trade-salary-matching";
import type { TradeSimPlayer, TradeSimTeam } from "./trade-simulator";

const LINES = {
  salaryCap: 140_588_000,
  luxuryTax: 170_814_000,
  firstApron: 178_132_000,
  secondApron: 188_931_000,
};

function player(
  partial: Pick<TradeSimPlayer, "id" | "salary"> & Partial<TradeSimPlayer>
): TradeSimPlayer {
  return {
    name: partial.name ?? partial.id,
    href: null,
    drbl100: partial.drbl100 ?? 0,
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
    playersWithoutSalary: 0,
    players,
  };
}

test("returns salary-fitting packages for a seeded player", () => {
  const teamA = team("A", 150_000_000, [
    player({ id: "a1", name: "Star", salary: 30_000_000, drbl100: 4 }),
    player({ id: "a2", name: "Filler", salary: 8_000_000, drbl100: 0.5 }),
    player({ id: "a3", name: "Bench", salary: 4_000_000, drbl100: 0 }),
  ]);
  const teamB = team("B", 150_000_000, [
    player({ id: "b1", name: "Match", salary: 28_000_000, drbl100: 2 }),
    player({ id: "b2", name: "Role", salary: 12_000_000, drbl100: 1 }),
    player({ id: "b3", name: "Cheap", salary: 5_000_000, drbl100: 0.2 }),
    player({ id: "b4", name: "Mid", salary: 18_000_000, drbl100: 1.5 }),
  ]);

  const rows = suggestMatchingPackages({
    teamA,
    teamB,
    sendA: ["a1"],
    sendB: [],
    lines: LINES,
    seedSide: "a",
    limit: 6,
  });

  assert.ok(rows.length > 0);
  for (const row of rows) {
    const fit = salaryFitTrade(
      teamA,
      row.sendA,
      teamB,
      row.sendB,
      LINES
    );
    assert.equal(fit.ok, true);
    assert.ok(row.sendA.includes("a1"));
  }
});

test("returns empty when no seed players selected", () => {
  const teamA = team("A", 150_000_000, [
    player({ id: "a1", salary: 10_000_000 }),
  ]);
  const teamB = team("B", 150_000_000, [
    player({ id: "b1", salary: 10_000_000 }),
  ]);
  const rows = suggestMatchingPackages({
    teamA,
    teamB,
    sendA: [],
    sendB: [],
    lines: LINES,
  });
  assert.equal(rows.length, 0);
});

test("second-apron seed does not aggregate fillers", () => {
  const teamA = team("A", LINES.secondApron!, [
    player({ id: "a1", salary: 20_000_000, drbl100: 3 }),
    player({ id: "a2", salary: 15_000_000, drbl100: 1 }),
  ]);
  const teamB = team("B", 150_000_000, [
    player({ id: "b1", salary: 20_000_000, drbl100: 2 }),
    player({ id: "b2", salary: 10_000_000, drbl100: 1 }),
    player({ id: "b3", salary: 35_000_000, drbl100: 4 }),
  ]);

  const rows = suggestMatchingPackages({
    teamA,
    teamB,
    sendA: ["a1"],
    sendB: [],
    lines: LINES,
    seedSide: "a",
  });

  for (const row of rows) {
    assert.equal(row.sendA.length, 1);
    assert.ok(row.sendA.includes("a1"));
    assert.equal(
      salaryFitTrade(teamA, row.sendA, teamB, row.sendB, LINES).ok,
      true
    );
  }
});
