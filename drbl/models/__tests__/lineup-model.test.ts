import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitLineupRidge,
  predictLineupResidual,
  type LineupPossessionRow,
} from "../lineup-model";
import { fusePlayerRating } from "../fusion";

function row(
  partial: Partial<LineupPossessionRow> &
    Pick<LineupPossessionRow, "offensePlayerIds" | "defensePlayerIds" | "residual">
): LineupPossessionRow {
  return {
    gameId: "g1",
    gameDate: "2024-11-01",
    offenseIsHome: true,
    ...partial,
  };
}

describe("lineup ridge model", () => {
  it("recovers a strong offensive player signal", () => {
    const star = "star";
    // Rotate teammates so the star is uniquely identified (not collinear).
    const benches = [
      ["a", "b", "c", "d"],
      ["b", "c", "d", "e"],
      ["c", "d", "e", "f"],
      ["d", "e", "f", "g"],
    ];
    const foeBenches = [
      ["w", "x", "y", "z", "v"],
      ["x", "y", "z", "v", "u"],
      ["y", "z", "v", "u", "t"],
      ["z", "v", "u", "t", "s"],
    ];
    const rows: LineupPossessionRow[] = [];
    for (let i = 0; i < 80; i++) {
      const mates = benches[i % benches.length]!;
      const foes = foeBenches[i % foeBenches.length]!;
      rows.push(
        row({
          offensePlayerIds: [star, ...mates],
          defensePlayerIds: foes,
          residual: 0.4,
          gameId: `g${i}`,
          gameDate: `2024-11-${String((i % 28) + 1).padStart(2, "0")}`,
        })
      );
      // Control possessions without the star — near-zero residual.
      rows.push(
        row({
          offensePlayerIds: mates.concat("bench"),
          defensePlayerIds: foes,
          residual: 0.02,
          gameId: `g${i}-c`,
          gameDate: `2024-11-${String((i % 28) + 1).padStart(2, "0")}`,
        })
      );
    }
    const fitted = fitLineupRidge(rows, { lambda: 20 });
    const starIdx = fitted.playerIds.indexOf(star);
    assert.ok(starIdx >= 0);
    const starCoef = fitted.coefficients[starIdx] ?? 0;
    assert.ok(
      starCoef > 0.05,
      `expected clear positive star coef, got ${starCoef}`
    );
    const pred = predictLineupResidual(
      row({
        offensePlayerIds: [star, ...benches[0]!],
        defensePlayerIds: foeBenches[0]!,
        residual: 0,
      }),
      fitted.playerIds,
      fitted.coefficients,
      fitted.homeCoef
    );
    assert.ok(pred > 0.05);
  });
});

describe("fusion", () => {
  it("blends P and LN with more LN weight at larger samples", () => {
    const low = fusePlayerRating({ drblP: 2, drblLn: 0, possessions: 50 });
    const high = fusePlayerRating({ drblP: 2, drblLn: 0, possessions: 4000 });
    // Same LN=0 → higher sample shifts weight to LN, pulling toward 0.
    assert.ok(high < low);
  });
});
