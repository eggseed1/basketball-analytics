import type {
  Game,
  GameBoxScore,
  GamePlayByPlay,
  PlayerSeason,
} from "@/data/types";
import { ResilientNBADataProvider } from "@/data/providers/nba/resilient-nba-data-provider";
import { fetchNbaCdnBoxScore } from "@/data/providers/nba/nba-cdn-box-score";
import { findNbaCdnGame } from "@/data/providers/nba/nba-cdn-game-client";
import { seasonFromNbaGameId } from "@/lib/game-presentation";

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

function isNbaGameId(gameId: string): boolean {
  return /^00\d{8}$/.test(String(gameId ?? "").trim());
}

/**
 * Final production provider.
 *
 * Player/career data keeps the existing multi-source merge. Game-facing routes
 * use NBA's public liveData CDN first for NBA GameIDs. That CDN is the same
 * source already used by the DRBL play-by-play pipeline and does not inherit
 * stats.nba.com's Vercel egress problem.
 */
export class CompleteNBADataProvider extends ResilientNBADataProvider {
  async getPlayerCareerSeasons(playerId: string): Promise<PlayerSeason[]> {
    const rows = await super.getPlayerCareerSeasons(playerId);
    return rows.map(removeCareerEndpointPlaceholders);
  }

  async getGame(gameId: string): Promise<Game | null> {
    if (isNbaGameId(gameId)) {
      const box = await fetchNbaCdnBoxScore(gameId).catch(() => null);
      if (box?.game) return box.game;

      const season = seasonFromNbaGameId(gameId);
      if (season) {
        const scheduled = await findNbaCdnGame(gameId, season).catch(() => null);
        if (scheduled) return scheduled;
      }
    }
    return super.getGame(gameId).catch(() => null);
  }

  async getGameBoxScore(gameId: string): Promise<GameBoxScore | null> {
    if (isNbaGameId(gameId)) {
      const cdn = await fetchNbaCdnBoxScore(gameId).catch(() => null);
      if (cdn) return cdn;
    }
    return super.getGameBoxScore(gameId).catch(() => null);
  }

  async getGamePlayByPlay(gameId: string): Promise<GamePlayByPlay | null> {
    // The inherited play-by-play client is already NBA-CDN-first. Preserve it
    // here explicitly so the provider contract documents the production path.
    return super.getGamePlayByPlay(gameId).catch(() => null);
  }
}

export { CompleteNBADataProvider as NBADataProvider };
