import type { PlayerSeasonShotIndex } from "@/data/history/player-season-shots";
import { SHOT_ZONE_LABELS, type ShotZoneId } from "@/lib/shots/court-geometry";
import type {
  PlayerShotDot,
  PlayerShotMap,
  PlayerShotZoneRow,
} from "@/lib/player-shot-map";

function zoneLabel(zone: string): string {
  const known = SHOT_ZONE_LABELS[zone as ShotZoneId];
  return known ?? (zone?.trim() || "Unknown");
}

function zoneRowsFromDots(shots: PlayerShotDot[]): PlayerShotZoneRow[] {
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

/**
 * Adapt P18 player-season shot index → Hannah PlayerShotMap presentation model.
 * No synthetic coordinates. Coverage disclosure stays on the caller.
 */
export function playerSeasonShotIndexToMap(options: {
  index: PlayerSeasonShotIndex | null;
  season: string;
  teamLabel: string;
  seasonType?: "regular" | "playoffs";
  emptyReason?: string | null;
}): PlayerShotMap {
  const { index, season, teamLabel } = options;
  const seasonType = options.seasonType ?? "regular";
  if (!index || index.coordinateShots <= 0) {
    return {
      season,
      seasonType,
      team: teamLabel,
      source: "NBA Stats shot locations",
      shots: [],
      zones: [],
      emptyReason:
        options.emptyReason ??
        (index
          ? "This season's shots have no court locations."
          : "No shot locations are loaded for this season."),
    };
  }

  const dots: PlayerShotDot[] = index.shots.map((s) => ({
    x: s.x,
    y: s.y,
    made: s.made,
    kind: s.shotValue === 3 ? "3PT" : "2PT",
    zone: zoneLabel(s.zone),
    dist: Math.sqrt(s.x * s.x + s.y * s.y),
    teamId: "",
  }));

  return {
    season,
    seasonType,
    team: teamLabel,
    source: "NBA Stats shot locations",
    shots: dots,
    zones: zoneRowsFromDots(dots),
    emptyReason: null,
  };
}
