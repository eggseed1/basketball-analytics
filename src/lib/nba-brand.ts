/**
 * NBA team brand colors + public CDN image helpers (ESPN logos / headshots).
 * Used for UI chrome only - not a data-provider dependency.
 */

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
  cha: {
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
  // strip non-letters (e.g. "bos-celtics")
  const abbr = key.replace(/[^a-z]/g, "").slice(0, 3);
  return TEAM_BRANDS[abbr] ?? TEAM_BRANDS[key.slice(0, 3)];
}

/** Chart/timeline stroke color for a team - safe for server + client. */
export function teamChartColor(teamId?: string | null): {
  color: string;
  abbr: string;
} {
  const brand = resolveTeamBrand(teamId);
  if (!brand) return { color: "#8e8e93", abbr: "-" };
  const primary = brand.primary.toLowerCase();
  const color =
    primary === "#ffffff" || primary === "#fff" ? "#1d1d1f" : brand.primary;
  return { color, abbr: brand.abbr };
}

/**
 * Solid accent for bars / chips - always derived from TEAM_BRANDS primary.
 * Never invents a generic green/blue independent of the franchise.
 */
export function teamBrandBarColor(teamKey?: string | null): string {
  return teamChartColor(teamKey).color;
}

function chartSafeHex(hex: string, fallback: string): string {
  const c = hex.trim().toLowerCase();
  if (c === "#ffffff" || c === "#fff") return fallback;
  return hex;
}

/** Primary → secondary wash for similar-player bars (kept quiet on frost). */
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
 * Low-opacity tint of the canonical primary for soft fills.
 * Origin is always TEAM_BRANDS - not a separate palette.
 */
export function teamBrandTint(
  teamKey?: string | null,
  opacity = 0.18
): string {
  const color = teamBrandBarColor(teamKey);
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    return `rgba(142,142,147,${opacity})`;
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
  return `rgba(${r},${g},${b},${opacity})`;
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
 */
export function playerHeadshotCandidates(options: {
  playerId?: string | null;
  espnId?: string | null;
  nbaId?: string | null;
}): string[] {
  const { playerId, espnId, nbaId } = options;
  const urls: string[] = [];
  const push = (url?: string) => {
    if (url && !urls.includes(url)) urls.push(url);
  };

  push(espnHeadshotUrl(espnId));
  push(nbaHeadshotUrl(nbaId));

  if (isNumericId(playerId) && playerId !== espnId && playerId !== nbaId) {
    // Explore board rows are NBA person ids with no espnId/nbaId split.
    push(nbaHeadshotUrl(playerId));
    push(espnHeadshotUrl(playerId));
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
