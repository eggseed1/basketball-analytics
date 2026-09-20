/**
 * Run: npx tsx --test src/lib/trade-simulator.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  knownSalaryLine,
  summarizePlayerTrade,
  type TradeSimPlayer,
  type TradeSimTeam,
} from "./trade-simulator";

const LINES = {
  salaryCap: 100,
  luxuryTax: 120,
  firstApron: 130,
  secondApron: 140,
};

function player(
  partial: Pick<TradeSimPlayer, "id" | "salary" | "drbl100"> &
    Partial<TradeSimPlayer>
): TradeSimPlayer {
  return {
    name: partial.id,
    href: null,
    drblO: null,
    drblD: null,
    war1: null,
    position: null,
    age: null,
    games: null,
    mpg: null,
    points: null,
    ts: null,
    usg: null,
    bpm: null,
    ...partial,
  };
}

function team(id: string, players: TradeSimPlayer[]): TradeSimTeam {
  return {
    id,
    abbr: id,
    name: id,
    knownCommitments: players.reduce((sum, player) => sum + (player.salary ?? 0), 0),
    playersWithoutSalary: players.filter((player) => player.salary == null).length,
    players,
  };
}

test("swaps known salaries and model impact without a legality flag", () => {
  const sketch = summarizePlayerTrade(
    team("A", [
      player({ id: "a1", name: "A", href: "/players/a1", salary: 20_000_000, drbl100: 2, war1: 4 }),
    ]),
    ["a1"],
    team("B", [
      player({ id: "b1", name: "B", href: "/players/b1", salary: 12_000_000, drbl100: -1, war1: 1 }),
    ]),
    ["b1"],
    LINES
  );
  assert.equal(sketch.completeSalary, true);
  assert.equal(sketch.sideA.salaryNet, -8_000_000);
  assert.equal(sketch.sideA.knownCommitmentsAfter, 12_000_000);
  assert.equal(sketch.sideA.drblNet, -3);
  assert.equal(sketch.sideA.war1Net, -3);
  assert.equal("legal" in sketch, false);
});

test("does not invent a salary total when a moved player has no salary", () => {
  const sketch = summarizePlayerTrade(
    team("A", [
      player({ id: "a1", salary: null, drbl100: 1 }),
    ]),
    ["a1"],
    team("B", [
      player({ id: "b1", salary: 5_000_000, drbl100: 1 }),
    ]),
    ["b1"],
    LINES
  );
  assert.equal(sketch.completeSalary, false);
  assert.equal(sketch.sideA.knownCommitmentsAfter, null);
  assert.equal(sketch.sideB.knownCommitmentsAfter, null);
});

test("does not sum impact when a moved player has no DRBL row", () => {
  const sketch = summarizePlayerTrade(
    team("A", [
      player({ id: "a1", salary: 1, drbl100: null }),
    ]),
    ["a1"],
    team("B", [
      player({ id: "b1", salary: 1, drbl100: 4 }),
    ]),
    ["b1"],
    LINES
  );
  assert.equal(sketch.completeImpact, false);
  assert.equal(sketch.sideA.drblNet, null);
  assert.equal(sketch.sideA.war1Net, null);
});

test("places known commitments against published lines without calling it legal", () => {
  assert.equal(knownSalaryLine(90, LINES), "under cap");
  assert.equal(knownSalaryLine(110, LINES), "over cap, under tax");
  assert.equal(knownSalaryLine(125, LINES), "over tax, under first apron");
  assert.equal(knownSalaryLine(135, LINES), "over first apron, under second apron");
  assert.equal(knownSalaryLine(150, LINES), "over second apron");
});
