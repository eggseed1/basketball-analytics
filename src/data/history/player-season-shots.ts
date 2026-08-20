/**
 * Load precomputed player-season shot indexes (no request-time raw PBP).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { HISTORY_VERSION } from "@/lib/history/capabilities";
import type { GameShotEvent } from "@/lib/shots/shot-events";
import type { ShotZoneId } from "@/lib/shots/court-geometry";

export type PlayerSeasonShotIndex = {
  playerId: string;
  season: string;
  boxFga: number;
  shotEvents: number;
  coordinateShots: number;
  coverage: number;
  shots: Array<{
    gameId: string;
    eventId: string;
    x: number;
    y: number;
    made: boolean;
    shotValue: 2 | 3;
    period: number;
    clock: string;
    zone: string;
  }>;
};

function indexPath(season: string, playerId: string): string {
  return path.join(
    process.cwd(),
    "data",
    "drbl",
    "history",
    HISTORY_VERSION,
    "indexes",
    "player-shots",
    season,
    `${playerId}.json`
  );
}

export function loadPlayerSeasonShotIndex(
  playerId: string,
  season: string
): PlayerSeasonShotIndex | null {
  const p = indexPath(season, playerId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PlayerSeasonShotIndex;
  } catch {
    return null;
  }
}

export function playerSeasonShotsAsGameEvents(
  index: PlayerSeasonShotIndex
): GameShotEvent[] {
  return index.shots.map((s, i) => ({
    gameId: s.gameId,
    eventId: s.eventId,
    eventIndex: i,
    period: s.period,
    clock: s.clock,
    elapsedGameTime: 0,
    teamId: null,
    playerId: index.playerId,
    playerName: null,
    made: s.made,
    points: s.made ? s.shotValue : 0,
    shotType: s.shotValue === 3 ? "3PT" : "2PT",
    shotDistance: Math.sqrt(s.x * s.x + s.y * s.y),
    x: s.x,
    y: s.y,
    zoneId: (s.zone as ShotZoneId) || "UNKNOWN",
    scoreBefore: { home: 0, away: 0 },
    scoreAfter: { home: 0, away: 0 },
    assistPlayerId: null,
    source: "history_product",
    coordinateAvailable: true,
  }));
}

export function zoneTableFromIndex(index: PlayerSeasonShotIndex) {
  const zones = new Map<
    string,
    { fga: number; fgm: number }
  >();
  for (const s of index.shots) {
    const z = s.zone || "UNKNOWN";
    const cur = zones.get(z) ?? { fga: 0, fgm: 0 };
    cur.fga += 1;
    if (s.made) cur.fgm += 1;
    zones.set(z, cur);
  }
  const total = index.shots.length || 1;
  return [...zones.entries()]
    .map(([zone, v]) => ({
      zone,
      fga: v.fga,
      fgm: v.fgm,
      fgPct: v.fga > 0 ? v.fgm / v.fga : null,
      frequency: v.fga / total,
      pointsPerShot:
        v.fga > 0
          ? index.shots
              .filter((s) => s.zone === zone)
              .reduce((a, s) => a + (s.made ? s.shotValue : 0), 0) / v.fga
          : null,
    }))
    .sort((a, b) => b.fga - a.fga);
}
