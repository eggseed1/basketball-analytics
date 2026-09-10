import type {
  ConferenceStandings,
  LeagueStandings,
  StandingRow,
} from "@/data/types/standings";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { getRuntimeStandings } from "@/data/runtime/standings-snapshot";
import { computeStandingsFromGameArchive } from "@/lib/standings-from-games";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { preferBundledProductDataOnEdge } from "@/data/providers/nba/runtime-policy";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";

const SITE_API_STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";
const CDN_STANDINGS_URL = "https://cdn.espn.com/core/nba/standings";

type EspnStandingStat = {
  name: string;
  value?: number | string;
  displayValue?: string;
};

type EspnStandingEntry = {
  team: {
    id: string;
    abbreviation: string;
    displayName: string;
  };
  stats: EspnStandingStat[];
};

type EspnStandingsChild = {
  name?: string;
  abbreviation?: string;
  standings?: { entries?: EspnStandingEntry[] };
};

type EspnStandingsResponse = {
  children?: EspnStandingsChild[];
};

type EspnCdnStandingsResponse = {
  content?: {
    standings?: {
      groups?: EspnStandingsChild[];
    };
  };
};

function statMap(stats: EspnStandingStat[]): Map<string, EspnStandingStat> {
  const map = new Map<string, EspnStandingStat>();
  for (const s of stats) map.set(s.name, s);
  return map;
}

function num(map: Map<string, EspnStandingStat>, key: string): number {
  const raw = map.get(key)?.value;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  const display = map.get(key)?.displayValue;
  if (display && display !== "-" && display !== "—") {
    const n = Number(display);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function display(map: Map<string, EspnStandingStat>, key: string): string {
  return map.get(key)?.displayValue ?? "-";
}

function conferenceFromChild(child: EspnStandingsChild): "East" | "West" {
  const abbr = (child.abbreviation ?? "").toLowerCase();
  const name = (child.name ?? "").toLowerCase();
  if (abbr === "west" || name.includes("west")) return "West";
  return "East";
}

function transformEntry(
  entry: EspnStandingEntry,
  conference: "East" | "West",
  rank: number
): StandingRow {
  const stats = statMap(entry.stats);
  return {
    teamId: String(entry.team.id),
    abbreviation: entry.team.abbreviation,
    displayName: entry.team.displayName,
    conference,
    rank,
    wins: num(stats, "wins"),
    losses: num(stats, "losses"),
    winPct: num(stats, "winPercent"),
    gamesBehind: num(stats, "gamesBehind"),
    differential: num(stats, "differential"),
    ppg: num(stats, "avgPointsFor"),
    oppPpg: num(stats, "avgPointsAgainst"),
    streak: display(stats, "streak"),
    homeRecord: display(stats, "Home"),
    roadRecord: display(stats, "Road"),
    lastTen: display(stats, "Last Ten Games"),
    playoffSeed: num(stats, "playoffSeed") || null,
  };
}

function buildLeagueStandings(
  season: string,
  children: EspnStandingsChild[]
): LeagueStandings {
  const conferences: ConferenceStandings[] = [];
  for (const child of children) {
    const conference = conferenceFromChild(child);
    const entries = child.standings?.entries ?? [];
    const rows = entries
      .map((entry) => transformEntry(entry, conference, 0))
      .sort(compareStandingRows)
      .map((row, i) => ({ ...row, rank: i + 1 }));
    conferences.push({ conference, rows });
  }
  conferences.sort((a, b) => a.conference.localeCompare(b.conference));
  return { season, conferences };
}

function rowCount(data: LeagueStandings): number {
  return data.conferences.reduce((n, c) => n + c.rows.length, 0);
}

function hasPlayedGames(data: LeagueStandings): boolean {
  return data.conferences.some((c) =>
    c.rows.some((row) => row.wins > 0 || row.losses > 0)
  );
}

async function fetchStandingsFromCdn(
  season: string
): Promise<LeagueStandings | null> {
  const year = espnYearFromCanonicalSeason(season);
  try {
    const payload = await espnFetchJson<EspnCdnStandingsResponse>(
      `${CDN_STANDINGS_URL}?xhr=1&season=${year}`,
      { ttlMs: 1000 * 60 * 5, timeoutMs: 3_500, retries: 1 }
    );
    const groups = payload.content?.standings?.groups ?? [];
    if (!groups.length) return null;
    return buildLeagueStandings(season, groups);
  } catch {
    return null;
  }
}

async function fetchStandingsFromSiteApi(
  season: string
): Promise<LeagueStandings | null> {
  const year = espnYearFromCanonicalSeason(season);
  try {
    const payload = await espnFetchJson<EspnStandingsResponse>(
      `${SITE_API_STANDINGS_URL}?season=${year}`,
      { ttlMs: 1000 * 60 * 5, timeoutMs: 2_500, retries: 1 }
    );
    return buildLeagueStandings(season, payload.children ?? []);
  } catch {
    return null;
  }
}

function standingsFromRuntimeBundle(season: string): LeagueStandings | null {
  return getRuntimeStandings(season);
}

function standingsFromGameArchive(season: string): LeagueStandings | null {
  const cached = archiveStandingsCache.get(season);
  if (cached !== undefined) return cached;
  const games = getRuntimeSnapshotGames(season);
  if (!games.length) {
    archiveStandingsCache.set(season, null);
    return null;
  }
  const computed = computeStandingsFromGameArchive(season, games);
  archiveStandingsCache.set(season, computed);
  return computed;
}

const archiveStandingsCache = new Map<string, LeagueStandings | null>();

export async function fetchLeagueStandings(
  season: string
): Promise<LeagueStandings> {
  if (preferBundledProductDataOnEdge()) {
    const bundled = standingsFromRuntimeBundle(season);
    if (bundled && rowCount(bundled) > 0) return bundled;
    const fromArchive = standingsFromGameArchive(season);
    if (fromArchive && rowCount(fromArchive) > 0) return fromArchive;
  }

  // Prefer CDN — site.api.espn.com is often 403 from Cloudflare egress.
  const fromCdn = await fetchStandingsFromCdn(season);
  if (fromCdn && rowCount(fromCdn) > 0) return fromCdn;

  const fromSite = await fetchStandingsFromSiteApi(season);
  if (fromSite && rowCount(fromSite) > 0) return fromSite;

  const bundled = standingsFromRuntimeBundle(season);
  if (bundled && rowCount(bundled) > 0) return bundled;

  const fromArchive = standingsFromGameArchive(season);
  if (fromArchive && rowCount(fromArchive) > 0) return fromArchive;

  return fromCdn ?? fromSite ?? bundled ?? fromArchive ?? { season, conferences: [] };
}

/** True when the payload has conference rows with any W/L. */
export function standingsHaveResults(data: LeagueStandings): boolean {
  return hasPlayedGames(data);
}

/** Conference order: playoff seed, then win%, then wins. */
function compareStandingRows(a: StandingRow, b: StandingRow): number {
  const seedA = a.playoffSeed && a.playoffSeed > 0 ? a.playoffSeed : 99;
  const seedB = b.playoffSeed && b.playoffSeed > 0 ? b.playoffSeed : 99;
  if (seedA !== seedB) return seedA - seedB;
  if (b.winPct !== a.winPct) return b.winPct - a.winPct;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return a.losses - b.losses;
}
