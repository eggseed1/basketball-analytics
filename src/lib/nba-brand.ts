/**
 * NBA team brand colors + public CDN image helpers (ESPN logos / headshots).
 * Used for UI chrome only - not a data-provider dependency.
 */

import { HISTORICAL_ABBR_ALIASES } from "@/data/identity/historical-abbr-aliases";
import { resolvePlayerPortraitCandidates } from "@/lib/player-media-resolve";

export type TeamBrand = {
  id: string;
  abbr: string;
  /** ESPN teamlogos slug (often differs from abbr) */
  logoSlug: string;
  espnTeamId: string;
  primary: string;
  secondary: string;
  accent?: string;
};

/** Abbr → brand (covers Franchise Lab + ESPN abbreviations). */
export const TEAM_BRANDS: Record<string, TeamBrand> = {
  atl: {
    id: "atl",
    abbr: "ATL",
    logoSlug: "atl",
    espnTeamId: "1",
    primary: "#E03A3E",
    secondary: "#C1D32F",
  },
  bos: {
    id: "bos",
    abbr: "BOS",
    logoSlug: "bos",
    espnTeamId: "2",
    primary: "#007A33",
    secondary: "#BA9653",
  },
  bkn: {
    id: "bkn",
    abbr: "BKN",
    logoSlug: "bkn",
    espnTeamId: "17",
    primary: "#000000",
    secondary: "#FFFFFF",
  },
  /** Basketball-Reference Brooklyn code. */
  brk: {
    id: "bkn",
    abbr: "BKN",
    logoSlug: "bkn",
    espnTeamId: "17",
    primary: "#000000",
    secondary: "#FFFFFF",
  },
  cha: {
    id: "cha",
    abbr: "CHA",
    logoSlug: "cha",
    espnTeamId: "30",
    primary: "#1D1160",
    secondary: "#00788C",
  },
  /** Basketball-Reference Charlotte code. */
  cho: {
    id: "cha",
    abbr: "CHA",
    logoSlug: "cha",
    espnTeamId: "30",
    primary: "#1D1160",
    secondary: "#00788C",
  },
  chi: {
    id: "chi",
    abbr: "CHI",
    logoSlug: "chi",
    espnTeamId: "4",
    primary: "#CE1141",
    secondary: "#000000",
  },
  cle: {
    id: "cle",
    abbr: "CLE",
    logoSlug: "cle",
    espnTeamId: "5",
    primary: "#860038",
    secondary: "#FDBB30",
  },
  dal: {
    id: "dal",
    abbr: "DAL",
    logoSlug: "dal",
    espnTeamId: "6",
    primary: "#00538C",
    secondary: "#B8C4CA",
  },
  den: {
    id: "den",
    abbr: "DEN",
    logoSlug: "den",
    espnTeamId: "7",
    primary: "#0E2240",
    secondary: "#FEC524",
  },
  det: {
    id: "det",
    abbr: "DET",
    logoSlug: "det",
    espnTeamId: "8",
    primary: "#C8102E",
    secondary: "#1D42BA",
  },
  gsw: {
    id: "gsw",
    abbr: "GSW",
    logoSlug: "gs",
    espnTeamId: "9",
    primary: "#1D428A",
    secondary: "#FFC72C",
  },
  gs: {
    id: "gsw",
    abbr: "GSW",
    logoSlug: "gs",
    espnTeamId: "9",
    primary: "#1D428A",
    secondary: "#FFC72C",
  },
  hou: {
    id: "hou",
    abbr: "HOU",
    logoSlug: "hou",
    espnTeamId: "10",
    primary: "#CE1141",
    secondary: "#000000",
  },
  ind: {
    id: "ind",
    abbr: "IND",
    logoSlug: "ind",
    espnTeamId: "11",
    primary: "#002D62",
    secondary: "#FDBB30",
  },
  lac: {
    id: "lac",
    abbr: "LAC",
    logoSlug: "lac",
    espnTeamId: "12",
    primary: "#C8102E",
    secondary: "#1D428A",
  },
  lal: {
    id: "lal",
    abbr: "LAL",
    logoSlug: "lal",
    espnTeamId: "13",
    primary: "#552583",
    secondary: "#FDB927",
  },
  mem: {
    id: "mem",
    abbr: "MEM",
    logoSlug: "mem",
    espnTeamId: "29",
    primary: "#5D76A9",
    secondary: "#12173F",
  },
  mia: {
    id: "mia",
    abbr: "MIA",
    logoSlug: "mia",
    espnTeamId: "14",
    primary: "#98002E",
    secondary: "#F9A01B",
  },
  mil: {
    id: "mil",
    abbr: "MIL",
    logoSlug: "mil",
    espnTeamId: "15",
    primary: "#00471B",
    secondary: "#EEE1C6",
  },
  min: {
    id: "min",
    abbr: "MIN",
    logoSlug: "min",
    espnTeamId: "16",
    primary: "#0C2340",
    secondary: "#236192",
  },
  nop: {
    id: "nop",
    abbr: "NOP",
    logoSlug: "no",
    espnTeamId: "3",
    primary: "#0C2340",
    secondary: "#C8102E",
  },
  no: {
    id: "nop",
    abbr: "NOP",
    logoSlug: "no",
    espnTeamId: "3",
    primary: "#0C2340",
    secondary: "#C8102E",
  },
  nyk: {
    id: "nyk",
    abbr: "NYK",
    logoSlug: "ny",
    espnTeamId: "18",
    primary: "#006BB6",
    secondary: "#F58426",
  },
  ny: {
    id: "nyk",
    abbr: "NYK",
    logoSlug: "ny",
    espnTeamId: "18",
    primary: "#006BB6",
    secondary: "#F58426",
  },
  okc: {
    id: "okc",
    abbr: "OKC",
    logoSlug: "okc",
    espnTeamId: "25",
    primary: "#007AC1",
    secondary: "#EF3B24",
  },
  orl: {
    id: "orl",
    abbr: "ORL",
    logoSlug: "orl",
    espnTeamId: "19",
    primary: "#0077C0",
    secondary: "#C4CED4",
  },
  phi: {
    id: "phi",
    abbr: "PHI",
    logoSlug: "phi",
    espnTeamId: "20",
    primary: "#006BB6",
    secondary: "#ED174C",
  },
  phx: {
    id: "phx",
    abbr: "PHX",
    logoSlug: "phx",
    espnTeamId: "21",
    primary: "#1D1160",
    secondary: "#E56020",
  },
  /** Basketball-Reference Phoenix code. */
  pho: {
    id: "phx",
    abbr: "PHX",
    logoSlug: "phx",
    espnTeamId: "21",
    primary: "#1D1160",
    secondary: "#E56020",
  },
  por: {
    id: "por",
    abbr: "POR",
    logoSlug: "por",
    espnTeamId: "22",
    primary: "#E03A3E",
    secondary: "#000000",
  },
  sac: {
    id: "sac",
    abbr: "SAC",
    logoSlug: "sac",
    espnTeamId: "23",
    primary: "#5A2D81",
    secondary: "#63727A",
  },
  sas: {
    id: "sas",
    abbr: "SAS",
    logoSlug: "sa",
    espnTeamId: "24",
    primary: "#C4CED4",
    secondary: "#000000",
  },
  sa: {
    id: "sas",
    abbr: "SAS",
    logoSlug: "sa",
    espnTeamId: "24",
    primary: "#C4CED4",
    secondary: "#000000",
  },
  tor: {
    id: "tor",
    abbr: "TOR",
    logoSlug: "tor",
    espnTeamId: "28",
    primary: "#CE1141",
    secondary: "#000000",
  },
  uta: {
    id: "uta",
    abbr: "UTA",
    logoSlug: "utah",
    espnTeamId: "26",
    primary: "#002B5C",
    secondary: "#F9A01B",
  },
  utah: {
    id: "uta",
    abbr: "UTA",
    logoSlug: "utah",
    espnTeamId: "26",
    primary: "#002B5C",
    secondary: "#F9A01B",
  },
  was: {
    id: "was",
    abbr: "WAS",
    logoSlug: "wsh",
    espnTeamId: "27",
    primary: "#002B5C",
    secondary: "#E31837",
  },
  wsh: {
    id: "was",
    abbr: "WAS",
    logoSlug: "wsh",
    espnTeamId: "27",
    primary: "#002B5C",
    secondary: "#E31837",
  },
};

