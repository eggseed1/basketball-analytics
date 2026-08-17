import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SEASON_REGISTRY,
  getSeasonEntry,
  isDrblSeason,
  listDrblSeasons,
  HISTORICAL_NORMALIZATION_VERSION,
  DRBL_V1_ABILITY_VERSION,
} from "../../historical/season-registry";
import { HISTORICAL_NORMALIZATION_VERSION as SCHEMA_VERSION } from "../../historical/normalized-event-schema";
import { adaptDrblEventsToHistoricalNormalized } from "../../historical/adapters/nba-cdn-playbyplayv3";
import type { DrblEvent } from "../../types";

describe("M17a season registry", () => {
  it("is the single source for DRBL seasons", () => {
    assert.deepEqual(listDrblSeasons(), [
      "2020-21",
      "2021-22",
      "2022-23",
      "2023-24",
      "2024-25",
      "2025-26",
    ]);
    assert.equal(isDrblSeason("2024-25"), true);
    assert.equal(isDrblSeason("2020-21"), true);
    assert.equal(isDrblSeason("1997-98"), false);
    assert.equal(SEASON_REGISTRY.length, 6);
  });

  it("marks retrospective frozen-v1 seasons distinctly from production", () => {
    const h = getSeasonEntry("2023-24");
    assert.ok(h);
    assert.equal(h!.modelProductStatus, "RETROSPECTIVE_FROZEN_V1");
    assert.equal(h!.abilityModelVersion, DRBL_V1_ABILITY_VERSION);
  });

  it("carries frozen v1 version metadata", () => {
    const e = getSeasonEntry("2025-26");
    assert.ok(e);
    assert.equal(e!.abilityModelVersion, DRBL_V1_ABILITY_VERSION);
    assert.equal(e!.normalizationVersion, HISTORICAL_NORMALIZATION_VERSION);
    assert.equal(e!.supportTier, "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION");
    assert.equal(e!.modelProductStatus, "CANONICAL_PRODUCTION");
  });
});

describe("M17a historical CDN adapter", () => {
  it("preserves source pointers and leaves unknowns null", () => {
    const events: DrblEvent[] = [
      {
        gameId: "0022400001",
        actionNumber: 1,
        orderNumber: 1,
        period: 1,
        clockSeconds: 720,
        clockRaw: "PT12M00.00S",
        actionType: "period",
        subType: "start",
        teamId: null,
        playerId: null,
        playerName: null,
        possessionTeamId: null,
        description: "Period Start",
        shotResult: null,
        isFieldGoal: false,
        pointsOnAction: 0,
        scoreHome: 0,
        scoreAway: 0,
        x: null,
        y: null,
        qualifiers: [],
        substitutionSide: null,
      },
    ];
    const a = adaptDrblEventsToHistoricalNormalized({
      season: "2024-25",
      gameId: "0022400001",
      events,
      rawSourcePointer: "data/drbl/raw/games/0022400001/playbyplay.json",
    });
    const b = adaptDrblEventsToHistoricalNormalized({
      season: "2024-25",
      gameId: "0022400001",
      events,
      rawSourcePointer: "data/drbl/raw/games/0022400001/playbyplay.json",
    });
    assert.equal(a.normalizationVersion, SCHEMA_VERSION);
    assert.equal(a.events[0]!.rawSourcePointer.includes("playbyplay"), true);
    assert.equal(a.events[0]!.defenseTeamId, null);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});
