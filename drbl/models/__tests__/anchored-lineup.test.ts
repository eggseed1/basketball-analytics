import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANCHORED_LINEUP_CONFIG,
  addGameToAnchoredLineupInput,
  anchoredPriorFill,
  attachAnchoredLineup,
  createAnchoredLineupInput,
  fitAnchoredLineup,
  type AnchoredLineupInput,
} from "../anchored-lineup";
import type { DrblPossession } from "../../types";

const HOME = ["h1", "h2", "h3", "h4", "h5", "h6", "h7"];
const AWAY = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];

function possession(
  offenseTeamId: string,
  off: string[],
  def: string[],
  points: number
): DrblPossession {
  return {
    gameId: "g",
    possessionId: "p",
    offenseTeamId,
    defenseTeamId: offenseTeamId === "H" ? "A" : "H",
    period: 1,
    startActionNumber: 0,
    endActionNumber: 0,
    startClockSeconds: 0,
    endClockSeconds: 0,
    points,
    endReason: "made_fg",
    offensePlayerIds: off,
    defensePlayerIds: def,
    eventActionNumbers: [],
  };
}

/** Rotating lineups where h1 adds `edge` points per possession on both ends. */
function season(edge: number, games = 40): AnchoredLineupInput {
  const input = createAnchoredLineupInput();
  for (let g = 0; g < games; g++) {
    const poss: DrblPossession[] = [];
    for (let k = 0; k < 200; k++) {
      const home = Array.from({ length: 5 }, (_, j) => HOME[(k + j + g) % HOME.length]!);
      const away = Array.from({ length: 5 }, (_, j) => AWAY[(k * 3 + j + g) % AWAY.length]!);
      const star = home.includes("h1") ? edge : 0;
      if (k % 2 === 0) poss.push(possession("H", home, away, 1 + star));
      else poss.push(possession("A", away, home, Math.max(0, 1 - star)));
    }
    addGameToAnchoredLineupInput(input, "H", poss);
  }
  return input;
}

describe("anchored lineup ridge", () => {
  it("keeps only 5v5 possessions in the fit but counts every appearance", () => {
    const input = createAnchoredLineupInput();
    addGameToAnchoredLineupInput(input, "H", [
      possession("H", HOME.slice(0, 5), AWAY.slice(0, 5), 2),
      possession("H", HOME.slice(0, 4), AWAY.slice(0, 5), 3),
      possession("A", [], HOME.slice(0, 5), 0),
    ]);
    assert.equal(input.rows.length, 1);
    assert.equal(input.rows[0]!.offenseIsHome, true);
    assert.equal(input.appearances.get("h1"), 2);
    assert.equal(input.appearances.get("h5"), 1);
  });

  it("finds a strong player from the scoreboard with no prior", () => {
    const fit = fitAnchoredLineup(season(0.5), new Map(), {
      ...ANCHORED_LINEUP_CONFIG,
      priorWeight: 0,
      lambda: 50,
    });
    const star = fit.ratingsPer100.get("h1")!;
    for (const id of HOME.slice(1)) assert.ok(star > fit.ratingsPer100.get(id)! + 10, id);
  });

  it("returns priorWeight × prior when the scoreboard carries no signal", () => {
    const input = season(0);
    const prior = new Map([...HOME, ...AWAY].map((id) => [id, 0]));
    prior.set("h1", 2);
    const fit = fitAnchoredLineup(input, prior, {
      ...ANCHORED_LINEUP_CONFIG,
      lambda: 1e9,
    });
    assert.ok(Math.abs(fit.ratingsPer100.get("h1")! - 2 * ANCHORED_LINEUP_CONFIG.priorWeight) < 1e-3);
    assert.ok(Math.abs(fit.ratingsPer100.get("h2")!) < 1e-3);
  });

  it("fills low-exposure or unknown priors with the mean of mid-exposure players", () => {
    const appearances = new Map([
      ["mid1", 500],
      ["mid2", 1000],
      ["heavy", 5000],
      ["rare", 20],
    ]);
    const prior = new Map([
      ["mid1", 1],
      ["mid2", 3],
      ["heavy", 10],
      ["rare", -8],
    ]);
    assert.equal(anchoredPriorFill(prior, appearances), 2);
  });

  it("leaves players without a fit value absent, never 0", () => {
    const fit = fitAnchoredLineup(season(0.2, 5), new Map());
    const rows = attachAnchoredLineup(
      [
        { playerId: "h1", drblAnchored100: 99 },
        { playerId: "bench-only", drblAnchored100: 99 },
      ],
      fit
    );
    assert.equal(typeof rows[0]!.drblAnchored100, "number");
    assert.notEqual(rows[0]!.drblAnchored100, 99);
    assert.equal("drblAnchored100" in rows[1]!, false);
  });

  it("is deterministic", () => {
    const prior = new Map([["h1", 1.5]]);
    const a = fitAnchoredLineup(season(0.3, 10), prior);
    const b = fitAnchoredLineup(season(0.3, 10), prior);
    assert.deepEqual([...a.ratingsPer100], [...b.ratingsPer100]);
  });
});
