import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StaleWarJoinError,
  PlayerUniverseMismatchError,
  DuplicatePlayerSeasonError,
  assertWarJoinCompatible,
  assertCanonicalPlayerUniverse,
  assertUniquePlayerSeasonRows,
  assertCompatibleBoardGenerations,
  compareBoardToArtifact,
  reconstructProvisionalWar,
  extractBoardProvenance,
  classifyWarArchitecture,
  assertProductionBoardBuild,
} from "../board-provenance";

describe("board-provenance M16b.1", () => {
  it("STALE_WAR_JOIN_REJECTED when generations diverge", () => {
    assert.throws(
      () => assertWarJoinCompatible("gen-ability-1", "gen-war-old"),
      (err: unknown) =>
        err instanceof StaleWarJoinError && err.code === "STALE_WAR_JOIN_REJECTED"
    );
  });

  it("allows WAR join when parent ability generation matches", () => {
    assert.doesNotThrow(() =>
      assertWarJoinCompatible("gen-ability-1", "gen-war-child", "gen-ability-1")
    );
  });

  it("PLAYER_UNIVERSE_MISMATCH for unexpected board-only players", () => {
    assert.throws(
      () =>
        assertCanonicalPlayerUniverse(["1", "2", "x"], ["1", "2"], {
          allowSiteOnlyZeros: true,
          siteOnlyIds: [],
        }),
      (err: unknown) =>
        err instanceof PlayerUniverseMismatchError &&
        err.code === "PLAYER_UNIVERSE_MISMATCH"
    );
  });

  it("allows documented site-only zero rows", () => {
    assert.doesNotThrow(() =>
      assertCanonicalPlayerUniverse(["1", "2", "x"], ["1", "2"], {
        allowSiteOnlyZeros: true,
        siteOnlyIds: ["x"],
      })
    );
  });

  it("rejects duplicate player-season rows outside stint mode", () => {
    assert.throws(
      () =>
        assertUniquePlayerSeasonRows([
          { playerId: "1", season: "2025-26" },
          { playerId: "1", season: "2025-26" },
        ]),
      (err: unknown) => err instanceof DuplicatePlayerSeasonError
    );
  });

  it("reconstructs provisional WAR from raw impact / 30", () => {
    const r = reconstructProvisionalWar({
      rawAbilityRate: 3.0,
      replacementLevelRate: 0,
      actualPossessions: 9000,
      pointsPerWin: 30,
    });
    assert.equal(r.calculatedImpact, 270);
    assert.equal(r.calculatedWAR, 9);
  });

  it("compareBoardToArtifact reports board-only and mismatches", () => {
    const art = {
      artifactGenerationId: "g1",
      players: [
        { playerId: "1", drbl100: 1.5, drblWar: 10 },
        { playerId: "2", drbl100: 0.5, drblWar: 2 },
      ],
    };
    const cmp = compareBoardToArtifact(
      {
        artifactGenerationId: "g1",
        players: [
          { playerId: "1", drbl100: 1.5, drblWar: 10 },
          { playerId: "3", drbl100: 0, drblWar: 0 },
        ],
      },
      art
    );
    assert.deepEqual(cmp.boardOnlyPlayers, ["3"]);
    assert.deepEqual(cmp.artifactOnlyPlayers, ["2"]);
  });

  it("classifies 2025-26-style provisional WAR as raw ability impact", () => {
    const cls = classifyWarArchitecture({
      players: [{ pointsPerWin: 30, drblWar: 1 }],
    });
    assert.equal(cls, "C_raw_ability_impact");
  });

  it("classifies pipeline v4 posterior as calibrated posterior", () => {
    const cls = classifyWarArchitecture({
      pipelineVersion: "4.0.0",
      warFormulaVersion: "4.0.0",
      warModel: { calibrationInput: "posterior" },
      players: [{ warCalibrationAbilityInput: "posterior" }],
    });
    assert.equal(cls, "B_calibrated_posterior");
  });

  it("assertCompatibleBoardGenerations rejects silent ability/WAR drift", () => {
    assert.throws(
      () =>
        assertCompatibleBoardGenerations({
          abilityGenerationId: "a",
          warGenerationId: "b",
        }),
      StaleWarJoinError
    );
  });

  it("assertProductionBoardBuild passes clean artifact slice", () => {
    const provenance = extractBoardProvenance(
      {
        season: "2025-26",
        version: "drbl-ranking-v2-seq",
        gamesProcessed: 1225,
        artifactGenerationId: "gen",
        abilityLineageVersion: "ability-lineage-v1",
        players: [
          {
            playerId: "1",
            drbl100: 1.5,
            posteriorAbilityRate: 1.5,
            drblWar: 2,
            publishedAbilityInput: "fused_rate",
          },
        ],
      },
      { artifactPath: "x", artifactHash: "h" }
    );
    assert.doesNotThrow(() =>
      assertProductionBoardBuild({
        players: [
          {
            playerId: "1",
            season: "2025-26",
            drbl100: 1.5,
            drblWar: 2,
            posteriorAbilityRate: 1.5,
          },
        ],
        provenance,
        expectedSeason: "2025-26",
        expectedGameCount: 1225,
      })
    );
  });
});
