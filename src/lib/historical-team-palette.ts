/**
 * Era-aware historical team color palettes for text marks.
 *
 * These are DRBL presentation colors for monograms - not official logo art.
 * Only high-confidence franchise-era colors are registered; uncertain eras
 * stay unregistered so the UI uses a neutral mark instead of guessing.
 *
 * Lookup keys: `${canonicalEspnId}:${abbr}` (primary) or nickname keys where noted.
 */

export type HistoricalTeamBrandPalette = {
  primary: string;
  secondary: string;
  accent?: string;
  /** Readable text/monogram color on `primary`. */
  foreground: string;
  /** Short provenance note (internal). */
  provenance: string;
  confidence: "high" | "medium";
};

type PaletteEntry = HistoricalTeamBrandPalette;

/** Relative luminance for WCAG-ish contrast (sRGB hex). */
export function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (full.length !== 6 || !/^[0-9a-fA-F]+$/.test(full)) return 0;
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLin(parseInt(full.slice(0, 2), 16));
  const g = toLin(parseInt(full.slice(2, 4), 16));
  const b = toLin(parseInt(full.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Deterministic readable foreground for a fill color. */
export function contrastForeground(primaryHex: string): string {
  return relativeLuminance(primaryHex) > 0.45 ? "#1a1510" : "#ffffff";
}

function palette(
  primary: string,
  secondary: string,
  provenance: string,
  confidence: "high" | "medium" = "high",
  accent?: string
): PaletteEntry {
  return {
    primary,
    secondary,
    accent,
    foreground: contrastForeground(primary),
    provenance,
    confidence,
  };
}

/**
 * Static registry - keyed by canonical ESPN id + historical abbr.
 * Do not map SEA → OKC Thunder blues/oranges.
 */
export const HISTORICAL_TEAM_PALETTES: Readonly<Record<string, PaletteEntry>> =
  {
    // Seattle SuperSonics - classic green / gold (1967-2008)
    "25:SEA": palette(
      "#00653A",
      "#FFC200",
      "Seattle SuperSonics classic home identity (green/gold), widely cited franchise colors for the SEA era; not OKC Thunder.",
      "high"
    ),

    // New Jersey Nets - red / navy (pre-Brooklyn)
    "17:NJN": palette(
      "#002A5C",
      "#E03A3E",
      "New Jersey Nets red/navy identity used through the NJN era; distinct from Brooklyn black/white.",
      "high"
    ),

    // Washington Bullets (Capital / Washington)
    "27:WSB": palette(
      "#E31837",
      "#002B5C",
      "Washington Bullets red/blue/white identity for the WSB era.",
      "high"
    ),
    "27:CAP": palette(
      "#E31837",
      "#002B5C",
      "Capital Bullets transitional red/blue (same Bullets lineage as WSB).",
      "medium"
    ),
    "27:BAL": palette(
      "#E31837",
      "#002B5C",
      "Baltimore Bullets red/blue identity.",
      "high"
    ),

    // Charlotte Bobcats - orange / blue (not modern Hornets teal/purple)
    "30:CHA:Bobcats": palette(
      "#F26522",
      "#2B2C65",
      "Charlotte Bobcats orange/navy identity (2004-14); not Hornets teal/purple.",
      "high"
    ),

    // Vancouver Grizzlies - turquoise / bronze
    "29:VAN": palette(
      "#00B2A9",
      "#F56600",
      "Vancouver Grizzlies turquoise/bronze expansion identity.",
      "high"
    ),

    // New Orleans Jazz - purple / green
    "26:NOJ": palette(
      "#4A2583",
      "#6BB32E",
      "New Orleans Jazz purple/green identity before Utah relocation.",
      "high"
    ),

    // Buffalo Braves - black / orange
    "12:BUF": palette(
      "#E35205",
      "#000000",
      "Buffalo Braves orange/black identity.",
      "high"
    ),

    // San Diego Clippers - blue / red
    "12:SDC": palette(
      "#1D428A",
      "#C8102E",
      "San Diego Clippers blue/red identity.",
      "high"
    ),

    // San Diego Rockets - red / white
    "10:SDR": palette(
      "#CE1141",
      "#FFFFFF",
      "San Diego Rockets red/white identity before Houston.",
      "medium"
    ),

    // Kansas City Kings - blue / red
    "23:KCK": palette(
      "#753BBD",
      "#C8102E",
      "Kansas City Kings purple/red era identity (pre-Sacramento).",
      "medium"
    ),

    // Original Charlotte Hornets (CHH lineage under ESPN 3)
    "3:CHH": palette(
      "#1D1160",
      "#00788C",
      "Original Charlotte Hornets teal/purple identity (CHH).",
      "high"
    ),

    // New Orleans Hornets
    "3:NOH": palette(
      "#00788C",
      "#1D1160",
      "New Orleans Hornets teal/purple identity.",
      "high"
    ),
  };

/**
 * Resolve a historical palette for a team-era identity.
 * Returns null when no verified palette is registered (neutral mark).
 */
export function resolveHistoricalTeamPalette(input: {
  canonicalTeamId: string;
  abbr: string;
  nickname?: string;
}): HistoricalTeamBrandPalette | null {
  const id = String(input.canonicalTeamId).trim();
  const abbr = input.abbr.trim().toUpperCase();
  const nick = input.nickname?.trim();

  // Bobcats share CHA abbr with later Hornets - nickname key required.
  if (nick === "Bobcats") {
    const bobcats = HISTORICAL_TEAM_PALETTES[`${id}:CHA:Bobcats`];
    if (bobcats) return bobcats;
  }

  const byExact = HISTORICAL_TEAM_PALETTES[`${id}:${abbr}`];
  if (byExact) return byExact;

  return null;
}

/** True when a palette matches modern OKC Thunder blues/oranges (regression guard). */
export function isModernOkcPalette(
  palette: Pick<HistoricalTeamBrandPalette, "primary" | "secondary">
): boolean {
  const p = palette.primary.toUpperCase();
  const s = palette.secondary.toUpperCase();
  // Current TEAM_BRANDS.okc
  return p === "#007AC1" && s === "#EF3B24";
}
