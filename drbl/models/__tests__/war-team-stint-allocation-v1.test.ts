import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocatePlayerSeasonValueToTeams,
  PlayerTeamStintBuilder,
} from "../war-team-stint-allocation-v1";

describe("allocatePlayerSeasonValueToTeams", () => {
  it("conserves season points across stints", () => {
    const rows = allocatePlayerSeasonValueToTeams({
      seasonRate: 4,
      seasonCombinedAppearances: 1000,
      teamAppearanceRows: [
        { teamId: "1610612747", teamCombinedAppearances: 600 },
        { teamId: "1610612738", teamCombinedAppearances: 400 },
      ],
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.allocatedSeasonPoints, 24);
    assert.equal(rows[1]!.allocatedSeasonPoints, 16);
    assert.equal(
      rows.reduce((s, r) => s + r.allocatedSeasonPoints, 0),
      40
    );
    assert.equal(
      rows.reduce((s, r) => s + r.teamExposureShare, 0),
      1
    );
  });

  it("is pure w.r.t. wins/PPW/reputation (ignored inputs)", () => {
    const base = allocatePlayerSeasonValueToTeams({
      seasonRate: 2.5,
      seasonCombinedAppearances: 800,
      teamAppearanceRows: [
        { teamId: "A", teamCombinedAppearances: 500 },
        { teamId: "B", teamCombinedAppearances: 300 },
      ],
    });
    // Holding rate + shares constant — no API for wins/PPW; purity = same inputs ⇒ same outputs
    const again = allocatePlayerSeasonValueToTeams({
      seasonRate: 2.5,
      seasonCombinedAppearances: 800,
      teamAppearanceRows: [
        { teamId: "A", teamCombinedAppearances: 500 },
        { teamId: "B", teamCombinedAppearances: 300 },
      ],
    });
    assert.deepEqual(base, again);
  });

  it("rejects TOT and mismatched season N", () => {
    assert.throws(() =>
      allocatePlayerSeasonValueToTeams({
        seasonRate: 1,
        seasonCombinedAppearances: 10,
        teamAppearanceRows: [{ teamId: "TOT", teamCombinedAppearances: 10 }],
      })
    );
    assert.throws(() =>
      allocatePlayerSeasonValueToTeams({
        seasonRate: 1,
        seasonCombinedAppearances: 10,
        teamAppearanceRows: [{ teamId: "A", teamCombinedAppearances: 9 }],
      })
    );
  });
});

describe("PlayerTeamStintBuilder", () => {
  it("conserves exposure and raw value; aggregates same-team returns", () => {
    const b = new PlayerTeamStintBuilder();
    b.ingestAppearance({
      season: "2024-25",
      playerId: "p1",
      playerName: "P1",
      teamId: "T1",
      opponentTeamId: "T2",
      gameId: "g1",
      gameDate: "2024-11-01",
      value: 0.5,
    });
    b.ingestAppearance({
      season: "2024-25",
      playerId: "p1",
      teamId: "T2",
      opponentTeamId: "T1",
      gameId: "g2",
      gameDate: "2025-02-01",
      value: 0.25,
    });
    b.ingestAppearance({
      season: "2024-25",
      playerId: "p1",
      teamId: "T1",
      opponentTeamId: "T3",
      gameId: "g3",
      gameDate: "2025-03-01",
      value: 0.1,
    });
    const seasons = b.playerSeasonTotals();
    const stints = b.stintRows();
    assert.equal(seasons[0]!.seasonCombinedAppearances, 3);
    assert.equal(seasons[0]!.approachBAttributedValue, 0.85);
    assert.equal(stints.length, 2);
    const t1 = stints.find((s) => s.teamId === "T1")!;
    assert.equal(t1.teamStintCombinedAppearances, 2);
    assert.equal(t1.observedRawStintAttributedValue, 0.6);
    assert.equal(t1.gamesWithTeam, 2);
  });
});
