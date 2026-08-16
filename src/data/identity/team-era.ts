import { HISTORICAL_ABBR_ALIASES } from "@/data/identity/historical-abbr-aliases";
import {
  getCanonicalTeamById,
  resolveCanonicalTeam,
} from "@/data/identity/team-map";
import { startYearFromCanonicalSeason } from "@/data/providers/historical/season-range";

export type TeamEra = {
  /** Inclusive first season (canonical YYYY-YY). */
  startSeason: string;
  /** Inclusive last season; omit = through present. */
  endSeason?: string;
  abbr: string;
  displayName: string;
  city: string;
  nickname: string;
};

export { HISTORICAL_ABBR_ALIASES };

/** Eras keyed by canonical ESPN team id. Ordered oldest → newest per franchise. */
export const TEAM_ERAS_BY_CANONICAL_ID: Record<string, TeamEra[]> = {
  // Oklahoma City Thunder / Seattle SuperSonics (ESPN 25)
  "25": [
    {
      startSeason: "1967-68",
      endSeason: "2007-08",
      abbr: "SEA",
      displayName: "Seattle SuperSonics",
      city: "Seattle",
      nickname: "SuperSonics",
    },
    {
      startSeason: "2008-09",
      abbr: "OKC",
      displayName: "Oklahoma City Thunder",
      city: "Oklahoma City",
      nickname: "Thunder",
    },
  ],
  // Brooklyn Nets / New Jersey Nets (ESPN 17)
  "17": [
    {
      startSeason: "1977-78",
      endSeason: "2011-12",
      abbr: "NJN",
      displayName: "New Jersey Nets",
      city: "New Jersey",
      nickname: "Nets",
    },
    {
      startSeason: "2012-13",
      abbr: "BKN",
      displayName: "Brooklyn Nets",
      city: "Brooklyn",
      nickname: "Nets",
    },
  ],
  // Washington Wizards lineage (ESPN 27) — see FRANCHISE_HISTORIES.was previousHomes
  "27": [
    {
      startSeason: "1961-62",
      endSeason: "1961-62",
      abbr: "CHP",
      displayName: "Chicago Packers",
      city: "Chicago",
      nickname: "Packers",
    },
    {
      startSeason: "1962-63",
      endSeason: "1962-63",
      abbr: "CHZ",
      displayName: "Chicago Zephyrs",
      city: "Chicago",
      nickname: "Zephyrs",
    },
    {
      startSeason: "1963-64",
      endSeason: "1972-73",
      abbr: "BAL",
      displayName: "Baltimore Bullets",
      city: "Baltimore",
      nickname: "Bullets",
    },
    {
      startSeason: "1973-74",
      endSeason: "1973-74",
      abbr: "CAP",
      displayName: "Capital Bullets",
      city: "Washington",
      nickname: "Bullets",
    },
    {
      startSeason: "1974-75",
      endSeason: "1996-97",
      abbr: "WSB",
      displayName: "Washington Bullets",
      city: "Washington",
      nickname: "Bullets",
    },
    {
      startSeason: "1997-98",
      abbr: "WAS",
      displayName: "Washington Wizards",
      city: "Washington",
      nickname: "Wizards",
    },
  ],
  // Charlotte Hornets / Bobcats (ESPN 30) — 2004 expansion Bobcats lineage.
  // Note: BDL may attach 1988–2002 original Hornets games to id 30 after the
  // NBA history reassignment; display often already says “Charlotte Hornets”.
  // Continuous CHH→NOH→NOP eras live under ESPN 3 for provider continuity.
  "30": [
    {
      startSeason: "2004-05",
      endSeason: "2013-14",
      abbr: "CHA",
      displayName: "Charlotte Bobcats",
      city: "Charlotte",
      nickname: "Bobcats",
    },
    {
      startSeason: "2014-15",
      abbr: "CHA",
      displayName: "Charlotte Hornets",
      city: "Charlotte",
      nickname: "Hornets",
    },
  ],
  // Houston Rockets / San Diego Rockets (ESPN 10)
  "10": [
    {
      startSeason: "1967-68",
      endSeason: "1970-71",
      abbr: "SDR",
      displayName: "San Diego Rockets",
      city: "San Diego",
      nickname: "Rockets",
    },
    {
      startSeason: "1971-72",
      abbr: "HOU",
      displayName: "Houston Rockets",
      city: "Houston",
      nickname: "Rockets",
    },
  ],
  // LA Clippers / Buffalo / San Diego (ESPN 12)
  "12": [
    {
      startSeason: "1970-71",
      endSeason: "1977-78",
      abbr: "BUF",
      displayName: "Buffalo Braves",
      city: "Buffalo",
      nickname: "Braves",
    },
    {
      startSeason: "1978-79",
      endSeason: "1983-84",
      abbr: "SDC",
      displayName: "San Diego Clippers",
      city: "San Diego",
      nickname: "Clippers",
    },
    {
      startSeason: "1984-85",
      abbr: "LAC",
      displayName: "Los Angeles Clippers",
      city: "Los Angeles",
      nickname: "Clippers",
    },
  ],
  // Memphis Grizzlies / Vancouver (ESPN 29)
  "29": [
    {
      startSeason: "1995-96",
      endSeason: "2000-01",
      abbr: "VAN",
      displayName: "Vancouver Grizzlies",
      city: "Vancouver",
      nickname: "Grizzlies",
    },
    {
      startSeason: "2001-02",
      abbr: "MEM",
      displayName: "Memphis Grizzlies",
      city: "Memphis",
      nickname: "Grizzlies",
    },
  ],
  // Golden State Warriors / SF / Philadelphia (ESPN 9)
  "9": [
    {
      startSeason: "1946-47",
      endSeason: "1961-62",
      abbr: "PHW",
      displayName: "Philadelphia Warriors",
      city: "Philadelphia",
      nickname: "Warriors",
    },
    {
      startSeason: "1962-63",
      endSeason: "1970-71",
      abbr: "SFW",
      displayName: "San Francisco Warriors",
      city: "San Francisco",
      nickname: "Warriors",
    },
    {
      startSeason: "1971-72",
      abbr: "GSW",
      displayName: "Golden State Warriors",
      city: "Golden State",
      nickname: "Warriors",
    },
  ],
  // Sacramento Kings lineage (ESPN 23) — major modern eras
  "23": [
    {
      startSeason: "1972-73",
      endSeason: "1984-85",
      abbr: "KCK",
      displayName: "Kansas City Kings",
      city: "Kansas City",
      nickname: "Kings",
    },
    {
      startSeason: "1985-86",
      abbr: "SAC",
      displayName: "Sacramento Kings",
      city: "Sacramento",
      nickname: "Kings",
    },
  ],
  // Utah Jazz / New Orleans Jazz (ESPN 26)
  "26": [
    {
      startSeason: "1974-75",
      endSeason: "1978-79",
      abbr: "NOJ",
      displayName: "New Orleans Jazz",
      city: "New Orleans",
      nickname: "Jazz",
    },
    {
      startSeason: "1979-80",
      abbr: "UTA",
      displayName: "Utah Jazz",
      city: "Utah",
      nickname: "Jazz",
    },
  ],
  // LA Lakers / Minneapolis (ESPN 13)
  "13": [
    {
      startSeason: "1948-49",
      endSeason: "1959-60",
      abbr: "MNL",
      displayName: "Minneapolis Lakers",
      city: "Minneapolis",
      nickname: "Lakers",
    },
    {
      startSeason: "1960-61",
      abbr: "LAL",
      displayName: "Los Angeles Lakers",
      city: "Los Angeles",
      nickname: "Lakers",
    },
  ],
  // Atlanta Hawks lineage — St. Louis era common in 1960s cache
  "1": [
    {
      startSeason: "1955-56",
      endSeason: "1967-68",
      abbr: "STL",
      displayName: "St. Louis Hawks",
      city: "St. Louis",
      nickname: "Hawks",
    },
    {
      startSeason: "1968-69",
      abbr: "ATL",
      displayName: "Atlanta Hawks",
      city: "Atlanta",
      nickname: "Hawks",
    },
  ],
  // New Orleans Pelicans / Hornets (ESPN 3)
  "3": [
    {
      startSeason: "1988-89",
      endSeason: "2001-02",
      abbr: "CHH",
      displayName: "Charlotte Hornets",
      city: "Charlotte",
      nickname: "Hornets",
    },
    {
      startSeason: "2002-03",
      endSeason: "2012-13",
      abbr: "NOH",
      displayName: "New Orleans Hornets",
      city: "New Orleans",
      nickname: "Hornets",
    },
    {
      startSeason: "2013-14",
      abbr: "NOP",
      displayName: "New Orleans Pelicans",
      city: "New Orleans",
      nickname: "Pelicans",
    },
  ],
};

