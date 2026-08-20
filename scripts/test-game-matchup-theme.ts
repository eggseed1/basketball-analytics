/**
 * Matchup theme resolution - CHA/BOS identity, home/away order, fallbacks.
 * Run: npx tsx scripts/test-game-matchup-theme.ts
 */
import assert from "node:assert/strict";

import {
  ALL_TEAM_ABBRS,
  TEAM_BRANDS,
  resolveTeamBrand,
} from "../src/lib/nba-brand";
import {
  MATCHUP_THEME_NEUTRAL,
  brandAtmosphereColors,
  brandWashColor,
  buildGameMatchupTheme,
  isValidCssHex,
  matchupThemeFingerprint,
} from "../src/lib/game-matchup-theme";

console.log("CHA @ BOS resolves from metadata…");
const chaAtBos = buildGameMatchupTheme("cha", "bos");
assert.equal(chaAtBos.awayBrand?.abbr, "CHA");
assert.equal(chaAtBos.homeBrand?.abbr, "BOS");
assert.equal(chaAtBos.awayWash, TEAM_BRANDS.cha.primary); // #1D1160
assert.equal(chaAtBos.homeWash, TEAM_BRANDS.bos.primary); // #007A33
assert.equal(
  (chaAtBos.cssVars as Record<string, string>)["--away-color"],
  TEAM_BRANDS.cha.primary
);
assert.equal(
  (chaAtBos.cssVars as Record<string, string>)["--home-color"],
  TEAM_BRANDS.bos.primary
);
assert.ok(chaAtBos.fullyResolved);

console.log("ESPN ids resolve the same brands…");
const byId = buildGameMatchupTheme("30", "2"); // CHA, BOS espn ids
assert.equal(byId.awayBrand?.abbr, "CHA");
assert.equal(byId.homeBrand?.abbr, "BOS");
assert.equal(matchupThemeFingerprint(byId), matchupThemeFingerprint(chaAtBos));

console.log("Home/away reversal flips wash order…");
const bosAtCha = buildGameMatchupTheme("bos", "cha");
assert.notEqual(
  matchupThemeFingerprint(bosAtCha),
  matchupThemeFingerprint(chaAtBos)
);
assert.equal(bosAtCha.awayWash, TEAM_BRANDS.bos.primary);
assert.equal(bosAtCha.homeWash, TEAM_BRANDS.cha.primary);

console.log("Not generic Apple blue/purple…");
assert.notEqual(chaAtBos.awayWash.toLowerCase(), "#0071e3");
assert.notEqual(chaAtBos.homeWash.toLowerCase(), "#af52de");

console.log("Missing / unknown team → deterministic neutral…");
const missing = buildGameMatchupTheme(null, "bos");
assert.equal(missing.awayWash, MATCHUP_THEME_NEUTRAL);
assert.equal(missing.homeWash, TEAM_BRANDS.bos.primary);
assert.equal(missing.awayResolved, false);
assert.equal(missing.homeResolved, true);

const unknown = buildGameMatchupTheme("zzz", "yyy");
assert.equal(unknown.awayWash, MATCHUP_THEME_NEUTRAL);
assert.equal(unknown.homeWash, MATCHUP_THEME_NEUTRAL);
assert.equal(unknown.fullyResolved, false);

console.log("Invalid hex rejected…");
assert.equal(isValidCssHex("#GG0000"), false);
assert.equal(isValidCssHex("not-a-color"), false);
assert.equal(isValidCssHex("#007A33"), true);

console.log("Black/white primary prefers usable secondary, else primary…");
const bkn = resolveTeamBrand("bkn")!;
assert.equal(bkn.primary.toLowerCase(), "#000000");
// Both primary and secondary are near-ink; wash falls back to primary.
assert.equal(brandWashColor(bkn), bkn.primary);
const sas = resolveTeamBrand("sas")!;
assert.ok(isValidCssHex(brandWashColor(sas)));

console.log("All 30 teams resolve a brand + wash…");
assert.equal(ALL_TEAM_ABBRS.length, 30);
const bad: string[] = [];
for (const id of ALL_TEAM_ABBRS) {
  const brand = resolveTeamBrand(id);
  if (!brand) {
    bad.push(`${id}: missing brand`);
    continue;
  }
  if (!isValidCssHex(brand.primary)) {
    bad.push(`${id}: bad primary ${brand.primary}`);
  }
  if (!isValidCssHex(brand.secondary)) {
    bad.push(`${id}: bad secondary ${brand.secondary}`);
  }
  const wash = brandWashColor(brand);
  if (!isValidCssHex(wash) && wash !== MATCHUP_THEME_NEUTRAL) {
    bad.push(`${id}: bad wash ${wash}`);
  }
  // ESPN id round-trip
  const again = resolveTeamBrand(brand.espnTeamId);
  assert.equal(again?.id, brand.id, `${id} espn id ${brand.espnTeamId}`);
}
assert.deepEqual(bad, [], bad.join("\n"));

console.log("LAL @ BOS / GSW @ PHX fingerprints…");
const lalBos = buildGameMatchupTheme("lal", "bos");
assert.equal(lalBos.awayWash, TEAM_BRANDS.lal.primary);
assert.equal(lalBos.homeWash, TEAM_BRANDS.bos.primary);
const gswPhx = buildGameMatchupTheme("gsw", "phx");
assert.equal(gswPhx.awayBrand?.abbr, "GSW");
assert.equal(gswPhx.homeBrand?.abbr, "PHX");

console.log("Page atmosphere uses chromatic team colors…");
const bosAtm = brandAtmosphereColors(
  TEAM_BRANDS.bos.primary,
  TEAM_BRANDS.bos.secondary
);
assert.equal(bosAtm?.colorA, TEAM_BRANDS.bos.primary);
assert.equal(bosAtm?.colorB, TEAM_BRANDS.bos.secondary);
const porAtm = brandAtmosphereColors(
  TEAM_BRANDS.por.primary,
  TEAM_BRANDS.por.secondary
);
assert.equal(porAtm?.colorA, TEAM_BRANDS.por.primary);
assert.equal(porAtm?.colorB, TEAM_BRANDS.por.primary); // skip black
const lalAtm = brandAtmosphereColors(
  TEAM_BRANDS.lal.primary,
  TEAM_BRANDS.lal.secondary
);
assert.equal(lalAtm?.colorA, TEAM_BRANDS.lal.primary);
assert.equal(lalAtm?.colorB, TEAM_BRANDS.lal.secondary);
const sasAtm = brandAtmosphereColors(
  TEAM_BRANDS.sas.primary,
  TEAM_BRANDS.sas.secondary
);
assert.equal(sasAtm?.colorA, TEAM_BRANDS.sas.primary);
assert.equal(sasAtm?.colorB, TEAM_BRANDS.sas.primary);

console.log("OK - game-matchup-theme");
