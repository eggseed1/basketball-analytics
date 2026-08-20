/**
 * P18B.3 permanent media + lineage regressions.
 *   npx tsx scripts/test-p18b3-regressions.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  BLOCKED_NBA_LATEST_PLAYER_IDS,
  resolvePlayerPortraitCandidates,
  validatePlayerMedia,
} from "../src/lib/player-media-resolve";
import { countSeasonPlayerUniverse } from "../src/data/history/player-universe";
import { getMasterPlayerRegistry } from "../src/data/history/player-universe";

const ROOT = process.cwd();
const MEDIA = path.join(
  ROOT,
  "data",
  "drbl",
  "player-media",
  "drbl-player-media-v1",
  "registry.json"
);

function main() {
  // --- Steve Nash: must not serve coach latest as player portrait ---
  assert.ok(BLOCKED_NBA_LATEST_PLAYER_IDS.has("959"));
  const nashUrls = resolvePlayerPortraitCandidates({
    playerId: "959",
    nbaId: "959",
    role: "PLAYER",
  });
  assert.equal(
    nashUrls.some((u) => u.includes("cdn.nba.com/headshots/nba/latest")),
    false,
    "STEVE_NASH_WRONG_ROLE_IMAGE"
  );
  console.log("STEVE_NASH_PLAYER_IMAGE PASS");

  // --- Dirk 2006: person id must be 1717 ---
  const dirkUrls = resolvePlayerPortraitCandidates({
    playerId: "1717",
    nbaId: "1717",
    espnId: "1717",
    role: "PLAYER",
  });
  assert.ok(dirkUrls.length > 0, "DIRK_2006_WRONG_PERSON_IMAGE missing url");
  assert.ok(
    dirkUrls.every((u) => u.includes("/1717.")),
    "DIRK_2006_WRONG_PERSON_IMAGE id mismatch"
  );
  if (existsSync(MEDIA)) {
    const reg = JSON.parse(readFileSync(MEDIA, "utf8")) as {
      byPlayerId: Record<string, { sourcePlayerId: string; roleContext: string }>;
    };
    const d = reg.byPlayerId["1717"];
    if (d) {
      assert.equal(d.sourcePlayerId, "1717");
      assert.equal(d.roleContext, "PLAYER");
      const v = validatePlayerMedia({
        canonicalPlayerId: "1717",
        selectedSeason: "2005-06",
        media: d,
      });
      assert.ok(
        v === "VALID_PLAYER_FALLBACK" || v === "VALID_EXACT_ERA",
        `DIRK validation ${v}`
      );
    }
  }
  console.log("DIRK_NOWITZKI_2006_IMAGE PASS");

  // --- Michael Redd: verified or safe missing (never wrong person) ---
  const reddUrls = resolvePlayerPortraitCandidates({
    playerId: "2072",
    nbaId: "2072",
    role: "PLAYER",
  });
  // If URLs present they must key on 2072; empty = safe fallback
  assert.ok(reddUrls.every((u) => u.includes("/2072.")));
  console.log(
    reddUrls.length
      ? "MICHAEL_REDD_PLAYER_IMAGE PASS"
      : "MICHAEL_REDD_PLAYER_IMAGE SAFE_FALLBACK"
  );

  // --- No dual-namespace fallthrough ---
  const ambiguous = resolvePlayerPortraitCandidates({ playerId: "1717" });
  assert.equal(ambiguous.length, 1);
  assert.ok(ambiguous[0]!.includes("cdn.nba.com"));
  assert.equal(
    ambiguous.some((u) => u.includes("espncdn")),
    false,
    "must not invent ESPN URL from NBA id alone"
  );

  // --- Lineage seasons present ---
  for (const season of [
    "1946-47",
    "1947-48",
    "1948-49",
    "1949-50",
    "1950-51",
  ]) {
    const n = countSeasonPlayerUniverse(season);
    assert.ok(n > 0, `${season} empty`);
    console.log(season, n);
  }

  // --- 2014 regression ---
  const n2014 = countSeasonPlayerUniverse("2014-15");
  assert.equal(n2014, 492, "2014_DIRECTORY");
  console.log("2014_DIRECTORY", `${n2014}/492`);

  const master = getMasterPlayerRegistry();
  assert.ok(master.length >= 4550);
  console.log("ALL_ERA_CANONICAL_PLAYERS", master.length);

  console.log("ALL_P18B3_REGRESSIONS_PASS");
}

main();
