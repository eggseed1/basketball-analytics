/**
 * Historical team brand / logo / palette resolution + visible marks.
 * Run: npx tsx scripts/test-historical-team-brand.ts
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  HISTORICAL_TEAM_LOGO_ASSETS,
  resolveHistoricalTeamBrand,
} from "../src/lib/historical-team-brand";
import {
  HISTORICAL_TEAM_PALETTES,
  isModernOkcPalette,
  resolveHistoricalTeamPalette,
} from "../src/lib/historical-team-palette";
import {
  HistoricalTeamMark,
  historicalTeamMarkLabel,
} from "../src/components/brand/historical-team-mark";
import { teamLogoUrl, TEAM_BRANDS } from "../src/lib/nba-brand";

function main() {
  // Inventory: no fabricated historical logo files registered.
  assert.equal(Object.keys(HISTORICAL_TEAM_LOGO_ASSETS).length, 0);
  assert.ok(Object.keys(HISTORICAL_TEAM_PALETTES).length >= 5);

  // --- 1978-79 Seattle: historical text + Sonics colors, never OKC ---
  const sea78 = resolveHistoricalTeamBrand("25", "1978-79", "era");
  assert.ok(sea78);
  assert.equal(sea78!.displayName, "Seattle SuperSonics");
  assert.equal(sea78!.abbreviation, "SEA");
  assert.equal(sea78!.source, "historical_text");
  assert.equal(sea78!.logoUrl, null);
  assert.ok(sea78!.palette);
  assert.equal(sea78!.palette!.primary.toUpperCase(), "#00653A");
  assert.equal(sea78!.palette!.secondary.toUpperCase(), "#FFC200");
  assert.equal(isModernOkcPalette(sea78!.palette!), false);
  assert.notEqual(
    sea78!.palette!.primary.toUpperCase(),
    TEAM_BRANDS.okc.primary.toUpperCase()
  );
  const okcUrl = teamLogoUrl("OKC");
  assert.ok(okcUrl);
  assert.notEqual(sea78!.logoUrl, okcUrl);

  assert.equal(historicalTeamMarkLabel(sea78!), "SEA");
  const seaHtml = renderToStaticMarkup(
    createElement(HistoricalTeamMark, { brand: sea78!, size: "md" })
  );
  assert.ok(seaHtml.includes("SEA"));
  assert.ok(seaHtml.includes("#00653A") || seaHtml.includes("#00653a"));
  assert.ok(seaHtml.includes("#FFC200") || seaHtml.includes("#ffc200"));
  assert.equal(seaHtml.includes("<img"), false);
  assert.equal(seaHtml.includes("bg-primary"), false);

  // --- 2025-26 Oklahoma City: current Thunder logo ---
  const okc25 = resolveHistoricalTeamBrand("25", "2025-26", "era");
  assert.ok(okc25);
  assert.equal(okc25!.displayName, "Oklahoma City Thunder");
  assert.equal(okc25!.abbreviation, "OKC");
  assert.equal(okc25!.source, "current");
  assert.ok(okc25!.logoUrl);
  assert.equal(okc25!.logoUrl, okcUrl);
  assert.equal(okc25!.palette, null);
  const okcHtml = renderToStaticMarkup(
    createElement(HistoricalTeamMark, { brand: okc25!, size: "md" })
  );
  assert.ok(okcHtml.includes("<img"));

  // --- historical_verified image wins over palette ---
  const verifiedHtml = renderToStaticMarkup(
    createElement(HistoricalTeamMark, {
      brand: {
        abbreviation: "SEA",
        displayName: "Seattle SuperSonics",
        logoUrl: "/logos/historical/sea-synthetic-test.svg",
        source: "historical_verified",
        palette: sea78!.palette,
      },
      size: "md",
    })
  );
  assert.ok(verifiedHtml.includes("<img"));
  assert.ok(
    verifiedHtml.includes("/logos/historical/sea-synthetic-test.svg")
  );

  // --- 1995-96 New Jersey Nets ---
  const njn95 = resolveHistoricalTeamBrand("17", "1995-96", "era");
  assert.ok(njn95);
  assert.equal(njn95!.displayName, "New Jersey Nets");
  assert.equal(njn95!.abbreviation, "NJN");
  assert.equal(njn95!.source, "historical_text");
  assert.ok(njn95!.palette);
  assert.notEqual(
    njn95!.palette!.primary.toUpperCase(),
    TEAM_BRANDS.bkn.primary.toUpperCase()
  );
  assert.equal(njn95!.logoUrl, null);

  // --- 1978-79 Washington Bullets ---
  const wsb78 = resolveHistoricalTeamBrand("27", "1978-79", "era");
  assert.ok(wsb78);
  assert.equal(wsb78!.displayName, "Washington Bullets");
  assert.equal(wsb78!.abbreviation, "WSB");
  assert.equal(wsb78!.source, "historical_text");
  assert.ok(wsb78!.palette);
  assert.equal(wsb78!.palette!.primary.toUpperCase(), "#E31837");

  // --- Continuous Boston: current logo ---
  const bos78 = resolveHistoricalTeamBrand("2", "1978-79", "era");
  assert.ok(bos78);
  assert.equal(bos78!.displayName, "Boston Celtics");
  assert.equal(bos78!.source, "current");
  assert.ok(bos78!.logoUrl);

  // --- Bobcats: orange/navy, not Hornets ---
  const chaBobcats = resolveHistoricalTeamBrand("30", "2008-09", "era");
  assert.ok(chaBobcats);
  assert.equal(chaBobcats!.displayName, "Charlotte Bobcats");
  assert.equal(chaBobcats!.source, "historical_text");
  assert.ok(chaBobcats!.palette);
  assert.equal(chaBobcats!.palette!.primary.toUpperCase(), "#F26522");
  assert.notEqual(
    chaBobcats!.palette!.primary.toUpperCase(),
    TEAM_BRANDS.cha.primary.toUpperCase()
  );

  // Hornets (same abbr CHA, later era) may use current logo
  const chaHornets = resolveHistoricalTeamBrand("30", "2025-26", "era");
  assert.equal(chaHornets!.displayName, "Charlotte Hornets");
  assert.equal(chaHornets!.source, "current");

  // --- 2008-09 OKC ---
  const okc08 = resolveHistoricalTeamBrand("25", "2008-09", "era");
  assert.equal(okc08!.source, "current");
  assert.ok(okc08!.logoUrl);

  // --- theme=modern presentation still keeps historical name + colors ---
  const seaModernTheme = resolveHistoricalTeamBrand(
    "25",
    "1978-79",
    "modern_surface"
  );
  assert.equal(seaModernTheme!.displayName, "Seattle SuperSonics");
  assert.equal(seaModernTheme!.source, "historical_text");
  assert.ok(seaModernTheme!.palette);
  assert.equal(seaModernTheme!.palette!.primary.toUpperCase(), "#00653A");

  // Palette lookup helpers
  const seaPal = resolveHistoricalTeamPalette({
    canonicalTeamId: "25",
    abbr: "SEA",
    nickname: "SuperSonics",
  });
  assert.ok(seaPal);
  assert.equal(seaPal!.confidence, "high");
  assert.ok(seaPal!.provenance.toLowerCase().includes("seattle"));

  console.log("test-historical-team-brand: ok");
}

main();
