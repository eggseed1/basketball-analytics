/**
 * P17.2 - player team render contract after NBA→canonical normalize.
 * Run: npx tsx scripts/test-player-team-render-contract.ts
 */
import assert from "node:assert/strict";

import { normalizeNbaPlayerSeasonTeam } from "../src/data/transformers/stats-nba";
import { resolveTeamBrand } from "../src/lib/nba-brand";
import { listCanonicalTeams } from "../src/data/identity/team-map";

/** Mirrors Explore TM cell label policy (no raw provider id). */
function exploreTmLabel(row: {
  teamId: string;
  teamAbbreviation?: string;
}): string {
  const isMultiTeam =
    row.teamId === "TOT" ||
    ["TOT", "2TM", "3TM", "4TM"].includes(
      (row.teamAbbreviation ?? "").toUpperCase()
    );
  if (isMultiTeam) {
    const abbr = (row.teamAbbreviation ?? "TOT").toUpperCase();
    return abbr === "2TM" || abbr === "3TM" || abbr === "4TM"
      ? "Multiple"
      : "TOT";
  }
  const brand = resolveTeamBrand(row.teamId);
  if (brand?.abbr) return brand.abbr;
  if (row.teamAbbreviation) return row.teamAbbreviation;
  if (/^\d{6,}$/.test(row.teamId)) return "-";
  return row.teamId;
}

console.log("repository NBA ids normalize without raw UI labels…");
for (const t of listCanonicalTeams()) {
  const nbaId = t.providerIds.nba!;
  const row = normalizeNbaPlayerSeasonTeam({
    teamId: nbaId,
    teamAbbreviation: t.abbr,
  });
  const label = exploreTmLabel(row);
  assert.equal(label, t.abbr, `${nbaId} → label ${label}`);
  assert.ok(!label.startsWith("161"), label);
  assert.notEqual(label, nbaId);
  assert.equal(row.teamId, t.canonicalTeamId);
}

console.log("leaked-before fixture 1610612760 → OKC…");
{
  const beforeLeak = "1610612760";
  const row = normalizeNbaPlayerSeasonTeam({
    teamId: beforeLeak,
    teamAbbreviation: "OKC",
  });
  assert.equal(exploreTmLabel(row), "OKC");
  assert.equal(resolveTeamBrand(row.teamId)?.abbr, "OKC");
}

console.log("TOT / Multiple policy…");
assert.equal(
  exploreTmLabel(
    normalizeNbaPlayerSeasonTeam({ teamId: "0", teamAbbreviation: "TOT" })
  ),
  "TOT"
);
assert.equal(
  exploreTmLabel(
    normalizeNbaPlayerSeasonTeam({ teamId: "0", teamAbbreviation: "2TM" })
  ),
  "Multiple"
);

console.log("OK - player-team-render-contract");
