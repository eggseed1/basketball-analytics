/**
 * NBA retired jersey numbers keyed by NBA PERSON_ID. Rows come from
 * `retired-jerseys.json` (scripts/build-retired-jerseys.mjs), built from
 * Wikipedia's list of NBA retired numbers. Only player banners are included.
 */
import retiredFile from "./retired-jerseys.json";

export type RetiredJerseyRecord = {
  /** stats.nba.com PERSON_ID */
  nbaPlayerId: string;
  /** Brand key (bos, chi, …); `sea` is the SuperSonics banner set. */
  teamKey: string;
  /** Exact number on the banner ("34", "00", "6", …). */
  number: string;
  /** Display name for audit / aria. */
  playerName: string;
  /** Years with the franchise as listed by the source ("—" when honorary). */
  years?: string;
  /** Retired by a franchise the player never played for. */
  honorary?: boolean;
};

type RetiredFile = {
  source: string;
  bannerCounts: Record<string, number>;
  ambiguousNames: string[];
  jerseys: RetiredJerseyRecord[];
};

const FILE = retiredFile as RetiredFile;

export const RETIRED_JERSEYS_SOURCE = FILE.source;

/**
 * Arena-accurate banner palettes: number + field + frame as hung in the building.
 * Falls back to primary-on-white when a franchise isn’t listed.
 */
export type RetiredJerseyPalette = {
  number: string;
  field: string;
  border: string;
};

/** Known arena banner treatments (verified from team/brand + public photos). */
export const RETIRED_JERSEY_PALETTES: Record<string, RetiredJerseyPalette> = {
  // Celtics: kelly green digits on white, green frame (e.g. Pierce #34).
  bos: { number: "#007A33", field: "#FFFFFF", border: "#007A33" },
  // Bulls: red on white.
  chi: { number: "#CE1141", field: "#FFFFFF", border: "#CE1141" },
  // Lakers: purple on gold.
  lal: { number: "#552583", field: "#FDB927", border: "#552583" },
  // Spurs: black on silver/white.
  sas: { number: "#000000", field: "#C4CED4", border: "#000000" },
  // Heat: red on yellow gold.
  mia: { number: "#98002E", field: "#F9A01B", border: "#98002E" },
  // Knicks: blue on orange.
  nyk: { number: "#006BB6", field: "#F58426", border: "#006BB6" },
  // Nets (NJ/BKN): black on white.
  bkn: { number: "#000000", field: "#FFFFFF", border: "#000000" },
  // Mavericks: blue on silver.
  dal: { number: "#00538C", field: "#B8C4CA", border: "#00538C" },
  // Rockets: red on white.
  hou: { number: "#CE1141", field: "#FFFFFF", border: "#CE1141" },
  // Jazz: navy on gold.
  uta: { number: "#002B5C", field: "#F9A01B", border: "#002B5C" },
  // Suns: purple on orange.
  phx: { number: "#1D1160", field: "#E56020", border: "#1D1160" },
  // Pacers: navy on gold.
  ind: { number: "#002D62", field: "#FDBB30", border: "#002D62" },
  // Pistons: red on blue (modern) — classic Bad Boys used red/white/blue.
  det: { number: "#C8102E", field: "#FFFFFF", border: "#1D42BA" },
  // Sixers: red on blue.
  phi: { number: "#ED174C", field: "#006BB6", border: "#002B5C" },
  // Warriors: blue on gold.
  gsw: { number: "#1D428A", field: "#FFC72C", border: "#1D428A" },
  // Blazers: red on black.
  por: { number: "#E03A3E", field: "#000000", border: "#E03A3E" },
  // Thunder: blue on orange. SuperSonics banners: green on gold.
  okc: { number: "#007AC1", field: "#EF3B24", border: "#002D62" },
  sea: { number: "#00653A", field: "#FFC200", border: "#00653A" },
  // Nuggets: navy on gold.
  den: { number: "#0E2240", field: "#FEC524", border: "#0E2240" },
  // Bucks: green on cream.
  mil: { number: "#00471B", field: "#EEE1C6", border: "#00471B" },
  // Magic: blue on black.
  orl: { number: "#0077C0", field: "#000000", border: "#C4CED4" },
  // Cavs: wine on gold.
  cle: { number: "#860038", field: "#FDBB30", border: "#860038" },
  // Hawks: red on yellow.
  atl: { number: "#E03A3E", field: "#C1D32F", border: "#E03A3E" },
  // Hornets: teal/purple.
  cha: { number: "#1D1160", field: "#00788C", border: "#1D1160" },
  // Kings: purple on silver.
  sac: { number: "#5A2D81", field: "#63727A", border: "#5A2D81" },
  // Wizards / Bullets era: red/blue/white.
  was: { number: "#E31837", field: "#FFFFFF", border: "#002B5C" },
  // Timberwolves: blue on green/silver.
  min: { number: "#0C2340", field: "#236192", border: "#78BE20" },
  // Raptors: red on black.
  tor: { number: "#CE1141", field: "#000000", border: "#CE1141" },
  // Grizzlies: navy on gold.
  mem: { number: "#5D76A9", field: "#FDB927", border: "#12173F" },
  // Pelicans / NO Hornets: navy/red/gold.
  nop: { number: "#0C2340", field: "#C8102E", border: "#85714D" },
};

/** Multi-franchise honors appear as separate rows for the same player id. */
export const RETIRED_JERSEYS: RetiredJerseyRecord[] = FILE.jerseys;

/** Numbered banners per franchise (players plus coaches, owners and fans). */
export function retiredBannerCount(teamKey: string): number | null {
  return FILE.bannerCounts[teamKey.trim().toLowerCase()] ?? null;
}

/** Must match `norm` in scripts/build-retired-jerseys.mjs. */
export function normalizeRetiredName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'"’]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_NBA_ID = new Map<string, RetiredJerseyRecord[]>();
const BY_NAME = new Map<string, RetiredJerseyRecord[]>();
const AMBIGUOUS_NAMES = new Set(FILE.ambiguousNames);
for (const row of RETIRED_JERSEYS) {
  BY_NBA_ID.set(row.nbaPlayerId, [...(BY_NBA_ID.get(row.nbaPlayerId) ?? []), row]);
  const name = normalizeRetiredName(row.playerName);
  BY_NAME.set(name, [...(BY_NAME.get(name) ?? []), row]);
}

export function getRetiredJerseysByNbaId(
  nbaPlayerId: string | null | undefined
): RetiredJerseyRecord[] {
  if (!nbaPlayerId) return [];
  return BY_NBA_ID.get(String(nbaPlayerId).trim()) ?? [];
}

/**
 * Name fallback for routes with no NBA PERSON_ID (e.g. `bref:zach randolph`).
 * Names shared by two NBA players never match.
 */
export function getRetiredJerseysByName(
  name: string | null | undefined
): RetiredJerseyRecord[] {
  if (!name) return [];
  const key = normalizeRetiredName(name);
  if (!key || AMBIGUOUS_NAMES.has(key)) return [];
  const rows = BY_NAME.get(key) ?? [];
  return new Set(rows.map((r) => r.nbaPlayerId)).size === 1 ? rows : [];
}
