import type {
  ConferenceStandings,
  LeagueStandings,
  StandingRow,
} from "@/data/types/standings";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";

const STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";

type EspnStandingStat = {
  name: string;
  value?: number;
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

function statMap(stats: EspnStandingStat[]): Map<string, EspnStandingStat> {
  const map = new Map<string, EspnStandingStat>();
  for (const s of stats) map.set(s.name, s);
  return map;
}

function num(map: Map<string, EspnStandingStat>, key: string): number {
  return map.get(key)?.value ?? 0;
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

export async function fetchLeagueStandings(
  season: string
): Promise<LeagueStandings> {
  const year = espnYearFromCanonicalSeason(season);
  const payload = await espnFetchJson<EspnStandingsResponse>(
    `${STANDINGS_URL}?season=${year}`,
    { ttlMs: 1000 * 60 * 5 }
  );

  const conferences: ConferenceStandings[] = [];
  for (const child of payload.children ?? []) {
    const conference = conferenceFromChild(child);
    const entries = child.standings?.entries ?? [];
    // ESPN often returns entries in division / arbitrary order - not by seed.
    const rows = entries
      .map((entry) => transformEntry(entry, conference, 0))
      .sort(compareStandingRows)
      .map((row, i) => ({ ...row, rank: i + 1 }));
    conferences.push({ conference, rows });
  }

  // Stable East / West order
  conferences.sort((a, b) => a.conference.localeCompare(b.conference));

  return { season, conferences };
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
