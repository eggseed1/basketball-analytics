import {
  downloadCdnBoxScore,
  downloadCdnPlayByPlay,
  downloadStatsBoxScoreTraditionalV3,
  downloadStatsPlayByPlayV3,
} from "./download/cdn-client";
import { rawPath, readOrFetchJson, writeJson } from "./download/disk-cache";
import { listSeasonGames } from "./download/season-games";
import { statsBoxScoreV3ToCdnShape } from "./download/stats-boxscore-adapt";
import { normalizeBoxScore, normalizePlayByPlay } from "./ingest/normalize";
import { reconstructLineups } from "./possessions/reconstruct-lineups";
import { reconstructPossessions } from "./possessions/reconstruct-possessions";
import { reconcileLineupMinutes } from "./possessions/reconcile-lineups";
import { reconcileGame } from "./possessions/reconcile";
import type {
  DrblBoxScore,
  DrblEvent,
  DrblGameMeta,
  DrblGameReconcileReport,
  DrblLineupState,
  DrblPossession,
  DrblSeason,
  DrblSeasonReconcileSummary,
} from "./types";

export { listSeasonGames } from "./download/season-games";
export { normalizeBoxScore, normalizePlayByPlay } from "./ingest/normalize";
export { reconstructLineups } from "./possessions/reconstruct-lineups";
export { reconstructPossessions } from "./possessions/reconstruct-possessions";
export { reconcileLineupMinutes } from "./possessions/reconcile-lineups";
export { reconcileGame } from "./possessions/reconcile";
export { DRBL_PARSER_VERSION, DRBL_RECONSTRUCTION_VERSION } from "./constants";

export type {
  DrblBoxScore,
  DrblEvent,
  DrblGameMeta,
  DrblGameReconcileReport,
  DrblLineupState,
  DrblPossession,
  DrblSeason,
  DrblSeasonReconcileSummary,
} from "./types";

export interface DrblProcessedGame {
  meta: DrblGameMeta;
  box: DrblBoxScore;
  events: DrblEvent[];
  lineups: DrblLineupState[];
  possessions: DrblPossession[];
  reconcile: DrblGameReconcileReport;
}

async function loadRawPbp(gameId: string, force = false): Promise<unknown> {
  const file = rawPath("games", gameId, "playbyplay.json");
  try {
    const { data } = await readOrFetchJson(
      file,
      () => downloadCdnPlayByPlay(gameId),
      {
        force,
        endpoint: `cdn.nba.com/liveData/playbyplay/playbyplay_${gameId}.json`,
      }
    );
    return data;
  } catch {
    const { data } = await readOrFetchJson(
      file,
      () => downloadStatsPlayByPlayV3(gameId),
      {
        force: true,
        endpoint: `stats.nba.com/stats/playbyplayv3?GameID=${gameId}`,
      }
    );
    return data;
  }
}

async function loadRawBox(gameId: string, force = false): Promise<unknown> {
  const file = rawPath("games", gameId, "boxscore.json");
  try {
    const { data } = await readOrFetchJson(
      file,
      () => downloadCdnBoxScore(gameId),
      {
        force,
        endpoint: `cdn.nba.com/liveData/boxscore/boxscore_${gameId}.json`,
      }
    );
    return data;
  } catch {
    const { data } = await readOrFetchJson(
      file,
      async () => {
        const raw = await downloadStatsBoxScoreTraditionalV3(gameId);
        const adapted = statsBoxScoreV3ToCdnShape(raw);
        if (!adapted) {
          throw new Error(`stats boxscore adapt failed for ${gameId}`);
        }
        return adapted;
      },
      {
        force: true,
        endpoint: `stats.nba.com/stats/boxscoretraditionalv3?GameID=${gameId}`,
      }
    );
    return data;
  }
}

/**
 * Download (cached), normalize, reconstruct, and reconcile one game.
 * Quarantines games that fail score reconciliation (written under _quarantine/).
 */
