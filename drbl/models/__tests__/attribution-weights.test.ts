import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocateByWeights,
  involvementWeights,
  usageWeightedRole,
} from "../player-value";
import type { DrblEvent, DrblPossession } from "../../types";
import type { RoleVector } from "../replacement";

describe("post-M7 attribution helpers", () => {
  it("gives shooters higher involvement weight than silent teammates", () => {
    const possession: DrblPossession = {
      gameId: "g",
      possessionId: "p",
      offenseTeamId: "H",
      defenseTeamId: "A",
      period: 1,
      startActionNumber: 1,
      endActionNumber: 2,
      startClockSeconds: 700,
      endClockSeconds: 690,
      points: 2,
      endReason: "made_fg",
      offensePlayerIds: ["star", "a", "b", "c", "d"],
      defensePlayerIds: ["e", "f", "g", "h", "i"],
      eventActionNumbers: [1, 2],
    };
    const events: DrblEvent[] = [
      {
        gameId: "g",
        actionNumber: 1,
        orderNumber: 1,
        period: 1,
        clockSeconds: 700,
        clockRaw: "",
        actionType: "2pt",
        subType: "",
        teamId: "H",
        playerId: "star",
        playerName: "Star",
        possessionTeamId: "H",
        description: "",
        shotResult: "Made",
        isFieldGoal: true,
        pointsOnAction: 2,
        scoreHome: 2,
        scoreAway: 0,
        x: 0,
        y: 0,
        qualifiers: [],
        substitutionSide: null,
      },
      {
        gameId: "g",
        actionNumber: 2,
        orderNumber: 2,
        period: 1,
        clockSeconds: 690,
        clockRaw: "",
        actionType: "rebound",
        subType: "",
        teamId: "A",
        playerId: "e",
        playerName: "E",
        possessionTeamId: "A",
        description: "",
        shotResult: null,
        isFieldGoal: false,
        pointsOnAction: 0,
        scoreHome: 2,
        scoreAway: 0,
        x: null,
        y: null,
        qualifiers: [],
        substitutionSide: null,
      },
    ];
    const w = involvementWeights(possession.offensePlayerIds, possession, events);
    assert.ok((w.get("star") ?? 0) > (w.get("a") ?? 0));
    const alloc = allocateByWeights(1, w, possession.offensePlayerIds);
    assert.ok((alloc.get("star") ?? 0) > (alloc.get("a") ?? 0));
    const sum = [...alloc.values()].reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });

  it("usage-weights on-court roles toward high-usage players", () => {
    const roles = new Map<string, RoleVector>([
      [
        "star",
        { usage: 0.35, threeRate: 0.4, starterRate: 1, minutesPerGame: 34 },
      ],
      [
        "bench",
        { usage: 0.1, threeRate: 0.5, starterRate: 0, minutesPerGame: 12 },
      ],
    ]);
    const mixed = usageWeightedRole(["star", "bench"], roles);
    assert.ok(mixed.usage > 0.2);
    assert.ok(mixed.minutesPerGame > 20);
  });
});
