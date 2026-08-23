/**
 * Transaction player extract/resolve + team brand identity tests.
 * Run: npm run test:transaction-player-resolve
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALL_TEAM_ABBRS,
  TEAM_BRANDS,
  resolveTeamBrand,
  teamBrandBarColor,
  teamBrandTint,
  teamChartColor,
} from "../src/lib/nba-brand";
import {
  descriptionLooksLikeDraftCompensation,
  extractTransactionPlayerMentions,
} from "../src/lib/transaction-player-extract";
import {
  partitionTransactionDescription,
  type TransactionPlayerResolution,
} from "../src/lib/transaction-player-resolution";
import { canLinkTransactionPlayer } from "../src/lib/transaction-player-link";
import { buildGameMatchupTheme } from "../src/lib/game-matchup-theme";
import { normalizePlayerName } from "../src/lib/player-name";

console.log("team brands: all 30 have valid primary…");
assert.equal(ALL_TEAM_ABBRS.length, 30);
for (const abbr of ALL_TEAM_ABBRS) {
  const brand = resolveTeamBrand(abbr);
  assert.ok(brand, abbr);
  assert.ok(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brand!.primary), abbr);
  assert.equal(teamBrandBarColor(abbr), teamChartColor(abbr).color);
  assert.ok(teamBrandTint(abbr, 0.2).startsWith("rgba("));
}
assert.equal(teamBrandBarColor("bos"), TEAM_BRANDS.bos.primary);
assert.equal(teamBrandBarColor("2"), TEAM_BRANDS.bos.primary);
assert.equal(teamBrandBarColor("cha"), TEAM_BRANDS.cha.primary);
assert.equal(teamBrandBarColor("lal"), TEAM_BRANDS.lal.primary);
assert.equal(teamBrandBarColor("gsw"), TEAM_BRANDS.gsw.primary);
assert.equal(teamBrandBarColor("phx"), TEAM_BRANDS.phx.primary);
assert.equal(teamBrandBarColor("bkn"), TEAM_BRANDS.bkn.primary);
assert.equal(teamBrandBarColor("sas"), TEAM_BRANDS.sas.primary);
// Similarity must not use iOS system green for Celtics identity.
assert.notEqual(teamBrandBarColor("bos"), "#34c759");
assert.equal(teamBrandBarColor("bos"), "#007A33");

console.log("matchup theme still away→home from TEAM_BRANDS…");
const theme = buildGameMatchupTheme("cha", "bos");
assert.equal(theme.awayBrand?.abbr, "CHA");
assert.equal(theme.homeBrand?.abbr, "BOS");

console.log("extract: waived / signed / multi…");
{
  const one = extractTransactionPlayerMentions("Waived G Ethan Thompson.");
  assert.equal(one.length, 1);
  assert.equal(one[0]!.rawName, "Ethan Thompson");
  assert.equal(one[0]!.positionHint, "G");

  const pair = extractTransactionPlayerMentions(
    "Waived G Damion Baugh and F Tyrese Samuel."
  );
  assert.equal(pair.length, 2);
  assert.equal(pair[0]!.rawName, "Damion Baugh");
  assert.equal(pair[1]!.rawName, "Tyrese Samuel");

  const plural = extractTransactionPlayerMentions(
    "Waived Gs Jamaree Bouyea and Cormac Ryan."
  );
  assert.ok(plural.some((m) => m.rawName === "Jamaree Bouyea"));
  assert.ok(plural.some((m) => m.rawName === "Cormac Ryan"));

  const signed = extractTransactionPlayerMentions(
    "Re-signed G De'Anthony Melton to a contract."
  );
  assert.equal(signed.length, 1);
  assert.equal(signed[0]!.rawName, "De'Anthony Melton");

  const ext = extractTransactionPlayerMentions(
    "Re-signed G Dillon Brooks to a veteran extension."
  );
  assert.equal(ext[0]!.rawName, "Dillon Brooks");

  const acquired = extractTransactionPlayerMentions(
    "Acquired F Paul George from Philadelphia."
  );
  assert.equal(acquired.length, 1);
  assert.equal(acquired[0]!.rawName, "Paul George");
  // Philadelphia is a team city — not extracted as a player.
  assert.ok(!acquired.some((m) => /Philadelphia/i.test(m.rawName)));

  const jr = extractTransactionPlayerMentions("Waived F RJ Luis Jr.");
  assert.equal(jr[0]!.rawName, "RJ Luis Jr");
}

console.log("draft considerations do not invent assets…");
assert.equal(
  descriptionLooksLikeDraftCompensation(
    "Acquired F Paul George for draft considerations."
  ),
  true
);
assert.equal(
  extractTransactionPlayerMentions(
    "Acquired F Paul George for draft considerations."
  ).filter((m) => /draft|consideration|pick/i.test(m.rawName)).length,
  0
);

console.log("partition only links resolved…");
{
  const description = "Waived G Ethan Thompson.";
  const mentions = extractTransactionPlayerMentions(description);
  const unresolved: TransactionPlayerResolution[] = mentions.map((mention) => ({
    status: "unresolved",
    mention,
    playerId: null,
    playerName: null,
    href: null,
    teamKey: null,
    candidates: [],
    reason: "test",
  }));
  const partsU = partitionTransactionDescription(description, unresolved);
  assert.ok(partsU.some((p) => p.kind === "player"));
  assert.ok(
    partsU.every(
      (p) => p.kind !== "player" || p.resolution.status === "unresolved"
    )
  );
  const resolved: TransactionPlayerResolution[] = mentions.map((mention) => ({
    status: "resolved",
    mention,
    playerId: "4065648",
    playerName: "Ethan Thompson",
    href: "/players/4065648?season=2025-26",
    teamKey: "11",
    candidates: [],
    reason: null,
  }));
  const partsR = partitionTransactionDescription(description, resolved);
  assert.ok(partsR.some((p) => p.kind === "player"));
  assert.ok(canLinkTransactionPlayer("4065648"));
  assert.equal(canLinkTransactionPlayer(null), false);
}

console.log("normalize exact match keys…");
assert.equal(
  normalizePlayerName("De'Anthony Melton"),
  normalizePlayerName("DeAnthony Melton")
);

console.log("client import boundary — no Node queries in Transactions UI…");
{
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

  const description = read(
    "src/components/offseason/transaction-description.tsx"
  );
  assert.match(description, /"use client"/);
  assert.doesNotMatch(description, /data\/queries/);
  assert.doesNotMatch(description, /player-season-resolve\.server/);
  assert.doesNotMatch(description, /transaction-player-resolve/);
  assert.match(description, /transaction-player-link/);
  assert.match(description, /transaction-player-resolution/);

  const link = read("src/lib/transaction-player-link.ts");
  assert.doesNotMatch(link, /data\/queries/);
  assert.doesNotMatch(
    link,
    /getPlayerCareerSeasons|getPlayerPageHref|server-only/
  );
  assert.match(link, /player-season-resolve/);

  const seasonResolve = read("src/lib/player-season-resolve.ts");
  assert.doesNotMatch(seasonResolve, /data\/queries|node:fs|server-only/);
  assert.match(seasonResolve, /export function playerPageHref/);

  const seasonServer = read("src/lib/player-season-resolve.server.ts");
  assert.match(seasonServer, /import "server-only"/);
  assert.match(seasonServer, /getPlayerCareerSeasons/);

  const eventUi = read("src/components/offseason/transaction-event-ui.tsx");
  assert.match(eventUi, /"use client"/);
  // Value or type import of clusters would risk pulling node:crypto into the browser graph.
  assert.doesNotMatch(
    eventUi,
    /transaction-event-clusters/
  );
  assert.ok(
    eventUi.includes("@/lib/transaction-event-status") ||
      eventUi.includes("@/lib/transaction-event-presentation"),
    "event UI must use client-safe status/presentation helpers"
  );
}

console.log("OK — transaction-player-resolve / team brands");
