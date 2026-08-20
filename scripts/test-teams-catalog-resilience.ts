/**
 * Regression: ESPN /nba/teams outage must soft-fail into canonical team catalog.
 * Explore filters stay resolvable (BOS, numeric, namespaced, OKC≠POR).
 */
import assert from "node:assert/strict";

import { resolveCanonicalTeam } from "../src/data/identity/team-map";
import {
  __resetTeamsCatalogForTests,
  __seedCachedLiveTeamsForTests,
  __setTeamsLiveLoaderForTests,
  getTeamsCatalog,
  resolveTeamFilterAgainstCatalog,
  teamsFromCanonicalIdentity,
} from "../src/data/queries/teams-catalog";
import type { Team } from "../src/data/types";

function espnError(status: number): Error {
  return new Error(
    `ESPN request failed (${status}): https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams`
  );
}

async function expectFallback(
  label: string,
  loader: () => Promise<Team[]>,
  expectedSource: "canonical-fallback" | "cached-espn"
) {
  __resetTeamsCatalogForTests();
  __setTeamsLiveLoaderForTests(loader);
  const result = await getTeamsCatalog();
  assert.equal(result.source, expectedSource, label);
  assert.ok(result.warnings.length > 0, `${label}: warning present`);
  assert.equal(result.teams.length, 30, `${label}: 30 teams`);
  const bos = result.teams.find((t) => t.abbreviation === "BOS");
  assert.ok(bos, `${label}: BOS present`);
  assert.equal(bos!.id, "2");
  const okc = result.teams.find((t) => t.abbreviation === "OKC");
  const por = result.teams.find((t) => t.abbreviation === "POR");
  assert.ok(okc && por);
  assert.equal(okc!.id, "25");
  assert.equal(por!.id, "22");
  assert.notEqual(okc!.id, por!.id, `${label}: OKC ≠ POR`);
}

async function main() {
  // Canonical map always yields 30 verified franchises
  const canonical = teamsFromCanonicalIdentity();
  assert.equal(canonical.length, 30);
  assert.equal(canonical.find((t) => t.abbreviation === "BOS")?.id, "2");
  assert.equal(canonical.find((t) => t.abbreviation === "OKC")?.id, "25");
  assert.equal(canonical.find((t) => t.abbreviation === "POR")?.id, "22");

  // Live success
  __resetTeamsCatalogForTests();
  __setTeamsLiveLoaderForTests(async () => canonical);
  const live = await getTeamsCatalog();
  assert.equal(live.source, "live-espn");
  assert.equal(live.warnings.length, 0);
  assert.equal(live.teams.length, 30);

  // ESPN 403 → canonical fallback
  await expectFallback("403", async () => {
    throw espnError(403);
  }, "canonical-fallback");

  // ESPN 429 → canonical fallback
  await expectFallback("429", async () => {
    throw espnError(429);
  }, "canonical-fallback");

  // Timeout → canonical fallback
  await expectFallback("timeout", async () => {
    throw new Error("Team metadata request timed out after 6000ms");
  }, "canonical-fallback");

  // Cached ESPN after prior success, then live fails
  __resetTeamsCatalogForTests();
  __seedCachedLiveTeamsForTests(canonical);
  __setTeamsLiveLoaderForTests(async () => {
    throw espnError(403);
  });
  const cached = await getTeamsCatalog();
  assert.equal(cached.source, "cached-espn");
  assert.equal(cached.teams.length, 30);
  assert.ok(cached.warnings[0]?.includes("cached"));

  // Filter resolution against fallback catalog
  __resetTeamsCatalogForTests();
  __setTeamsLiveLoaderForTests(async () => {
    throw espnError(403);
  });
  const catalog = await getTeamsCatalog();
  assert.equal(
    resolveTeamFilterAgainstCatalog("BOS", catalog.teams).status,
    "resolved"
  );
  assert.equal(
    resolveTeamFilterAgainstCatalog("bos", catalog.teams).team?.id,
    "2"
  );
  assert.equal(
    resolveTeamFilterAgainstCatalog("2", catalog.teams).team?.abbreviation,
    "BOS"
  );
  assert.equal(
    resolveTeamFilterAgainstCatalog("espn:2", catalog.teams).team?.id,
    "2"
  );
  // BDL 25 is Portland - must not become OKC
  const bdl25 = resolveTeamFilterAgainstCatalog("bdl:25", catalog.teams);
  assert.equal(bdl25.status, "resolved");
  assert.equal(bdl25.team?.abbreviation, "POR");
  assert.equal(bdl25.canonicalId, "22");

  const okc = resolveTeamFilterAgainstCatalog("okc", catalog.teams);
  const por = resolveTeamFilterAgainstCatalog("por", catalog.teams);
  assert.equal(okc.team?.id, "25");
  assert.equal(por.team?.id, "22");
  assert.notEqual(okc.team?.id, por.team?.id);

  // Invalid team remains unresolved (not "provider unavailable")
  const bad = resolveTeamFilterAgainstCatalog("NOTATEAM", catalog.teams);
  assert.equal(bad.status, "unresolved");
  assert.equal(resolveCanonicalTeam("NOTATEAM").status, "unresolved");

  // Empty live array → fallback
  __resetTeamsCatalogForTests();
  __setTeamsLiveLoaderForTests(async () => []);
  const empty = await getTeamsCatalog();
  assert.equal(empty.source, "canonical-fallback");
  assert.equal(empty.teams.length, 30);

  __resetTeamsCatalogForTests();
  console.log("test-teams-catalog-resilience: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
