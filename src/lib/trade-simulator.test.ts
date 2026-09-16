/**
 * Run: npx tsx --test src/lib/trade-simulator.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizePlayerTrade,
  type TradeSimTeam,
} from "./trade-simulator";

function team(id: string, players: TradeSimTeam["players"]): TradeSimTeam {
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
      { id: "a1", name: "A", href: "/players/a1", salary: 20_000_000, drbl100: 2 },
    ]),
    ["a1"],
    team("B", [
      { id: "b1", name: "B", href: "/players/b1", salary: 12_000_000, drbl100: -1 },
    ]),
    ["b1"]
  );
  assert.equal(sketch.completeSalary, true);
  assert.equal(sketch.sideA.salaryNet, -8_000_000);
  assert.equal(sketch.sideA.knownCommitmentsAfter, 12_000_000);
  assert.equal(sketch.sideA.drblNet, -3);
  assert.equal("legal" in sketch, false);
});

test("does not invent a salary total when a moved player has no salary", () => {
  const sketch = summarizePlayerTrade(
    team("A", [
      { id: "a1", name: "A", href: null, salary: null, drbl100: 1 },
    ]),
    ["a1"],
    team("B", [
      { id: "b1", name: "B", href: null, salary: 5_000_000, drbl100: 1 },
    ]),
    ["b1"]
  );
  assert.equal(sketch.completeSalary, false);
  assert.equal(sketch.sideA.knownCommitmentsAfter, null);
  assert.equal(sketch.sideB.knownCommitmentsAfter, null);
});

test("does not sum impact when a moved player has no DRBL row", () => {
  const sketch = summarizePlayerTrade(
    team("A", [
      { id: "a1", name: "A", href: null, salary: 1, drbl100: null },
    ]),
    ["a1"],
    team("B", [
      { id: "b1", name: "B", href: null, salary: 1, drbl100: 4 },
    ]),
    ["b1"]
  );
  assert.equal(sketch.completeImpact, false);
  assert.equal(sketch.sideA.drblNet, null);
});
