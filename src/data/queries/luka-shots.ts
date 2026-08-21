import {
  LUKA_NBA_ID,
  type BrefSeasonType,
} from "@/data/providers/nba/bref-player-page";
import { CACHE_TTL_MS } from "@/data/providers/nba/cache-policy";
import { nbaTeamIdFromAbbr } from "@/data/providers/nba/nba-team-meta";
import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "@/data/providers/nba/stats-nba-client";

export type LukaShotDot = {
  x: number;
  y: number;
  made: boolean;
  kind: "2PT" | "3PT";
  zone: string;
  dist: number;
  teamId: string;
};

export type LukaShotZoneRow = {
  zone: string;
  fga: number;
  fgm: number;
  fgPct: number | null;
  frequency: number;
};

export type LukaShotMap = {
  season: string;
  seasonType: BrefSeasonType;
  team: string;
  source: "NBA Stats shotchartdetail";
  shots: LukaShotDot[];
  zones: LukaShotZoneRow[];
  emptyReason: string | null;
};

function nbaSeasonType(type: BrefSeasonType): string {
  return type === "playoffs" ? "Playoffs" : "Regular Season";
}

function parseShotRow(
  row: Record<string, string | number | null>
): LukaShotDot | null {
  const locX = Number(row.LOC_X);
  const locY = Number(row.LOC_Y);
  if (!Number.isFinite(locX) || !Number.isFinite(locY)) return null;
  const zone = String(row.SHOT_ZONE_BASIC ?? "").trim() || "Unknown";
  const isThree =
    zone.toLowerCase().includes("three") ||
    String(row.SHOT_TYPE ?? "").includes("3");
  const made =
    String(row.SHOT_MADE_FLAG) === "1" || Number(row.SHOT_MADE_FLAG) === 1;
  return {
    x: locX / 10,
    y: locY / 10,
    made,
    kind: isThree ? "3PT" : "2PT",
    zone,
    dist: Number(row.SHOT_DISTANCE) || 0,
    teamId: String(row.TEAM_ID ?? ""),
  };
}

function zoneRows(shots: LukaShotDot[]): LukaShotZoneRow[] {
  const groups = new Map<string, { fga: number; fgm: number }>();
  for (const shot of shots) {
    const cur = groups.get(shot.zone) ?? { fga: 0, fgm: 0 };
    cur.fga += 1;
    if (shot.made) cur.fgm += 1;
    groups.set(shot.zone, cur);
  }
  const total = shots.length || 1;
  return [...groups.entries()]
    .map(([zone, { fga, fgm }]) => ({
      zone,
      fga,
      fgm,
      fgPct: fga ? fgm / fga : null,
      frequency: fga / total,
    }))
    .sort((a, b) => b.fga - a.fga);
}

export async function getLukaShotMap(options: {
  season: string;
  seasonType: BrefSeasonType;
  team: string;
}): Promise<LukaShotMap> {
  const { season, seasonType, team } = options;
  const empty = (reason: string): LukaShotMap => ({
    season,
    seasonType,
    team,
    source: "NBA Stats shotchartdetail",
    shots: [],
    zones: [],
    emptyReason: reason,
  });

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
        PlayerID: LUKA_NBA_ID,
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
    if (!set) return empty("NBA Stats did not return a shot chart for this season.");

    let shots = resultSetToObjects(set)
      .map((row) => parseShotRow(row))
      .filter((shot): shot is LukaShotDot => shot != null);

    if (team !== "TOT") {
      const nbaTeamId = nbaTeamIdFromAbbr(team);
      if (!nbaTeamId) {
        return empty(`No NBA team id for ${team}.`);
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

    return {
      season,
      seasonType,
      team,
      source: "NBA Stats shotchartdetail",
      shots,
      zones: zoneRows(shots),
      emptyReason: null,
    };
  } catch {
    return empty("NBA Stats shot chart request failed.");
  }
}
