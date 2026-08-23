import { listCanonicalTeams } from "@/data/identity/team-map";
import type { PlayerSeason } from "@/data/types";
import { mapEspnPosition } from "@/data/transformers/espn";
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { espnFetchJson } from "@/data/providers/nba/espn-client";

const SITE_API = "https://site.api.espn.com";

type EspnRosterAthlete = {
  id: string;
  displayName: string;
  fullName?: string;
  position?: { abbreviation?: string };
  age?: number;
};

type EspnRosterResponse = {
  season?: { displayName?: string };
  athletes?: EspnRosterAthlete[];
  team?: { id: string; abbreviation: string; displayName: string };
};

/**
 * Current league year before regular-season stats exist on NBA Stats.
 *
 * The league year flips July 1, but treating the *entire* current season as
 * preseason caused every board request to fan out across 30 ESPN rosters even
 * after games started. Keep the roster path to the actual offseason/pre-tip
 * window; from October 15 onward the league-dash board is the source of truth.
 */
export function isPreseasonRosterSeason(season: string, now = new Date()): boolean {
  if (season !== canonicalSeasonFromStartYear(currentNbaStartYear(now))) {
    return false;
  }
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  return month < 9 || (month === 9 && day < 15);
}

export async function fetchEspnTeamRosterPlayers(
  espnTeamId: string,
  season: string
): Promise<PlayerSeason[]> {
  const url = `${SITE_API}/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/roster`;
  const payload = await espnFetchJson<EspnRosterResponse>(url, {
    ttlMs: 10 * 60 * 1000,
    retries: 1,
    signal: AbortSignal.timeout(5_000),
  });
  const teamId = String(payload.team?.id ?? espnTeamId);
  const teamName = payload.team?.displayName ?? "";
  const teamAbbr = payload.team?.abbreviation;

  return (payload.athletes ?? []).map((athlete) =>
    withPlayerSeasonDefaults({
      playerId: String(athlete.id),
      playerName: athlete.displayName || athlete.fullName || "",
      teamId,
      teamName,
      teamAbbreviation: teamAbbr,
      season,
      position: mapEspnPosition(athlete.position?.abbreviation),
      age: athlete.age,
      // A roster shell explicitly represents zero games/minutes before tip-off.
      // Every other box/advanced field remains unavailable until measured.
      gamesPlayed: 0,
      gamesStarted: 0,
      minutes: 0,
      teamIdProvider: "espn",
      providerTeamId: teamId,
    })
  );
}

type LeagueRosterEntry = {
  expiresAt: number;
  value: PlayerSeason[];
  inflight?: Promise<PlayerSeason[]>;
};

/** Process-scoped league roster — survives React.cache request boundaries. */
const leagueRosterProcessCache = new Map<string, LeagueRosterEntry>();
const LEAGUE_ROSTER_TTL_MS = 10 * 60 * 1000;

async function fetchEspnLeagueRosterPlayersUncached(
  season: string
): Promise<PlayerSeason[]> {
  const teams = listCanonicalTeams();
  const chunks = await Promise.all(
    teams.map((team) =>
      fetchEspnTeamRosterPlayers(team.canonicalTeamId, season).catch(() => [])
    )
  );
  return chunks.flat();
}

/**
 * All 30 franchises — used when league-dash player stats are empty pre-tip.
 * Singleflight + 10m process TTL so concurrent player/team/board loads share
 * one crawl instead of each spawning 30 ESPN calls.
 */
export async function fetchEspnLeagueRosterPlayers(
  season: string
): Promise<PlayerSeason[]> {
  const now = Date.now();
  const hit = leagueRosterProcessCache.get(season);
  if (hit && hit.expiresAt > now && !hit.inflight) {
    return hit.value;
  }
  if (hit?.inflight) return hit.inflight;

  const inflight = fetchEspnLeagueRosterPlayersUncached(season)
    .then((value) => {
      leagueRosterProcessCache.set(season, {
        expiresAt: Date.now() + LEAGUE_ROSTER_TTL_MS,
        value,
      });
      return value;
    })
    .catch((error) => {
      leagueRosterProcessCache.delete(season);
      throw error;
    });

  leagueRosterProcessCache.set(season, {
    expiresAt: now + LEAGUE_ROSTER_TTL_MS,
    value: hit?.value ?? [],
    inflight,
  });
  return inflight;
}
