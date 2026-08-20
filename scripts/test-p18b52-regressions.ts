/**
 * P18B.5.2 regressions.
 *   npx tsx scripts/test-p18b52-regressions.ts
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  clearPlayerUniverseCaches,
  countSeasonPlayerUniverse,
  getMasterPlayer,
  getMasterPlayerRegistry,
  hasPlayerUniverseSeason,
  historyUniverseToPlayerSeasons,
  searchMasterPlayers,
  HISTORICAL_COMPLETE_THROUGH,
} from "../src/data/history/player-universe";
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";

const FIXTURES = [
  ["1642851", "Kon Knueppel"],
  ["1631255", "Karlo Matković"],
  ["1642396", "Blake Hinson"],
  ["1642066", "Myron Gardner"],
] as const;

function main() {
  clearPlayerUniverseCaches();
  const healthPath = path.join(
    process.cwd(),
    "reports",
    "p18b52",
    "health.json"
  );
  assert.ok(existsSync(healthPath), "run p18b52-overnight first");
  const health = JSON.parse(readFileSync(healthPath, "utf8"));

  assert.equal(HISTORICAL_COMPLETE_THROUGH, "2023-24");
  assert.equal(health.UNEXPLAINED_PLAYER_EXISTENCE_DOWNGRADES, 0);
  assert.ok(health.FINAL_CANONICAL_PLAYERS > 4895);

  const master = getMasterPlayerRegistry();
  assert.equal(master.length, health.FINAL_CANONICAL_PLAYERS);

  // Set inclusion vs previous 4895 snapshot
  const pre = JSON.parse(
    readFileSync(
      path.join(
        process.cwd(),
        "data",
        "drbl",
        "player-history",
        "drbl-player-history-v1",
        "master-registry.pre-p18b52.json"
      ),
      "utf8"
    )
  ) as { players: Array<{ playerId: string }> };
  const nowIds = new Set(master.map((p) => p.playerId));
  for (const p of pre.players) {
    assert.ok(nowIds.has(p.playerId), `lost ${p.playerId}`);
  }
  console.log("SET_INCLUSION PASS", { old: pre.players.length, neu: master.length });

  assert.ok(hasPlayerUniverseSeason("2024-25"));
  assert.ok(hasPlayerUniverseSeason("2025-26"));
  assert.ok(countSeasonPlayerUniverse("2024-25") > 400);
  assert.ok(countSeasonPlayerUniverse("2025-26") > 400);

  for (const [id, name] of FIXTURES) {
    const row = getMasterPlayer(id);
    assert.ok(row, `${name} missing from master`);
    assert.ok(
      searchMasterPlayers(name.split(" ").pop()!, { limit: 20 }).some(
        (r) => r.playerId === id
      ),
      `${name} search miss`
    );
    console.log(`${name.toUpperCase().replace(/[ić]/g, (c) => (c === "ć" ? "C" : "I")).replace(/ /g, "_")} PASS`);
  }

  // Diacritic
  assert.ok(
    searchMasterPlayers("Matkovic", { limit: 10 }).some(
      (r) => r.playerId === "1631255"
    )
  );
  console.log("DIACRITIC_SEARCH PASS");

  assert.equal(countSeasonPlayerUniverse("2014-15"), 492);

  const rows = historyUniverseToPlayerSeasons("2005-06");
  const ray = rows.find((r) => r.playerName === "Ray Allen");
  const vince = rows.find((r) => r.playerName === "Vince Carter");
  assert.equal(
    resolveHistoricalTeamBrand(ray!.teamId, "2005-06", "era")?.abbreviation,
    "SEA"
  );
  assert.equal(
    resolveHistoricalTeamBrand(vince!.teamId, "2005-06", "era")?.abbreviation,
    "NJN"
  );

  console.log("ALL_P18B52_REGRESSIONS_PASS", {
    canonical: master.length,
    "2025-26": countSeasonPlayerUniverse("2025-26"),
    p18c: health.P18C_AUTHORIZED,
  });
}

main();
