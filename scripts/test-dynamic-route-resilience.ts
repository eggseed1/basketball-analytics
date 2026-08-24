/**
 * Network-free regression guard for dynamic route resilience.
 *
 * Run with:
 *   npx tsx scripts/test-dynamic-route-resilience.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolvePlayerIdentity } from "../src/data/identity/player-identity";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

async function main() {
  const sga = await resolvePlayerIdentity("4278073");
  assert.equal(sga.espnId, "4278073");
  assert.equal(sga.nbaId, "1628983");
  assert.equal(sga.displayName, "Shai Gilgeous-Alexander");
  assert.equal(sga.resolved, true);

  const cacheSource = source("src/data/cache/shared-ttl-cache.ts");
  assert.match(cacheSource, /return cached\(\);/);
  assert.match(cacheSource, /const inflight = new Map/);
  assert.doesNotMatch(
    cacheSource,
    /return await cached\(\);[\s\S]{0,120}catch[\s\S]{0,120}return factory\(\)/,
    "a failed cached factory must never be replayed outside the cache"
  );

  const criticalSource = source("src/data/queries/player-critical.ts");
  assert.match(criticalSource, /identity\?\.nbaId/);
  assert.match(criticalSource, /historyCareerFallback\(playerId, lookupIds\)/);
  assert.match(criticalSource, /playerId: routePlayerId/);

  const pageSource = source("src/app/players/[playerId]/page.tsx");
  assert.match(pageSource, /playerLookupIds/);
  assert.match(pageSource, /!identity\?\.displayName/);
  assert.match(pageSource, /getHistoryCareerForPlayer/);
  assert.match(pageSource, /getMasterPlayer/);

  const requestCache = source("src/data/queries/request-cache.ts");
  assert.match(requestCache, /runtimeTimeoutMs\(5_000, 2_800\)/);
  assert.match(requestCache, /runtimeTimeoutMs\(7_000, 3_400\)/);
  assert.match(requestCache, /runtimeTimeoutMs\(9_000, 4_800\)/);

  const percentile = source(
    "src/components/players/player-percentile-island.tsx"
  );
  assert.match(percentile, /Percentile ranking unavailable/);
  assert.match(percentile, /catch \(error\)/);

  // Player routes use ESPN athlete ids, while validated payroll snapshots use
  // NBA PERSON_IDs. The optional contract island must resolve the alias before
  // lookup and must never fall back to a league-wide live roster crawl.
  const contractQuery = source("src/data/queries/player-front-office.ts");
  assert.match(contractQuery, /resolvePlayerIdentityCached/);
  assert.match(contractQuery, /identity\?\.nbaId/);
  assert.match(contractQuery, /loadTeamFrontOfficeSlice/);
  assert.match(contractQuery, /if \(!franchiseId\) return null/);
  assert.doesNotMatch(contractQuery, /listCanonicalTeams/);
  assert.doesNotMatch(contractQuery, /for \(const team of/);

  const contractIsland = source(
    "src/components/players/player-contract-transactions-island.tsx"
  );
  assert.match(contractIsland, /try \{/);
  assert.match(contractIsland, /catch \(error\)/);
  assert.match(contractIsland, /return null/);

  const frontOfficeLoader = source(
    "src/data/front-office/load-team-front-office.ts"
  );
  assert.match(frontOfficeLoader, /if \(!liveFrontOfficeEnabled\(\)\) return cached/);
  assert.match(frontOfficeLoader, /live roster refresh failed/);

  const aliases = JSON.parse(
    source("data/impact/player-id-aliases.json")
  ) as {
    aliases: Array<{
      espnPlayerId: string;
      nbaPlayerId: string;
      productionApproved?: boolean;
    }>;
  };
  const sgaAlias = aliases.aliases.find(
    (row) => row.espnPlayerId === "4278073"
  );
  assert.equal(sgaAlias?.nbaPlayerId, "1628983");
  assert.equal(sgaAlias?.productionApproved, true);

  const okc = JSON.parse(source("data/front-office/v1/teams/25.json")) as {
    team: { payroll: { contractRows: Array<{ playerId: string }> } };
  };
  const okcIds = new Set(
    okc.team.payroll.contractRows.map((row) => row.playerId)
  );
  assert.equal(okcIds.has("1628983"), true);
  assert.equal(okcIds.has("4278073"), false);

  for (const path of [
    "src/app/error.tsx",
    "src/app/global-error.tsx",
    "src/app/players/[playerId]/error.tsx",
  ]) {
    assert.equal(existsSync(join(process.cwd(), path)), true, `${path} missing`);
  }

  const rankSource = source(
    "src/app/players/[playerId]/season-rank/page.tsx"
  );
  const compareSource = source(
    "src/app/players/[playerId]/season-compare/page.tsx"
  );
  assert.match(rankSource, /getPlayerCareerSeasonsCached/);
  assert.match(compareSource, /getPlayerCareerSeasonsCached/);

  console.log("test-dynamic-route-resilience: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});