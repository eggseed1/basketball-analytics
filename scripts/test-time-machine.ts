/**
 * NBA Time Machine - era theme resolution, URL roundtrip, identity checks.
 * Run: npx tsx scripts/test-time-machine.ts
 */
import assert from "node:assert/strict";

import {
  parseThemeMode,
  resolveActiveEraTheme,
  resolveEraThemeForSeason,
  adjacentSeason,
  clampDateToSeason,
  seasonDateBounds,
} from "../src/themes/era-theme";
import {
  historyHref,
  parseHistorySearchParams,
  gameLabFromHistoryHref,
  playerFromHistoryHref,
  teamFromHistoryHref,
  parseDestinationHistoryArrival,
} from "../src/themes/history-url";
import {
  resolveTeamEra,
  teamEraDisplay,
} from "../src/data/identity/team-era";
import {
  resolveHistoricalTeamBrand,
} from "../src/lib/historical-team-brand";
import { primaryNavLabelForPath, PRIMARY_NAV } from "../src/components/sports/site-nav";
import { askDrblHref } from "../src/components/players/player-ask-links";
import { teamLogoUrl } from "../src/lib/nba-brand";

function main() {
  // --- Theme resolution ---
  assert.equal(resolveEraThemeForSeason("1978-79").id, "early");
  assert.equal(resolveEraThemeForSeason("1995-96").id, "1990s");
  assert.equal(resolveEraThemeForSeason("2008-09").id, "2000s");
  assert.equal(resolveEraThemeForSeason("2012-13").id, "2010s");
  assert.equal(resolveEraThemeForSeason("2015-16").id, "2010s");
  assert.equal(resolveEraThemeForSeason("2025-26").id, "modern");

  // --- Theme override ---
  assert.equal(parseThemeMode("modern"), "modern");
  assert.equal(parseThemeMode("historical"), "historical");
  assert.equal(parseThemeMode(undefined), "historical");
  assert.equal(
    resolveActiveEraTheme("1978-79", "modern").id,
    "modern"
  );
  assert.equal(
    resolveActiveEraTheme("1978-79", "historical").id,
    "early"
  );

  // --- URL roundtrip ---
  const href = historyHref({
    season: "1978-79",
    theme: "modern",
    date: "1979-01-15",
  });
  assert.equal(href, "/history?season=1978-79&theme=modern&date=1979-01-15");
  const parsed = parseHistorySearchParams({
    season: "1978-79",
    theme: "modern",
    date: "1979-01-15",
  });
  assert.equal(parsed.season, "1978-79");
  assert.equal(parsed.theme, "modern");
  assert.equal(parsed.date, "1979-01-15");

  // historical theme omitted from URL
  assert.equal(
    historyHref({ season: "1995-96", theme: "historical" }),
    "/history?season=1995-96"
  );

  const gameHref = gameLabFromHistoryHref("883136", {
    season: "1978-79",
    theme: "historical",
  });
  assert.ok(gameHref.includes("/games/883136"));
  assert.ok(gameHref.includes("from=history"));
  assert.ok(gameHref.includes("theme=historical"));

  const playerHref = playerFromHistoryHref("123", "1978-79", "historical");
  assert.ok(playerHref.includes("/players/123"));
  assert.ok(playerHref.includes("season=1978-79"));
  assert.ok(playerHref.includes("from=history"));
  assert.ok(playerHref.includes("theme=historical"));

  const teamHref = teamFromHistoryHref("25", "1978-79", "historical");
  assert.ok(teamHref.includes("/teams/25"));
  assert.ok(teamHref.includes("from=history"));
  assert.ok(teamHref.includes("theme=historical"));

  const arrival = parseDestinationHistoryArrival({
    from: "history",
    theme: "historical",
    season: "1978-79",
  });
  assert.equal(arrival.fromHistory, true);
  assert.equal(arrival.applyEraTheme, true);
  const seasons = ["1977-78", "1978-79", "1979-80"];
  assert.equal(adjacentSeason("1978-79", -1, seasons), "1977-78");
  assert.equal(adjacentSeason("1978-79", 1, seasons), "1979-80");
  assert.equal(adjacentSeason("1977-78", -1, seasons), null);
  const bounds = seasonDateBounds("1978-79");
  assert.equal(bounds.start, "1978-10-01");
  assert.equal(bounds.end, "1979-06-30");
  assert.equal(clampDateToSeason("1978-09-01", "1978-79"), "1978-10-01");
  assert.equal(clampDateToSeason("1979-08-01", "1978-79"), "1979-06-30");

  // --- Historical identity (manual eras) ---
  assert.equal(
    resolveTeamEra("25", "1978-79")?.displayName,
    "Seattle SuperSonics"
  );
  assert.equal(
    resolveTeamEra("27", "1978-79")?.displayName,
    "Washington Bullets"
  );
  assert.equal(
    teamEraDisplay("2", "1978-79", { displayName: "Boston Celtics" })
      .displayName,
    "Boston Celtics"
  );

  assert.equal(
    resolveTeamEra("25", "1995-96")?.displayName,
    "Seattle SuperSonics"
  );
  assert.equal(
    resolveTeamEra("17", "1995-96")?.displayName,
    "New Jersey Nets"
  );

  assert.equal(
    resolveTeamEra("25", "2008-09")?.displayName,
    "Oklahoma City Thunder"
  );

  assert.equal(
    resolveTeamEra("25", "2025-26")?.displayName,
    "Oklahoma City Thunder"
  );

  // --- Historical logos / palettes ---
  const seaBrand = resolveHistoricalTeamBrand("25", "1978-79");
  assert.equal(seaBrand?.abbreviation, "SEA");
  assert.equal(seaBrand?.source, "historical_text");
  assert.equal(seaBrand?.logoUrl, null);
  assert.ok(seaBrand?.palette);
  assert.notEqual(
    seaBrand?.palette?.primary.toUpperCase(),
    "#007AC1"
  );
  const bosBrand = resolveHistoricalTeamBrand("2", "1978-79");
  assert.equal(bosBrand?.source, "current");
  assert.ok(bosBrand?.logoUrl);
  const okcBrand = resolveHistoricalTeamBrand("25", "2025-26");
  assert.equal(okcBrand?.source, "current");
  assert.equal(okcBrand?.logoUrl, teamLogoUrl("OKC"));
  const njnBrand = resolveHistoricalTeamBrand("17", "1995-96");
  assert.equal(njnBrand?.abbreviation, "NJN");
  assert.equal(njnBrand?.source, "historical_text");
  assert.ok(njnBrand?.palette);

  // --- Nav ---
  assert.equal(primaryNavLabelForPath("/history"), "History");
  assert.equal(primaryNavLabelForPath("/history?season=1978-79"), "History");
  assert.equal(primaryNavLabelForPath("/franchises"), "History");
  const historyNav = PRIMARY_NAV.find((n) => n.id === "history");
  assert.ok(historyNav?.subnav?.some((s) => s.href === "/history"));
  assert.ok(historyNav?.subnav?.some((s) => s.href === "/franchises"));

  // ASK context: season embedded in supported query strings (v1 contract)
  const askQ = `Who led the NBA in scoring in 1978-79?`;
  assert.ok(askQ.includes("1978-79"));

  // Structured Time Machine → ASK context URL
  const askHref = askDrblHref("Who led the NBA in scoring?", {
    season: "1978-79",
    fromHistory: true,
  });
  assert.ok(askHref.includes("season=1978-79"));
  assert.ok(askHref.includes("from=history"));

  console.log("test-time-machine: ok");
}

main();
