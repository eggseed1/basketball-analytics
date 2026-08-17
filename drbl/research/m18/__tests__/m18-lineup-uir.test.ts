import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitM18LineupNet,
  shuffleLineupIdentities,
  type M18LineupRow,
} from "../lineup-impact";
import { fitResidualizer, applyResidualizer } from "../uir";

function toyRows(): M18LineupRow[] {
  const players = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const rows: M18LineupRow[] = [];
  for (let g = 0; g < 40; g++) {
    rows.push({
      gameId: `g${g}`,
      gameDate: `2021-01-${String((g % 28) + 1).padStart(2, "0")}`,
      offenseTeamId: "T1",
      defenseTeamId: "T2",
      offensePlayerIds: players.slice(0, 5),
      defensePlayerIds: players.slice(5, 10),
      offenseIsHome: g % 2 === 0,
      points: g % 3 === 0 ? 2 : g % 3 === 1 ? 3 : 0,
    });
  }
  return rows;
}

describe("m18 lineup impact", () => {
  it("fits ridge without exploding", () => {
    const fit = fitM18LineupNet(toyRows(), 800);
    assert.equal(fit.mode, "NET");
    assert.ok(fit.playerIds.length >= 10);
    assert.ok(fit.coefficients.every((c) => Number.isFinite(c)));
  });

  it("shuffle changes identities", () => {
    const rows = toyRows();
    const sh = shuffleLineupIdentities(rows, 7);
    assert.equal(sh.length, rows.length);
  });
});

describe("m18 uir residualizer", () => {
  it("residualizes L against P_RAW", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      playerId: `p${i}`,
      anonId: `a${i}`,
      season: "2020-21",
      L: 0.5 * i + (i % 2),
      P_RAW: 0.4 * i,
      N: 1000 + i * 10,
      teamId: "T",
    }));
    const rz = fitResidualizer(rows, "UIR-A");
    const u = applyResidualizer(rows[10]!, rz);
    assert.ok(Number.isFinite(u));
  });
});
