/**
 * Hustle overlay join: attach NBA totals without opening unique-name aliases to DRBL.
 * Run: npx tsx --test src/data/transformers/__tests__/hustle-overlay-join.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlayerIdAliasIndex } from "@/data/providers/impact/player-id-aliases";
import { isProductionApprovedPlayerAlias } from "@/data/providers/impact/player-id-aliases";
import { formatCountingRate } from "@/lib/format";
import { resolveHustleNbaId } from "../hustle-overlay-join";

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
  {
    espnPlayerId: "4683771",
    nbaPlayerId: "1641842",
    playerName: "Ronald Holland II",
    confidence: "VERIFIED_MULTI_FIELD",
    productionApproved: true,
  },
  {
    espnPlayerId: "999",
    nbaPlayerId: "1631198",
    playerName: "Trevon Scott",
    confidence: "UNIQUE_NAME_ONLY",
    productionApproved: false,
  },
]);

const hustle = new Set(["203076", "1641842", "1631198"]);

test("unique-name alias still joins hustle when the NBA id is in the file", () => {
  const alias = aliases.byEspn.get("6583")!;
  assert.equal(isProductionApprovedPlayerAlias(alias), false);
  assert.equal(
    resolveHustleNbaId(
      { playerId: "6583", playerName: "Anthony Davis" },
      hustle,
      aliases
    ),
    "203076"
  );
});

test("known ESPN alias with no hustle row is not replaced by a name guess", () => {
  assert.equal(
    resolveHustleNbaId(
      { playerId: "6583", playerName: "Ronald Holland II" },
      new Set(["1641842"]),
      aliases
    ),
    null
  );
});

test("Ron Holland matches Ronald Holland II by given-name alias, not Tre Scott", () => {
  assert.equal(
    resolveHustleNbaId(
      { playerId: "bref:ron-holland:2025-26", playerName: "Ron Holland" },
      hustle,
      aliases
    ),
    "1641842"
  );
  assert.equal(
    resolveHustleNbaId(
      { playerId: "bref:tre-scott:2025-26", playerName: "Tre Scott" },
      hustle,
      aliases
    ),
    null
  );
});

test("shared last name does not join a different given name", () => {
  const bogdan = index([
    {
      espnPlayerId: "1",
      nbaPlayerId: "203992",
      playerName: "Bogdan Bogdanovic",
      productionApproved: false,
      confidence: "UNIQUE_NAME_ONLY",
    },
  ]);
  assert.equal(
    resolveHustleNbaId(
      { playerId: "bref:bojan:2021-22", playerName: "Bojan Bogdanović" },
      new Set(["203992"]),
      bogdan
    ),
    null
  );
});

test("hyphenated first name matches the hustle alias last name when unique", () => {
  const bal = index([
    {
      espnPlayerId: "4896365",
      nbaPlayerId: "1642864",
      playerName: "Adama Bal",
      productionApproved: false,
      confidence: "UNIQUE_NAME_ONLY",
    },
  ]);
  assert.equal(
    resolveHustleNbaId(
      { playerId: "bref:bal:2025-26", playerName: "Adama-Alpha Bal" },
      new Set(["1642864"]),
      bal
    ),
    "1642864"
  );
});

test("positive counting rates do not display as 0.0", () => {
  assert.equal(formatCountingRate(1 / 79), "0.01");
  assert.equal(formatCountingRate(0), "0.0");
  assert.equal(formatCountingRate(2.4), "2.4");
});