function seasonStartYear(season: string): number | null {
  try {
    return startYearFromCanonicalSeason(season);
  } catch {
    return null;
  }
}

/** True when `season` falls within [start, end] inclusive. */
export function seasonInEraRange(
  season: string,
  era: Pick<TeamEra, "startSeason" | "endSeason">
): boolean {
  const y = seasonStartYear(season);
  const start = seasonStartYear(era.startSeason);
  if (y == null || start == null) return false;
  if (y < start) return false;
  if (!era.endSeason) return true;
  const end = seasonStartYear(era.endSeason);
  if (end == null) return false;
  return y <= end;
}

/**
 * Resolve team-era display identity for a canonical franchise id + season.
 * Returns null when no era table applies (caller keeps current identity).
 */
export function resolveTeamEra(
  canonicalTeamId: string,
  season: string
): TeamEra | null {
  const id = String(canonicalTeamId).trim();
  const eras = TEAM_ERAS_BY_CANONICAL_ID[id];
  if (!eras?.length || !season) return null;
  for (const era of eras) {
    if (seasonInEraRange(season, era)) return era;
  }
  return null;
}

/**
 * Resolve era from any team token (canonical id, current abbr, historical abbr).
 */
export function resolveTeamEraFromToken(
  teamToken: string,
  season: string
): { canonicalTeamId: string; era: TeamEra | null } | null {
  const raw = teamToken.trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  const alias = HISTORICAL_ABBR_ALIASES[upper];
  const resolved = resolveCanonicalTeam(alias ?? raw);
  if (resolved.status !== "resolved") {
    const byId = getCanonicalTeamById(raw);
    if (!byId) return null;
    return {
      canonicalTeamId: byId.canonicalTeamId,
      era: resolveTeamEra(byId.canonicalTeamId, season),
    };
  }
  return {
    canonicalTeamId: resolved.team.canonicalTeamId,
    era: resolveTeamEra(resolved.team.canonicalTeamId, season),
  };
}

/** Display fields for one side of a historical game. */
export function teamEraDisplay(
  canonicalTeamId: string,
  season: string,
  fallback?: { abbr?: string; displayName?: string }
): { abbr: string; displayName: string; fromEra: boolean } {
  const era = resolveTeamEra(canonicalTeamId, season);
  if (era) {
    return {
      abbr: era.abbr,
      displayName: era.displayName,
      fromEra: true,
    };
  }
  const team = getCanonicalTeamById(canonicalTeamId);
  return {
    abbr: (fallback?.abbr || team?.abbr || canonicalTeamId).toUpperCase(),
    displayName:
      fallback?.displayName || team?.displayName || canonicalTeamId,
    fromEra: false,
  };
}

export function listMappedCanonicalTeamIds(): string[] {
  return Object.keys(TEAM_ERAS_BY_CANONICAL_ID);
}