/** ESPN numeric team id → brand */
const BY_ESPN_ID: Record<string, TeamBrand> = Object.fromEntries(
  Object.values(TEAM_BRANDS).map((b) => [b.espnTeamId, b])
);

export function resolveTeamBrand(
  teamKey?: string | null
): TeamBrand | undefined {
  if (!teamKey) return undefined;
  const key = teamKey.trim().toLowerCase();
  if (TEAM_BRANDS[key]) return TEAM_BRANDS[key];
  if (BY_ESPN_ID[key]) return BY_ESPN_ID[key];
  // Never invent a brand from digit prefixes (e.g. NBA Stats 1610612760 → "161").
  if (/^\d+$/.test(key)) return undefined;
  const upper = teamKey.trim().toUpperCase();
  const historical = HISTORICAL_ABBR_ALIASES[upper];
  if (historical) {
    const viaAlias = TEAM_BRANDS[historical.toLowerCase()];
    if (viaAlias) return viaAlias;
  }
  // strip non-letters (e.g. "bos-celtics")
  const abbr = key.replace(/[^a-z]/g, "").slice(0, 3);
  return TEAM_BRANDS[abbr] ?? TEAM_BRANDS[key.slice(0, 3)];
}

export type ChartSurface = "light" | "dark";

const CHART_INK_LIGHT = "#1d1d1f";

