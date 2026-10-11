import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AnchoredLineupPossession } from "../anchored-lineup";
import {
  BOX_PRIOR_CONFIG,
  BOX_PRIOR_FEATURES,
  addBoxScoreToTotals,
  attachBoxPrior,
  boxPriorFeatures,
  fitBoxPrior,
  shrinkTowardBoxPrior,
  type BoxPriorTotals,
} from "../box-prior";
import type { DrblBoxPlayer } from "../../types";

function line(playerId: string, partial: Partial<DrblBoxPlayer> = {}): DrblBoxPlayer {
  return {
    playerId,
    playerName: playerId,
    teamId: "T",
    starter: false,
    minutes: 24,
    points: 10,
    fieldGoalsMade: 4,
    fieldGoalsAttempted: 9,
    threePointersMade: 1,
    threePointersAttempted: 3,
    freeThrowsMade: 1,
    freeThrowsAttempted: 2,
    offensiveRebounds: 1,
    defensiveRebounds: 3,
    rebounds: 4,
    assists: 2,
    steals: 1,
    blocks: 0,
    turnovers: 1,
    personalFouls: 2,
    ...partial,
  };
}

const STEALS = BOX_PRIOR_FEATURES.indexOf("stealsPer100");
const PLAYERS = Array.from({ length: 20 }, (_, i) => `p${i}`);

/** Steal rate varies by player and each steal point is worth `edge` points per possession on court. */
function synthetic(edge: number, possessions = 20_000) {
  const totals: BoxPriorTotals = new Map();
  const steals = new Map(PLAYERS.map((id, i) => [id, i % 4]));
  for (let g = 0; g < 40; g++) addBoxScoreToTotals(totals, PLAYERS.map((id) => line(id, { steals: steals.get(id)! })));
  const rows: AnchoredLineupPossession[] = [];
  const appearances = new Map<string, number>();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < possessions; k++) {
    const pick = () => {
      const s = new Set<string>();
      while (s.size < 5) s.add(PLAYERS[Math.floor(rnd() * PLAYERS.length)]!);
      return [...s];
    };
    const off = pick();
    const def = pick().filter((id) => !off.includes(id));
    while (def.length < 5) {
      const id = PLAYERS[Math.floor(rnd() * PLAYERS.length)]!;
      if (!off.includes(id) && !def.includes(id)) def.push(id);
    }
    const s = off.reduce((a, id) => a + steals.get(id)!, 0) - def.reduce((a, id) => a + steals.get(id)!, 0);
    for (const id of [...off, ...def]) appearances.set(id, (appearances.get(id) ?? 0) + 1);
    rows.push({ offenseIsHome: k % 2 === 0, offensePlayerIds: off, defensePlayerIds: def, points: 1 + edge * s });
  }
  return { totals, rows, appearances };
}

describe("box prior", () => {
  it("skips DNP lines and counts games and starts", () => {
    const totals: BoxPriorTotals = new Map();
    addBoxScoreToTotals(totals, [
      line("a", { starter: true }),
      line("b", { minutes: 0, points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, threePointersMade: 0, threePointersAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, personalFouls: 0 }),
    ]);
    addBoxScoreToTotals(totals, [line("a")]);
    assert.equal(totals.has("b"), false);
    assert.deepEqual({ games: totals.get("a")!.games, starts: totals.get("a")!.starts, minutes: totals.get("a")!.minutes }, { games: 2, starts: 1, minutes: 48 });
  });

  it("standardizes features to a possession-weighted mean of 0", () => {
    const { totals, appearances } = synthetic(0, 2000);
    const f = boxPriorFeatures(totals, appearances);
    let sum = 0;
    let w = 0;
    for (const [id, z] of f) {
      const off = appearances.get(id)! / 2;
      sum += off * z[STEALS]!;
      w += off;
    }
    assert.ok(Math.abs(sum / w) < 1e-9);
  });

  it("learns a positive weight for a box stat that moves the scoreboard", () => {
    const { totals, rows, appearances } = synthetic(0.05);
    const fit = fitBoxPrior(rows, boxPriorFeatures(totals, appearances));
    assert.ok(fit);
    assert.ok(fit.weightsPer100[STEALS]! > 1, String(fit.weightsPer100[STEALS]));
    assert.ok(fit.ratingsPer100.get("p3")! > fit.ratingsPer100.get("p0")!);
  });

  it("refuses to fit on too few possessions", () => {
    const { totals, rows, appearances } = synthetic(0.05, 500);
    assert.equal(fitBoxPrior(rows, boxPriorFeatures(totals, appearances)), null);
  });

  it("weights DRBL-P by N/(N+K) and falls back to the box rating without it", () => {
    const out = shrinkTowardBoxPrior(
      new Map([["a", 1]]),
      new Map([["a", 3200]]),
      new Map([["a", 2], ["b", 1], ["c", 0]])
    );
    const target = BOX_PRIOR_CONFIG.boxScale;
    assert.equal(out.get("a"), 0.5 * 1 + 0.5 * 2 * target);
    assert.equal(out.get("b"), target);
    assert.equal(out.has("z"), false);
  });

  it("leaves rows absent, never 0, when the fit is unavailable", () => {
    const rows = attachBoxPrior([{ playerId: "a", rawAbilityRate: 1, possessions: 100, drblBox100: 5 }], null);
    assert.equal("drblBox100" in rows[0]!, false);
  });
});
