/**
 * Run: npx tsx --test src/data/identity/__tests__/artifact-join.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlayerIdAliasIndex } from "@/data/providers/impact/player-id-aliases";
import {
  artifactNamesConflict,
  nbaIdForKnownArtifact,
} from "../artifact-join";

function index(
  rows: Array<{
    espnPlayerId: string;
    nbaPlayerId: string;
    playerName: string;
    productionApproved?: boolean;
    confidence?: string;
  }>
): PlayerIdAliasIndex {
  const byEspn = new Map();
  const byNba = new Map();
  for (const row of rows) {
    byEspn.set(row.espnPlayerId, row);
    byNba.set(row.nbaPlayerId, row);
  }
  return { byEspn, byNba };
}

const aliases = index([
  {
    espnPlayerId: "6583",
    nbaPlayerId: "203076",
    playerName: "Anthony Davis",
    confidence: "UNIQUE_NAME_ONLY",
    productionApproved: false,
  },
]);

test("unique-name alias joins when the artifact contains that NBA id", () => {
  assert.equal(
    nbaIdForKnownArtifact(
      { playerId: "6583", playerName: "Anthony Davis" },
      (id) => id === "203076",
      aliases
    ),
    "203076"
  );
});

test("conflicting names do not attach another player's artifact row", () => {
  assert.equal(artifactNamesConflict("Bojan Bogdanović", "Bogdan Bogdanovic"), true);
  assert.equal(
    nbaIdForKnownArtifact(
      { playerId: "6583", playerName: "Bojan Bogdanović" },
      (id) => id === "203076",
      aliases
    ),
    null
  );
});