export async function processGame(
  meta: DrblGameMeta,
  options: { force?: boolean; persist?: boolean } = {}
): Promise<DrblProcessedGame> {
  const [rawPbp, rawBox] = await Promise.all([
    loadRawPbp(meta.gameId, options.force),
    loadRawBox(meta.gameId, options.force),
  ]);

  const box = normalizeBoxScore(meta.season, rawBox);
  if (!box) {
    throw new Error(`Failed to normalize box score for ${meta.gameId}`);
  }

  if (!box.homeScore && !box.awayScore) {
    box.homeScore = meta.homeScore;
    box.awayScore = meta.awayScore;
  }

  const events = normalizePlayByPlay(meta.gameId, rawPbp, {
    rosterPlayers: box.players,
  });
  if (events.length === 0) {
    throw new Error(`No PBP events for ${meta.gameId}`);
  }

  const lineups = reconstructLineups(events, box);
  const possessions = reconstructPossessions(events, box, lineups);
  const lineupReport = reconcileLineupMinutes(box, events, lineups);
  const reconcile = reconcileGame(box, events, possessions, {
    lineup: lineupReport,
  });

  const processed: DrblProcessedGame = {
    meta,
    box,
    events,
    lineups,
    possessions,
    reconcile,
  };

  if (options.persist !== false) {
    const outDir = rawPath("..", "normalized", meta.season, meta.gameId);
    await writeJson(`${outDir}/events.json`, events);
    await writeJson(`${outDir}/lineups.json`, lineups);
    await writeJson(`${outDir}/possessions.json`, possessions);
    await writeJson(`${outDir}/box.json`, box);
    await writeJson(`${outDir}/reconcile.json`, reconcile);

    if (reconcile.quarantined) {
      await writeJson(
        rawPath("..", "normalized", meta.season, "_quarantine", `${meta.gameId}.json`),
        {
          gameId: meta.gameId,
          season: meta.season,
          quarantinedAt: new Date().toISOString(),
          reason: reconcile.warnings.join("; ") || "score reconciliation failed",
          reconcile,
        }
      );
    }
  }

  return processed;
}

export async function processSeason(
  season: DrblSeason,
  options: {
    force?: boolean;
    limit?: number;
    gameIds?: string[];
    delayMs?: number;
  } = {}
): Promise<DrblSeasonReconcileSummary> {
  let games = await listSeasonGames(season);
  if (options.gameIds?.length) {
    const allow = new Set(options.gameIds);
    games = games.filter((g) => allow.has(g.gameId));
  }
  if (options.limit && options.limit > 0) {
    games = games.slice(0, options.limit);
  }

  let gamesOk = 0;
  let gamesFailed = 0;
  let gamesQuarantined = 0;
  let totalPossessions = 0;
  let absScoreError = 0;
  const failures: Array<{ gameId: string; reason: string }> = [];

  for (let i = 0; i < games.length; i++) {
    const meta = games[i]!;
    try {
      const processed = await processGame(meta, { force: options.force });
      totalPossessions += processed.possessions.length;
      absScoreError +=
        Math.abs(processed.reconcile.scoreDeltaHome) +
        Math.abs(processed.reconcile.scoreDeltaAway);
      if (processed.reconcile.quarantined) {
        gamesQuarantined += 1;
        gamesFailed += 1;
        failures.push({
          gameId: meta.gameId,
          reason:
            processed.reconcile.warnings.join("; ") || "quarantined",
        });
      } else if (processed.reconcile.ok) {
        gamesOk += 1;
      } else {
        // Score OK but player/lineup diffs — counted failed for summary,
        // still usable for Core v0 attribution with warnings.
        gamesFailed += 1;
        failures.push({
          gameId: meta.gameId,
          reason: processed.reconcile.warnings.join("; ") || "player/lineup diffs",
        });
      }
    } catch (error) {
      gamesFailed += 1;
      failures.push({
        gameId: meta.gameId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    if (options.delayMs && i < games.length - 1) {
      await new Promise((r) => setTimeout(r, options.delayMs));
    }
  }

  const summary: DrblSeasonReconcileSummary = {
    season,
    gamesAttempted: games.length,
    gamesOk,
    gamesFailed,
    gamesQuarantined,
    totalPossessions,
    meanAbsScoreError:
      games.length > 0 ? absScoreError / (games.length * 2) : 0,
    failures: failures.slice(0, 50),
  };

  await writeJson(
    rawPath("..", "normalized", season, "_summary.json"),
    summary
  );
  return summary;
}
