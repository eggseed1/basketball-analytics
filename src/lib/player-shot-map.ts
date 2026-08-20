import type { Shot } from "@/data/types";

export type PlayerShotDot = {
  x: number;
  y: number;
  made: boolean;
  kind: "2PT" | "3PT";
  zone: string;
  dist: number;
  teamId: string;
};

export type PlayerShotZoneRow = {
  zone: string;
  fga: number;
  fgm: number;
  fgPct: number | null;
  frequency: number;
};

export type PlayerShotMap = {
  season: string;
  seasonType: "regular" | "playoffs";
  team: string;
  source: string;
  shots: PlayerShotDot[];
  zones: PlayerShotZoneRow[];
  emptyReason: string | null;
};

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

export function buildPlayerShotMap(options: {
  shots: Shot[];
  season: string;
  seasonType: "regular" | "playoffs";
  team: string;
  emptyReason?: string | null;
}): PlayerShotMap {
  const dots: PlayerShotDot[] = options.shots.map((shot) => ({
    x: shot.locX,
    y: shot.locY,
    made: shot.made,
    kind: shot.shotType,
    zone: shot.shotZoneBasic?.trim() || "Unknown",
    dist: shot.shotDistance,
    teamId: shot.teamId,
  }));
  return {
    season: options.season,
    seasonType: options.seasonType,
    team: options.team,
    source: "NBA Stats shotchartdetail",
    shots: dots,
    zones: zoneRowsFromDots(dots),
    emptyReason:
      options.emptyReason ??
      (dots.length ? null : "No shot locations for this season."),
  };
}
