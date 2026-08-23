import { resolveNbaIdForDrbl } from "@/data/identity/player-identity";
import { CACHE_TTL_MS } from "@/data/providers/nba/cache-policy";
import { nbaTeamIdFromAbbr } from "@/data/providers/nba/nba-team-meta";
import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "@/data/providers/nba/stats-nba-client";
import {
  buildPlayerShotMap,
  type PlayerShotMap,
} from "@/lib/player-shot-map";
import type { Shot } from "@/data/types";

function nbaSeasonType(seasonType: "regular" | "playoffs"): string {
  return seasonType === "playoffs" ? "Playoffs" : "Regular Season";
}

function parseShotRow(
  row: Record<string, string | number | null>,
  season: string,
  seasonType: "regular" | "playoffs",
  playerId: string
): Shot | null {
  const locX = Number(row.LOC_X);
  const locY = Number(row.LOC_Y);
  if (!Number.isFinite(locX) || !Number.isFinite(locY)) return null;
  const zone = String(row.SHOT_ZONE_BASIC ?? "").trim();
  const isThree =
    zone.toLowerCase().includes("three") ||
    String(row.SHOT_TYPE ?? "").includes("3");
  const made =
    String(row.SHOT_MADE_FLAG) === "1" || Number(row.SHOT_MADE_FLAG) === 1;
  return {
    id: `${row.GAME_ID}-${row.GAME_EVENT_ID}-${row.PLAYER_ID}`,
    gameId: String(row.GAME_ID ?? ""),
    playerId: String(row.PLAYER_ID ?? playerId),
    teamId: String(row.TEAM_ID ?? ""),
    season,
    seasonType,
    gameDate: "",
    period: Number(row.PERIOD) || 0,
    secondsRemaining:
      (Number(row.MINUTES_REMAINING) || 0) * 60 +
      (Number(row.SECONDS_REMAINING) || 0),
    shotDistance: Number(row.SHOT_DISTANCE) || 0,
    locX: locX / 10,
    locY: locY / 10,
    made,
    shotType: isThree ? "3PT" : "2PT",
    shotZoneBasic: zone || undefined,
    shotZoneArea: String(row.SHOT_ZONE_AREA ?? "") || undefined,
    assisted: false,
  };
}

/**
 * Live NBA shot chart for a player-season. One API call per season type.
 * Prefer the P18 offline index when available; use this as fallback.
 */
export async function getPlayerSeasonShotMap(options: {
  playerId: string;
  nbaId?: string | null;
  season: string;
  seasonType: "regular" | "playoffs";
  teamAbbr?: string | null;
  teamLabel: string;
}): Promise<PlayerShotMap> {
  const { playerId, season, seasonType, teamLabel } = options;
  const teamAbbr = (options.teamAbbr ?? "TOT").toUpperCase();
  const empty = (reason: string): PlayerShotMap =>
    buildPlayerShotMap({
      shots: [],
      season,
      seasonType,
      team: teamLabel,
      emptyReason: reason,
    });

  const nbaId = options.nbaId ?? (await resolveNbaIdForDrbl(playerId));
  if (!nbaId) {
    return empty("No NBA player id to load live shot chart.");
  }

  try {
    const response = await statsNbaFetch(
      "shotchartdetail",
      {
        AheadBehind: "",
        ClutchTime: "",
        ContextMeasure: "FGA",
        DateFrom: "",
        DateTo: "",
        EndPeriod: 10,
        EndRange: 28800,
        GameID: "",
        GameSegment: "",
        LastNGames: 0,
        LeagueID: "00",
        Location: "",
        Month: 0,
        OpponentTeamID: 0,
        Outcome: "",
        Period: 0,
        PlayerID: nbaId,
        PlayerPosition: "",
        PointDiff: "",
        Position: "",
        RangeType: 0,
        Season: season,
        SeasonSegment: "",
        SeasonType: nbaSeasonType(seasonType),
        ShotClockRange: "",
        StartPeriod: 1,
        StartRange: 0,
        TeamID: 0,
        VsConference: "",
        VsDivision: "",
      },
      { ttlMs: CACHE_TTL_MS.shots }
    );
    const set = getResultSet(response, "Shot_Chart_Detail");
    if (!set) {
      return empty("NBA Stats did not return a shot chart for this season.");
    }

    let shots = resultSetToObjects(set)
      .map((row) => parseShotRow(row, season, seasonType, nbaId))
      .filter((shot): shot is Shot => shot != null);

    if (teamAbbr !== "TOT") {
      const nbaTeamId = nbaTeamIdFromAbbr(teamAbbr);
      if (!nbaTeamId) {
        return empty(`No NBA team id for ${teamAbbr}.`);
      }
      shots = shots.filter((shot) => shot.teamId === nbaTeamId);
    }

    if (!shots.length) {
      return empty(
        seasonType === "playoffs"
          ? "No playoff shot locations for this season."
          : "No shot locations for this view."
      );
    }

    return buildPlayerShotMap({
      shots,
      season,
      seasonType,
      team: teamLabel,
    });
  } catch {
    return empty("NBA Stats shot chart request failed.");
  }
}
