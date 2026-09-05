/**
 * Player identity resolver + alias policy tests.
 * Run: npx tsx --test src/data/identity/__tests__/player-identity.test.ts
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  clearPlayerIdAliasCache,
  resolveNbaIdForDrbl,
  resolvePlayerIdentity,
} from "../player-identity";

const ALIAS_PATH = path.join(
  process.cwd(),
  "data",
  "impact",
  "player-id-aliases.json"
);

async function withTempAliases(
  aliases: Array<{
    espnPlayerId: string;
    nbaPlayerId: string;
    playerName?: string;
    confidence?: string;
    productionApproved?: boolean;
  }>,
  fn: () => Promise<void>
) {
  let previous: string | null = null;
  try {
    previous = await import("node:fs/promises").then((fs) =>
      fs.readFile(ALIAS_PATH, "utf8")
    );
  } catch {
    previous = null;
  }
  await mkdir(path.dirname(ALIAS_PATH), { recursive: true });
  await writeFile(
    ALIAS_PATH,
    JSON.stringify({ aliases }, null, 2) + "\n",
    "utf8"
  );
  clearPlayerIdAliasCache();
  try {
    await fn();
  } finally {
    clearPlayerIdAliasCache();
    if (previous != null) {
      await writeFile(ALIAS_PATH, previous, "utf8");
    } else {
      await writeFile(
        ALIAS_PATH,
        JSON.stringify({ aliases: [] }, null, 2) + "\n",
        "utf8"
      );
    }
  }
}

test("resolvePlayerIdentity maps production-approved ESPN alias to NBA", async () => {
  await withTempAliases(
    [
      {
        espnPlayerId: "3112335",
        nbaPlayerId: "203999",
        playerName: "Nikola Jokic",
        confidence: "HIGH_CONFIDENCE_MULTI_FIELD",
        productionApproved: true,
      },
    ],
    async () => {
      const res = await resolvePlayerIdentity("3112335");
      assert.equal(res.resolved, true);
      assert.equal(res.ambiguous, false);
      assert.equal(res.espnId, "3112335");
      assert.equal(res.nbaId, "203999");
      assert.equal(res.matchMethod, "alias_espn_to_nba");
      assert.equal(await resolveNbaIdForDrbl("3112335"), "203999");
    }
  );
});

test("HIGH_CONFIDENCE_MULTI_FIELD is accepted on production resolveNbaIdForDrbl", async () => {
  await withTempAliases(
    [
      {
        espnPlayerId: "4066328",
        nbaPlayerId: "1629029",
        playerName: "Luka Doncic",
        confidence: "HIGH_CONFIDENCE_MULTI_FIELD",
        productionApproved: true,
      },
    ],
    async () => {
      assert.equal(await resolveNbaIdForDrbl("4066328"), "1629029");
      const res = await resolvePlayerIdentity("4066328");
      assert.equal(res.resolved, true);
      assert.equal(res.confidence, "HIGH_CONFIDENCE_MULTI_FIELD");
    }
  );
});

test("UNIQUE_NAME_ONLY is rejected on production resolveNbaIdForDrbl", async () => {
  await withTempAliases(
    [
      {
        espnPlayerId: "3112335",
        nbaPlayerId: "203999",
        playerName: "Nikola Jokic",
        confidence: "UNIQUE_NAME_ONLY",
        productionApproved: false,
      },
    ],
    async () => {
      assert.equal(await resolveNbaIdForDrbl("3112335"), null);
      const res = await resolvePlayerIdentity("3112335");
      assert.equal(res.resolved, false);
      assert.equal(res.nbaId, null);
      assert.equal(res.espnId, "3112335");
      // Explicit opt-in still works for audit/research scripts only.
      assert.equal(
        await resolveNbaIdForDrbl("3112335", {
          allowNonProductionAliases: true,
        }),
        "203999"
      );
    }
  );
});

test("resolvePlayerIdentity maps NBA alias to ESPN when production-approved", async () => {
  await withTempAliases(
    [
      {
        espnPlayerId: "3112335",
        nbaPlayerId: "203999",
        playerName: "Nikola Jokic",
        confidence: "VERIFIED_MULTI_FIELD",
        productionApproved: true,
      },
    ],
    async () => {
      const res = await resolvePlayerIdentity("203999");
      assert.equal(res.resolved, true);
      assert.equal(res.espnId, "3112335");
      assert.equal(res.nbaId, "203999");
      assert.equal(res.matchMethod, "alias_nba_to_espn");
      assert.equal(await resolveNbaIdForDrbl("203999"), "203999");
    }
  );
});

test("ambiguous names are not accepted without alias file entry", async () => {
  await withTempAliases([], async () => {
    const res = await resolvePlayerIdentity("3112335");
    assert.equal(res.resolved, false);
    assert.equal(res.ambiguous, false);
    assert.equal(res.nbaId, null);
    assert.equal(res.espnId, "3112335");
    assert.equal(await resolveNbaIdForDrbl("3112335"), null);
  });
});

test("bundled legend: Paul Pierce is ESPN 662 ↔ NBA 1718 (not Fred Jones)", async () => {
  clearPlayerIdAliasCache();
  // Route / search may use either id; ESPN athlete 1718 is Fred Jones and must
  // not be aliased as Pierce.
  const byNba = await resolvePlayerIdentity("1718");
  assert.equal(byNba.espnId, "662");
  assert.equal(byNba.nbaId, "1718");
  assert.equal(byNba.displayName, "Paul Pierce");
  assert.equal(byNba.matchMethod, "alias_nba_to_espn");

  const byEspn = await resolvePlayerIdentity("662");
  assert.equal(byEspn.espnId, "662");
  assert.equal(byEspn.nbaId, "1718");
  assert.equal(byEspn.displayName, "Paul Pierce");
  assert.equal(byEspn.matchMethod, "alias_espn_to_nba");
});

test("bundled legend: Shaq / Vince do not share ESPN 136", async () => {
  clearPlayerIdAliasCache();
  const shaq = await resolvePlayerIdentity("406");
  assert.equal(shaq.espnId, "614");
  assert.equal(shaq.nbaId, "406");
  assert.equal(shaq.displayName, "Shaquille O'Neal");

  const vince = await resolvePlayerIdentity("1713");
  assert.equal(vince.espnId, "136");
  assert.equal(vince.nbaId, "1713");
  assert.equal(vince.displayName, "Vince Carter");
});
