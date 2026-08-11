import type { PlayerSeason, Position } from "@/data/types";
import type { RawLocalPlayerSeason } from "@/data/providers/sample/local-sample-data";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

function toPosition(value: string): Position | undefined {
  return POSITIONS.includes(value as Position)
    ? (value as Position)
    : undefined;
}

/**
 * Maps messy local JSON / CSV-shaped rows into canonical PlayerSeason.
 * Keep all field remapping here — never in UI components.
 */
export function transformLocalPlayerSeason(
  raw: RawLocalPlayerSeason
): PlayerSeason {
  return {
    playerId: raw.player_id,
    playerName: raw.player_name,
    teamId: raw.team_id,
    teamName: raw.team_name,
    season: raw.season,
    position: toPosition(raw.pos),
    gamesPlayed: raw.gp,
    minutes: raw.min,
    points: raw.pts,
    assists: raw.ast,
    rebounds: raw.reb,
    steals: raw.stl,
    blocks: raw.blk,
    turnovers: raw.tov,
    fieldGoalPct: raw.fg_pct,
    threePointPct: raw.fg3_pct,
    freeThrowPct: raw.ft_pct,
    trueShootingPct: raw.ts_pct,
    effectiveFieldGoalPct: raw.efg_pct,
    usagePct: raw.usg_pct,
    offensiveRating: raw.ortg,
    defensiveRating: raw.drtg,
    netRating: raw.net_rtg,
  };
}

export function transformLocalPlayerSeasons(
  rows: RawLocalPlayerSeason[]
): PlayerSeason[] {
  return rows.map(transformLocalPlayerSeason);
}
