/**
 * Historical team-era identity - Seattle ≠ Oklahoma City in the 1970s.
 */
import assert from "node:assert/strict";

import {
  resolveTeamEra,
  teamEraDisplay,
  seasonInEraRange,
} from "../src/data/identity/team-era";
import { resolveCanonicalTeam } from "../src/data/identity/team-map";
import {
  applyHistoricalTeamEraToGame,
  ensureGameTeamIdentity,
  gameSideBrandKey,
  gameSideDisplayName,
} from "../src/lib/game-team-identity";
import { transformBdlGame } from "../src/data/transformers/balldontlie";
import type { Game } from "../src/data/types";

function assertNoThunder(label: string, text: string) {
  assert.ok(
    !/oklahoma city|thunder/i.test(text),
    `${label} must not show OKC Thunder: ${text}`
  );
}

function main() {
  // --- Era table ---
  const sea = resolveTeamEra("25", "1969-70");
  assert.ok(sea);
  assert.equal(sea!.abbr, "SEA");
  assert.equal(sea!.displayName, "Seattle SuperSonics");
  assert.ok(seasonInEraRange("1969-70", sea!));

  const okc = resolveTeamEra("25", "2024-25");
  assert.ok(okc);
  assert.equal(okc!.abbr, "OKC");
  assert.equal(okc!.displayName, "Oklahoma City Thunder");

  const njn = resolveTeamEra("17", "2005-06");
  assert.equal(njn?.displayName, "New Jersey Nets");
  const bkn = resolveTeamEra("17", "2015-16");
  assert.equal(bkn?.displayName, "Brooklyn Nets");

  const bal = resolveTeamEra("27", "1969-70");
  assert.equal(bal?.displayName, "Baltimore Bullets");
  const packers = resolveTeamEra("27", "1961-62");
  assert.equal(packers?.displayName, "Chicago Packers");
  const wiz = resolveTeamEra("27", "2000-01");
  assert.equal(wiz?.displayName, "Washington Wizards");

  const bobcats = resolveTeamEra("30", "2010-11");
  assert.equal(bobcats?.displayName, "Charlotte Bobcats");
  const hornets = resolveTeamEra("30", "2015-16");
  assert.equal(hornets?.displayName, "Charlotte Hornets");

  const sdr = resolveTeamEra("10", "1969-70");
  assert.equal(sdr?.displayName, "San Diego Rockets");
  const hou = resolveTeamEra("10", "2020-21");
  assert.equal(hou?.displayName, "Houston Rockets");

  const buf = resolveTeamEra("12", "1974-75");
  assert.equal(buf?.displayName, "Buffalo Braves");
  const lac = resolveTeamEra("12", "2020-21");
  assert.equal(lac?.displayName, "Los Angeles Clippers");

  // Historical abbr → franchise
  const seaResolved = resolveCanonicalTeam("SEA");
  assert.equal(seaResolved.status, "resolved");
  if (seaResolved.status === "resolved") {
    assert.equal(seaResolved.team.canonicalTeamId, "25");
  }
  assert.equal(resolveCanonicalTeam("NJN").status, "resolved");

  // --- Anachronistic BDL-style row (matches real 1969-70 cache bug) ---
  const raw: Game = {
    id: "883136",
    season: "1969-70",
    gameDate: "1969-10-14",
    homeTeamId: "20",
    awayTeamId: "21", // BDL OKC id before normalize
    homeTeamAbbr: "NYK",
    awayTeamAbbr: "OKC",
    homeTeamName: "New York Knicks",
    awayTeamName: "Oklahoma City Thunder",
    homeScore: 100,
    awayScore: 90,
    gameType: "regular",
    status: "final",
  };

  const fixed = ensureGameTeamIdentity(raw, "bdl");
  assert.equal(fixed.awayTeamId, "25", "BDL 21 → canonical ESPN OKC franchise 25");
  assert.equal(fixed.awayTeamAbbr, "SEA");
  assert.equal(fixed.awayTeamName, "Seattle SuperSonics");
  assertNoThunder("away name", fixed.awayTeamName ?? "");
  assertNoThunder("brand key", gameSideBrandKey(fixed, "away"));
  assert.equal(gameSideDisplayName(fixed, "away"), "Seattle SuperSonics");

  // Current OKC game must stay Thunder
  const modern = applyHistoricalTeamEraToGame({
    ...raw,
    id: "modern",
    season: "2024-25",
    gameDate: "2024-11-01",
    awayTeamId: "25",
    awayTeamAbbr: "OKC",
    awayTeamName: "Oklahoma City Thunder",
    teamIdProvider: "espn",
    homeProviderTeamId: "20",
    awayProviderTeamId: "25",
  });
  assert.equal(modern.awayTeamAbbr, "OKC");
  assert.equal(modern.awayTeamName, "Oklahoma City Thunder");

  // Without provider namespace, do not stamp eras onto bare numeric ids
  // (BDL 25 = POR, ESPN 25 = OKC).
  const ambiguous = applyHistoricalTeamEraToGame({
    id: "amb",
    season: "1969-70",
    gameDate: "1969-10-14",
    homeTeamId: "25",
    awayTeamId: "2",
    homeTeamAbbr: "POR",
    awayTeamAbbr: "BOS",
    homeTeamName: "Portland Trail Blazers",
    awayTeamName: "Boston Celtics",
    homeScore: 1,
    awayScore: 2,
    gameType: "regular",
    status: "final",
  });
  assert.equal(ambiguous.homeTeamAbbr, "POR");
  assert.equal(ambiguous.homeTeamName, "Portland Trail Blazers");

  // Transform path: BDL payload with current names
  const transformed = transformBdlGame({
    id: 883136,
    date: "1969-10-14T00:00:00.000Z",
    season: 1969,
    status: "Final",
    period: 4,
    time: " ",
    postseason: false,
    home_team_score: 100,
    visitor_team_score: 90,
    home_team: {
      id: 20,
      abbreviation: "NYK",
      city: "New York",
      conference: "East",
      division: "Atlantic",
      full_name: "New York Knicks",
      name: "Knicks",
    },
    visitor_team: {
      id: 21,
      abbreviation: "OKC",
      city: "Oklahoma City",
      conference: "West",
      division: "Northwest",
      full_name: "Oklahoma City Thunder",
      name: "Thunder",
    },
  } as Parameters<typeof transformBdlGame>[0]);

  assert.equal(transformed.awayTeamId, "25");
  assert.equal(transformed.awayTeamAbbr, "SEA");
  assert.equal(transformed.awayTeamName, "Seattle SuperSonics");
  assertNoThunder("transform", transformed.awayTeamName ?? "");

  // Display helper
  assert.equal(
    teamEraDisplay("25", "1969-70").displayName,
    "Seattle SuperSonics"
  );
  assert.equal(teamEraDisplay("25", "1969-70").fromEra, true);

  console.log("test-historical-team-era: ok");
}

main();
