import {
  LUKA_NBA_ID,
  type BrefSeasonType,
} from "@/data/providers/nba/bref-player-page";
import { getPlayerSeasonShotMap } from "@/data/queries/player-shots";
import type {
  PlayerShotDot,
  PlayerShotMap,
  PlayerShotZoneRow,
} from "@/lib/player-shot-map";

export type LukaShotDot = PlayerShotDot;
export type LukaShotZoneRow = PlayerShotZoneRow;
export type LukaShotMap = PlayerShotMap;

export async function getLukaShotMap(options: {
  season: string;
  seasonType: BrefSeasonType;
  team: string;
}): Promise<LukaShotMap> {
  return getPlayerSeasonShotMap({
    playerId: LUKA_NBA_ID,
    nbaId: LUKA_NBA_ID,
    season: options.season,
    seasonType: options.seasonType,
    teamAbbr: options.team,
    teamLabel: options.team,
  });
}