function expandHex(hex: string): string | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const body = match[1]!;
  if (body.length === 3) {
    return body
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return body;
}

function hexRelativeLuminance(hex: string): number {
  const full = expandHex(hex);
  if (!full) return 0;
  const channels = [0, 2, 4].map((start) => {
    const value = parseInt(full.slice(start, start + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
  );
}

type Oklch = { l: number; c: number; h: number };

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function hexToOklch(hex: string): Oklch | null {
  const full = expandHex(hex);
  if (!full) return null;
  const [r, g, b] = [0, 2, 4].map((start) =>
    srgbToLinear(parseInt(full.slice(start, start + 2), 16) / 255)
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    l: L,
    c: Math.hypot(A, B),
    h: (Math.atan2(B, A) * 180) / Math.PI,
  };
}

function oklchToLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

function inGamut(rgb: [number, number, number]): boolean {
  return rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

function oklchToHex(color: Oklch): string {
  // Keep hue and lightness; shed only as much chroma as sRGB forces.
  let lo = 0;
  let hi = color.c;
  let rgb = oklchToLinearRgb(color);
  if (!inGamut(rgb)) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinearRgb({ ...color, c: mid }))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinearRgb({ ...color, c: lo });
  }
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

/** OKLCH lightness at which a brand color reads on the dark card (~4.5:1+). */
const DARK_SURFACE_MIN_L = 0.72;

/**
 * Raise a brand color to a readable lightness on dark surfaces without
 * mixing in white, which turns navies and purples chalky. Hue holds; chroma
 * is kept up to the sRGB edge.
 */
export function liftForDarkSurface(
  hex: string,
  minLightness = DARK_SURFACE_MIN_L
): string {
  const color = hexToOklch(hex);
  if (!color || color.l >= minLightness) return hex;
  return oklchToHex({ ...color, l: minLightness });
}

/** Ensure franchise primaries stay readable on chart surfaces. */
export function ensureChartColorOnSurface(
  primary: string,
  secondary: string,
  surface: ChartSurface
): string {
  const primaryLower = primary.trim().toLowerCase();
  if (surface === "light") {
    if (primaryLower === "#ffffff" || primaryLower === "#fff") {
      return CHART_INK_LIGHT;
    }
    return primary;
  }

  const primaryLum = hexRelativeLuminance(primary);
  const secondaryLum = hexRelativeLuminance(secondary);

  if (primaryLum < 0.12 && secondaryLum >= 0.25) {
    return secondary;
  }
  if (primaryLum >= 0.42) return primary;
  if (secondaryLum >= 0.35 && primaryLum < 0.26) return secondary;
  // Achromatic primaries (black, charcoal) lift to plain grey; a colored
  // secondary keeps the team recognizable instead.
  const primaryChroma = hexToOklch(primary)?.c ?? 0;
  const secondaryChroma = hexToOklch(secondary)?.c ?? 0;
  if (primaryChroma < 0.03 && secondaryChroma >= 0.08) {
    return liftForDarkSurface(secondary);
  }
  return liftForDarkSurface(primary);
}

/**
 * Chart/timeline stroke per franchise.
 * Official primaries collide hard across the league (navy/red/royal blue).
 * These stay on-brand by preferring the more distinctive primary *or* secondary
 * so neighboring series stay separable on career charts and standings trackers.
 */
const TEAM_CHART_HEX: Record<string, string> = {
  atl: "#C1D32F", // volt — separates from POR/CHI reds
  bos: "#007A33",
  bkn: "#C6C6C6", // silver — black collapses with HOU
  cha: "#00788C", // teal — purple collides with PHX
  chi: "#CE1141",
  cle: "#860038", // wine — unique vs bright reds
  dal: "#00538C",
  den: "#0E2240", // nuggets navy — gold collides with GSW chart gold
  det: "#1D42BA", // pistons blue — red collides with CHI/LAC
  gsw: "#FFC72C", // warriors gold — blue collides with DET/DAL
  hou: "#000000", // black — primary red collides with CHI
  ind: "#002D62", // pacers navy
  lac: "#C8102E",
  lal: "#552583",
  mem: "#5D76A9", // light steel — unique among blues
  mia: "#98002E", // heat wine — orange collides with NYK/PHX
  mil: "#00471B",
  min: "#236192", // secondary blue — navy collides with NOP
  nop: "#C8A45C", // pelicans gold — navy collides with DEN/MIN
  nyk: "#F58426", // knicks orange — royal blue collides with OKC
  okc: "#007AC1",
  orl: "#C4CED4", // silver — blue nearly identical to OKC
  phi: "#ED174C", // sixers red — blue collides with NYK
  phx: "#E56020", // suns orange — purple collides with CHA/LAL
  por: "#E03A3E",
  sac: "#63727A", // slate — purple collides with LAL
  sas: "#8A8D8F", // darker silver — separates from BKN
  tor: "#B4975A", // raptors gold — red collides with CHI/HOU
  uta: "#F9A01B", // jazz gold — navy collides with IND
  was: "#E31837", // wizards red — navy collides with IND
};

/**
 * League-wide chart stroke, for charts that put many franchises on one canvas
 * (standings tracker, league scatters, race tracker). Uses TEAM_CHART_HEX so
 * 30 lines stay separable. Everywhere else, use `teamChartColor`.
 */
export function teamLeagueChartColor(
  teamId?: string | null,
  options?: { surface?: ChartSurface }
): {
  color: string;
  abbr: string;
} {
  const surface = options?.surface ?? "light";
  const brand = resolveTeamBrand(teamId);
  if (!brand) {
    return { color: neutralChartColor(surface), abbr: "-" };
  }
  const chartHex = TEAM_CHART_HEX[brand.id] ?? brand.primary;
  // Pair with the other brand stop so dark-surface lift can fall back sanely.
  const fallback =
    chartHex.toLowerCase() === brand.primary.toLowerCase()
      ? brand.secondary
      : brand.primary;
  const color = ensureChartColorOnSurface(chartHex, fallback, surface);
  return { color, abbr: brand.abbr };
}

function neutralChartColor(surface: ChartSurface): string {
  return surface === "dark" ? "#a6a9b1" : "#8e8e93";
}

/** The franchise's own colors in the order to try them, readable on `surface`. */
function brandColorCandidates(
  brand: { primary: string; secondary: string; id: string },
  surface: ChartSurface
): string[] {
  const out: string[] = [];
  const push = (color: string | null) => {
    if (color && !out.some((c) => c.toLowerCase() === color.toLowerCase())) out.push(color);
  };
  push(matchupBrandColor(brand.primary, brand.secondary, surface));
  push(matchupBrandColor(brand.secondary, brand.primary, surface));
  const league = TEAM_CHART_HEX[brand.id];
  if (league) push(ensureChartColorOnSurface(league, brand.primary, surface));
  if (surface === "light") push(darkenForLightSurface(brand.secondary));
  return out;
}

/** Heat gold or Pacers yellow, deepened until it reads on white. */
function darkenForLightSurface(hex: string): string | null {
  const color = hexToOklch(hex);
  if (!color || color.c < 0.03) return null;
  for (let l = color.l; l > 0.3; l -= 0.02) {
    const candidate = oklchToHex({ ...color, l });
    if (hexRelativeLuminance(candidate) <= LIGHT_SURFACE_MAX_LUM) return candidate;
  }
  return null;
}

/**
 * A franchise's own color for charts, swatches, bars and timelines: the brand
 * primary, or the secondary when the primary would wash out on `surface`
 * (Spurs silver on white, Nets black on the dark card).
 */
export function teamChartColor(
  teamId?: string | null,
  options?: { surface?: ChartSurface }
): {
  color: string;
  abbr: string;
} {
  const surface = options?.surface ?? "light";
  const brand = resolveTeamBrand(teamId);
  if (!brand) return { color: neutralChartColor(surface), abbr: "-" };
  return {
    color: brandColorCandidates(brand, surface)[0] ?? neutralChartColor(surface),
    abbr: brand.abbr,
  };
}

/**
 * `count` separable colors from one franchise, for a chart split into parts
 * (shot diet, play types). Primary first, then the secondary when it reads on
 * `surface` and differs enough, then lighter and deeper steps of the primary.
 */
export function teamChartPalette(
  teamId: string | null | undefined,
  count: number,
  options?: { surface?: ChartSurface }
): string[] {
  const surface = options?.surface ?? "light";
  const brand = resolveTeamBrand(teamId);
  const base = brand
    ? brandColorCandidates(brand, surface)
    : [surface === "dark" ? "#7aa7ff" : "#2f5fd0"];
  const out: string[] = [];
  const add = (color: string) => {
    if (out.length < count && out.every((c) => oklabDistance(c, color) >= DISTINCT_TEAM_MIN_DELTA)) {
      out.push(color);
    }
  };
  for (const color of base) add(color);
  const anchor = hexToOklch(out[0] ?? base[0]!);
  if (anchor) {
    const steps = surface === "dark" ? [-0.18, 0.14, -0.3, 0.24] : [0.2, -0.14, 0.32, 0.1];
    for (const delta of steps) {
      const l = Math.max(0.28, Math.min(0.92, anchor.l + delta));
      add(oklchToHex({ ...anchor, l }));
    }
  }
  while (out.length < count) out.push(out[out.length - 1] ?? neutralChartColor(surface));
  return out;
}

function oklabDistance(a: string, b: string): number {
  const x = hexToOklch(a);
  const y = hexToOklch(b);
  if (!x || !y) return 0;
  const toLab = (c: Oklch) => [
    c.l,
    c.c * Math.cos((c.h * Math.PI) / 180),
    c.c * Math.sin((c.h * Math.PI) / 180),
  ];
  const [l1, a1, b1] = toLab(x);
  const [l2, a2, b2] = toLab(y);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Below this OKLab distance two franchise colors read as the same team. */
const DISTINCT_TEAM_MIN_DELTA = 0.12;

/**
 * Brand colors for a handful of teams on one chart (a career timeline, a
 * trade). Each team keeps its primary unless an earlier team already owns a
 * near-identical color (Clippers red, then Raptors red); then it falls back to
 * its secondary, then its league-chart color. When no option clears every
 * earlier team, the one that differs from the team right before it wins, since
 * neighbors are what a timeline puts side by side. Order the keys by priority.
 * Picks are made on the light surface so a team keeps the same color in both
 * themes.
 */
export function distinctTeamColors(
  teamKeys: (string | null | undefined)[],
  surface: ChartSurface = "light"
): Map<string, string> {
  const light = pickDistinctTeamColors(teamKeys);
  if (surface === "light") return light;
  return new Map(
    [...light].map(([key, color]) => [
      key,
      resolveTeamBrand(key) ? liftKeepingContrast(color) : neutralChartColor("dark"),
    ])
  );
}

/**
 * Dark-surface version of a light-surface pick. `liftForDarkSurface` raises
 * every dark color to the same floor, so navy and royal blue land on one shade;
 * this maps lightness into a readable band instead, so a navy stint stays
 * darker than the royal blue next to it.
 */
function liftKeepingContrast(hex: string): string {
  const color = hexToOklch(hex);
  if (!color) return hex;
  if (color.c < 0.03) return oklchToHex({ ...color, l: Math.max(color.l, 0.68) });
  return oklchToHex({ ...color, l: Math.min(0.94, 0.52 + 0.46 * color.l) });
}

function pickDistinctTeamColors(
  teamKeys: (string | null | undefined)[]
): Map<string, string> {
  const surface: ChartSurface = "light";
  const out = new Map<string, string>();
  const used: string[] = [];
  for (const key of teamKeys) {
    if (!key || out.has(key)) continue;
    const brand = resolveTeamBrand(key);
    if (!brand) {
      out.set(key, neutralChartColor(surface));
      continue;
    }
    const sameFranchise = [...out.keys()].find((k) => resolveTeamBrand(k)?.id === brand.id);
    if (sameFranchise) {
      out.set(key, out.get(sameFranchise)!);
      continue;
    }
    const candidates = brandColorCandidates(brand, surface);
    const gap = (color: string) =>
      used.length ? Math.min(...used.map((u) => oklabDistance(color, u))) : Infinity;
    const previous = used.at(-1);
    const clearOfPrevious = (color: string) =>
      !previous || oklabDistance(color, previous) >= DISTINCT_TEAM_MIN_DELTA;
    const color =
      candidates.find((c) => gap(c) >= DISTINCT_TEAM_MIN_DELTA) ??
      candidates.find(clearOfPrevious) ??
      [...candidates].sort((p, q) => gap(q) - gap(p))[0] ??
      neutralChartColor(surface);
    out.set(key, color);
    used.push(color);
  }
  return out;
}

/**
 * Solid accent for bars / chips — the franchise's own color.
 */
export function teamBrandBarColor(
  teamKey?: string | null,
  options?: { surface?: ChartSurface }
): string {
  return teamChartColor(teamKey, options).color;
}

function chartSafeHex(hex: string, fallback: string): string {
  const c = hex.trim().toLowerCase();
  if (c === "#ffffff" || c === "#fff") return fallback;
  return hex;
}

/** Primary → secondary wash for soft fills (category chips, frost accents). */
export function teamBrandBarGradient(teamKey?: string | null): string {
  const brand = resolveTeamBrand(teamKey);
  if (!brand) {
    return "linear-gradient(90deg, color-mix(in oklab, var(--foreground) 18%, transparent), color-mix(in oklab, var(--foreground) 8%, transparent))";
  }
  const start = chartSafeHex(brand.primary, brand.secondary);
  const end = chartSafeHex(brand.secondary, start);
  return `linear-gradient(90deg, color-mix(in oklab, ${start} 36%, var(--background)) 0%, color-mix(in oklab, ${end} 20%, var(--background)) 100%)`;
}

/**
 * High-contrast fill for compare matchup bars — solid franchise color so
 * length reads clearly on white/frost cards (not the quiet frost wash).
 */
export function teamBrandCompareBarFill(teamKey?: string | null): string {
  return teamBrandBarColor(teamKey, { surface: "light" });
}

const MATCHUP_FALLBACK = {
  light: { a: "#1d6fd8", b: "#e0620d" },
  dark: { a: "#5b9cf0", b: "#ff8a4c" },
} as const;

function hexDistance(a: string, b: string): number {
  const left = expandHex(a);
  const right = expandHex(b);
  if (!left || !right) return 0;
  let sum = 0;
  for (const start of [0, 2, 4]) {
    const d =
      parseInt(left.slice(start, start + 2), 16) -
      parseInt(right.slice(start, start + 2), 16);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Past this luminance a color washes out as text or a thin bar on white. */
const LIGHT_SURFACE_MAX_LUM = 0.45;

/**
 * One team's side in a head-to-head, from its brand pair rather than the
 * chart palette: TEAM_CHART_HEX swaps in secondaries (ATL volt, GSW gold,
 * ORL silver) that only make sense when 30 lines share one chart.
 */
function matchupBrandColor(
  first: string,
  second: string,
  surface: ChartSurface
): string | null {
  if (surface === "light") {
    if (hexRelativeLuminance(first) <= LIGHT_SURFACE_MAX_LUM) return first;
    return hexRelativeLuminance(second) <= LIGHT_SURFACE_MAX_LUM ? second : null;
  }
  const firstChroma = hexToOklch(first)?.c ?? 0;
  const secondChroma = hexToOklch(second)?.c ?? 0;
  return liftForDarkSurface(
    firstChroma < 0.03 && secondChroma >= 0.08 ? second : first
  );
}

/**
 * Two distinguishable colors for a head-to-head. Unknown teams (career rows,
 * multi-team seasons) and same-color franchises get a blue/orange fallback so
 * the sides never collapse into one hue.
 */
export function compareMatchupColors(
  aTeamKey?: string | null,
  bTeamKey?: string | null,
  surface: ChartSurface = "light"
): { a: string; b: string } {
  const fallback = MATCHUP_FALLBACK[surface];
  const aBrand = resolveTeamBrand(aTeamKey);
  const bBrand = resolveTeamBrand(bTeamKey);
  const a =
    (aBrand &&
      matchupBrandColor(aBrand.primary, aBrand.secondary, surface)) ??
    fallback.a;
  let b =
    (bBrand &&
      matchupBrandColor(bBrand.primary, bBrand.secondary, surface)) ??
    fallback.b;
  if (hexDistance(a, b) < 110) {
    const alt =
      bBrand && aBrand?.id !== bBrand.id
        ? matchupBrandColor(bBrand.secondary, bBrand.primary, surface)
        : null;
    b =
      alt && hexDistance(a, alt) >= 110
        ? alt
        : hexDistance(a, fallback.b) >= 110
          ? fallback.b
          : fallback.a;
  }
  return { a, b };
}

/**
 * Low-opacity tint of the canonical primary for soft fills.
 * Origin is always TEAM_BRANDS - not a separate palette.
 */
export function teamBrandTint(
  teamKey?: string | null,
  opacity = 0.18,
  options?: { surface?: ChartSurface }
): string {
  const surface = options?.surface ?? "light";
  const effectiveOpacity =
    surface === "dark" ? Math.min(1, opacity * 1.45) : opacity;
  const color = teamBrandBarColor(teamKey, { surface });
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    return `rgba(142,142,147,${effectiveOpacity})`;
  }
  const hex = color.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${effectiveOpacity})`;
}

export function teamLogoUrl(
  teamKey?: string | null,
  size: 100 | 500 = 500
): string | undefined {
  const brand = resolveTeamBrand(teamKey);
  if (!brand) return undefined;
  return `https://a.espncdn.com/i/teamlogos/nba/${size}/${brand.logoSlug}.png`;
}

function isNumericId(id?: string | null): id is string {
  return !!id && /^\d+$/.test(id);
}

export function espnHeadshotUrl(playerId?: string | null): string | undefined {
  if (!isNumericId(playerId)) return undefined;
  return `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`;
}

/** NBA.com person-id headshots (DARKO / stats.nba ids). */
export function nbaHeadshotUrl(playerId?: string | null): string | undefined {
  if (!isNumericId(playerId)) return undefined;
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
}

/**
 * Ordered headshot candidates. Never pair an ESPN athlete id with the NBA CDN
 * (that CDN returns HTTP 200 fallback.png - a blank image, no onError).
 * Never prefer ESPN CDN for an NBA person id (404s; Next/Image often won't fall back).
 *
 * Uses portrait-lookup / approvedUrl first, then typed ids, then ESPN-before-NBA
 * guesses for a bare numeric playerId (skipped when registryOnly).
 */
export function playerHeadshotCandidates(options: {
  playerId?: string | null;
  espnId?: string | null;
  nbaId?: string | null;
  approvedUrl?: string | null;
  registryOnly?: boolean;
}): string[] {
  const { playerId, espnId, nbaId, approvedUrl, registryOnly } = options;
  const urls = resolvePlayerPortraitCandidates({
    playerId,
    espnId,
    nbaId,
    role: "PLAYER",
    approvedUrl,
    registryOnly,
  });
  if (registryOnly) return urls;

  const push = (url?: string) => {
    if (url && !urls.includes(url)) urls.push(url);
  };

  // Fallthrough for call sites that only pass playerId.
  if (isNumericId(playerId) && playerId !== espnId && playerId !== nbaId) {
    // ESPN first: real 404 triggers onError. NBA CDN silently returns fallback.png.
    push(espnHeadshotUrl(playerId));
    const nbaGuess = nbaHeadshotUrl(playerId);
    if (
      nbaGuess &&
      !urls.some((u) => u.includes(`/260x190/${playerId}.png`))
    ) {
      push(nbaGuess);
    }
  }

  return urls;
}

/** @deprecated Prefer playerHeadshotCandidates - kept for simple call sites. */
export function playerHeadshotUrl(playerId?: string | null): string | undefined {
  return playerHeadshotCandidates({ playerId })[0];
}

/** Canonical 30-team list (deduped aliases), sorted by abbreviation. */
export const ALL_TEAM_ABBRS: string[] = (() => {
  const byId = new Map<string, string>();
  for (const brand of Object.values(TEAM_BRANDS)) {
    if (!byId.has(brand.id)) byId.set(brand.id, brand.id);
  }
  return [...byId.keys()].sort((a, b) => a.localeCompare(b));
})();

/** @deprecated Prefer ALL_TEAM_ABBRS - kept for any featured-only call sites. */
export const FEATURED_TEAM_ABBRS = ALL_TEAM_ABBRS;
