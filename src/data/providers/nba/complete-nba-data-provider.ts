import type { PlayerGame, PlayerSeason } from "@/data/types";
import { ResilientNBADataProvider } from "@/data/providers/nba/resilient-nba-data-provider";
import { fetchCompleteEspnPlayerGameLog } from "@/data/providers/nba/espn-player-game-log";

const MISSING = Number.NaN;

/**
 * `playercareerstats` publishes counting totals but not these advanced/impact
 * families. The legacy adapter kept the interface dense by writing zeroes,
 * which made every historical season look like a measured zero. Real values
 * are attached later by BRef/DARKO/LEBRON/DRBL enrichment; until then they must
 * remain unavailable.
 */
function removeCareerEndpointPlaceholders(row: PlayerSeason): PlayerSeason {
  return {
    ...row,
    plusMinus: MISSING,
    assistPct: MISSING,
    offensiveReboundPct: MISSING,
    defensiveReboundPct: MISSING,
    reboundPct: MISSING,
    stealPct: MISSING,
    blockPct: MISSING,
    pie: MISSING,
    per: MISSING,
    ows: MISSING,
    dws: MISSING,
    winShares: MISSING,
    winSharesPer48: MISSING,
    obpm: MISSING,
    dbpm: MISSING,
    bpm: MISSING,
    vorp: MISSING,
    dpm: MISSING,
    oDpm: MISSING,
    dDpm: MISSING,
    boxDpm: MISSING,
    onOffDpm: MISSING,
    drbl100: MISSING,
    drblP: MISSING,
    drblLn: MISSING,
    drblB: MISSING,
    drblO: MISSING,
    drblD: MISSING,
    sdv100: MISSING,
    shotMaking100: MISSING,
    epvShootMean: MISSING,
    vContMean: MISSING,
    drblWar: MISSING,
    drblSeasonalImpact: MISSING,
    drblL: MISSING,
    drblMeanLeverage: MISSING,
    drblDisagreement: MISSING,
    drblUncertainty: MISSING,
    drblIntervalLo: MISSING,
    drblIntervalHi: MISSING,
  };
}

/** Final production provider: complete sources plus honest career availability. */
export class CompleteNBADataProvider extends ResilientNBADataProvider {
  async getPlayerCareerSeasons(playerId: string): Promise<PlayerSeason[]> {
    const rows = await super.getPlayerCareerSeasons(playerId);
    return rows.map(removeCareerEndpointPlaceholders);
  }

  async getPlayerGameLog(
    playerId: string,
    season: string
  ): Promise<PlayerGame[]> {
    const complete = await fetchCompleteEspnPlayerGameLog(playerId, season).catch(
      () => []
    );
    if (complete.length > 0) return complete;
    return super.getPlayerGameLog(playerId, season);
  }
}

export { CompleteNBADataProvider as NBADataProvider };
