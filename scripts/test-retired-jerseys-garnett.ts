/**
 * Kevin Garnett retired jersey resolution smoke test.
 * Run: npx tsx scripts/test-retired-jerseys-garnett.ts
 */
import assert from "node:assert/strict";

import { getRetiredJerseysByNbaId } from "../src/content/awards/retired-jerseys";
import { resolvePlayerIdentity } from "../src/data/identity/player-identity";
import {
  LEGEND_BREF_TO_NBA,
  nbaPersonIdFromPlayerRoute,
  remapLegendNbaIdToBref,
  resolveLegacyNbaPersonId,
} from "../src/data/runtime/legend-nba-to-bref";

function resolvePublicPlayerId(raw: string): string {
  let id = raw;
  if (/^\d+$/.test(id)) {
    id = resolveLegacyNbaPersonId(id) ?? id;
  }
  const remapped = remapLegendNbaIdToBref(id);
  if (remapped) return remapped;
  return id;
}

async function jerseysForRoute(rawId: string) {
  const playerId = resolvePublicPlayerId(rawId);
  const identity = await resolvePlayerIdentity(playerId);
  const nbaId =
    nbaPersonIdFromPlayerRoute(identity.nbaId) ??
    nbaPersonIdFromPlayerRoute(playerId) ??
    nbaPersonIdFromPlayerRoute(identity.routeId);
  return {
    rawId,
    playerId,
    identityNba: identity.nbaId,
    nbaId,
    jerseys: nbaId ? getRetiredJerseysByNbaId(nbaId) : [],
  };
}

async function main() {
  assert.equal(LEGEND_BREF_TO_NBA["garneke01"], "708");

  for (const rawId of ["708", "261", "1563", "bref:garneke01"]) {
    const row = await jerseysForRoute(rawId);
    assert.equal(row.nbaId, "708", `${rawId} should resolve to NBA 708`);
    assert.ok(row.jerseys.length >= 2, `${rawId} should have BOS + MIN jerseys`);
  }

  console.log("test-retired-jerseys-garnett: ok");
}

main();
