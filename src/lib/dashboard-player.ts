import type { PlayerSeason, Position } from "@/data/types";

/**
 * Fields required by Contour/Quiver dashboard boards.
 * Keeps the RSC → client payload small vs full PlayerSeason rows.
 */
export interface DashboardPlayer {
  playerId: string;
  playerName: string;
  teamId: string;
  teamAbbreviation?: string;
  position?: Position;
  gamesPlayed: number;
  minutes: number;
  points: number;
  usagePct: number;
  trueShootingPct: number;
  assistPct: number;
  netRating: number;
  per: number;
  vorp: number;
}

export function toDashboardPlayer(row: PlayerSeason): DashboardPlayer {
  return {
    playerId: row.playerId,
    playerName: row.playerName,
    teamId: row.teamId,
    teamAbbreviation: row.teamAbbreviation,
    position: row.position,
    gamesPlayed: row.gamesPlayed,
    minutes: row.minutes,
    points: row.points,
    usagePct: row.usagePct,
    trueShootingPct: row.trueShootingPct,
    assistPct: row.assistPct,
    netRating: row.netRating,
    per: row.per,
    vorp: row.vorp,
  };
}
