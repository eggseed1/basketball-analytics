import type { Game, GameBoxScore, PlayerGame } from "@/data/types";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import { normalizeBoxScore } from "../../../../drbl/ingest/normalize";
import { finalizeBoxScorePlayers } from "./enrich-box-score";

function finite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function teamMeta(raw: unknown): Map<string, { name?: string; abbr?: string; periods?: number[] }> {
  const root = record(raw);
  const game = record(root?.game);
  const out = new Map<string, { name?: string; abbr?: string; periods?: number[] }>();
  for (const key of ["homeTeam", "awayTeam"] as const) {
    const team = record(game?.[key]);
    const id = String(team?.teamId ?? "").trim();
    if (!id) continue;
    const periods = Array.isArray(team?.periods)
      ? team!.periods
          .map((p) => finite(record(p)?.score, Number.NaN))
          .filter(Number.isFinite)
      : undefined;
    out.set(id, {
      name: String(team?.teamName ?? team?.teamCity ?? "").trim() || undefined,
      abbr: String(team?.teamTricode ?? "").trim() || undefined,
      ...(periods?.length ? { periods } : {}),
    });
  }
  return out;
}

function playerRawStats(raw: unknown): Map<string, Record<string, unknown>> {
  const root = record(raw);
  const game = record(root?.game);
  const out = new Map<string, Record<string, unknown>>();
  for (const key of ["homeTeam", "awayTeam"] as const) {
    const team = record(game?.[key]);
    const players = Array.isArray(team?.players) ? team!.players : [];
    for (const value of players) {
      const player = record(value);
      const id = String(player?.personId ?? "").trim();
      const stats = record(player?.statistics);
      if (id && stats) out.set(id, stats);
    }
  }
  return out;
}

function seasonFromGameId(gameId: string, fallback: string): string {
  const m = /^00[1245](\d{2})\d{5}$/.exec(gameId);
  if (!m) return fallback;
  const yy = Number(m[1]);
  const start = yy >= 50 ? 1900 + yy : 2000 + yy;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Transform the public cdn.nba.com liveData box score into the app contract. */
export function transformNbaCdnBoxScore(
  raw: unknown,
  seasonHint: string
): GameBoxScore | null {
  const normalized = normalizeBoxScore(seasonHint, raw);
  if (!normalized?.gameId || !normalized.homeTeamId || !normalized.awayTeamId) {
    return null;
  }

  const season = seasonFromGameId(normalized.gameId, normalized.season);
  const homeProviderTeamId = normalized.homeTeamId;
  const awayProviderTeamId = normalized.awayTeamId;
  const homeTeamId =
    getCanonicalTeamFromProvider("nba", homeProviderTeamId)?.canonicalTeamId ??
    homeProviderTeamId;
  const awayTeamId =
    getCanonicalTeamFromProvider("nba", awayProviderTeamId)?.canonicalTeamId ??
    awayProviderTeamId;
  const meta = teamMeta(raw);
  const homeMeta = meta.get(homeProviderTeamId);
  const awayMeta = meta.get(awayProviderTeamId);
  const root = record(raw);
  const rawGame = record(root?.game);
  const statusText = String(rawGame?.gameStatusText ?? "").trim();
  const gameStatus = finite(rawGame?.gameStatus, 3);
  const status: Game["status"] =
    gameStatus === 1 ? "scheduled" : gameStatus === 2 ? "in_progress" : "final";
  const tip = String(
    rawGame?.gameTimeUTC ?? rawGame?.gameTimeLocal ?? rawGame?.gameEt ?? ""
  ).trim();

  const game: Game = {
    id: normalized.gameId,
    season,
    gameDate: normalized.gameDate || tip.slice(0, 10),
    ...(tip && /^\d{4}-\d{2}-\d{2}T/.test(tip) ? { tipOffAt: tip } : {}),
    ...(statusText ? { statusDetail: statusText } : {}),
    homeTeamId,
    awayTeamId,
    homeTeamAbbr: homeMeta?.abbr ?? normalized.homeTeamTricode,
    awayTeamAbbr: awayMeta?.abbr ?? normalized.awayTeamTricode,
    homeTeamName: homeMeta?.name,
    awayTeamName: awayMeta?.name,
    teamIdProvider: "nba",
    homeProviderTeamId,
    awayProviderTeamId,
    homeScore: normalized.homeScore,
    awayScore: normalized.awayScore,
    ...(homeMeta?.periods?.length ? { homePeriodScores: homeMeta.periods } : {}),
    ...(awayMeta?.periods?.length ? { awayPeriodScores: awayMeta.periods } : {}),
    gameType: /^004/.test(normalized.gameId) ? "playoff" : "regular",
    status,
    ...(finite(rawGame?.period, 0) > 0 ? { period: finite(rawGame?.period) } : {}),
    ...(String(rawGame?.gameClock ?? "").trim()
      ? { displayClock: String(rawGame?.gameClock).trim() }
      : {}),
    retrievedAt: new Date().toISOString(),
  };

  const rawStats = playerRawStats(raw);
  const players: PlayerGame[] = normalized.players.map((row) => {
    const stats = rawStats.get(row.playerId);
    const teamId =
      getCanonicalTeamFromProvider("nba", row.teamId)?.canonicalTeamId ?? row.teamId;
    const isHome = teamId === homeTeamId || row.teamId === homeProviderTeamId;
    const plusMinus = stats
      ? finite(stats.plusMinusPoints ?? stats.plusMinus, Number.NaN)
      : Number.NaN;
    return {
      id: `${row.playerId}-${normalized.gameId}`,
      gameId: normalized.gameId,
      playerId: row.playerId,
      playerName: row.playerName,
      teamId,
      season,
      gameDate: game.gameDate,
      opponentTeamId: isHome ? awayTeamId : homeTeamId,
      isHome,
      minutes: row.minutes,
      points: row.points,
      assists: row.assists,
      rebounds: row.rebounds,
      offensiveRebounds: row.offensiveRebounds,
      defensiveRebounds: row.defensiveRebounds,
      steals: row.steals,
      blocks: row.blocks,
      turnovers: row.turnovers,
      personalFouls: row.personalFouls,
      fieldGoalsMade: row.fieldGoalsMade,
      fieldGoalsAttempted: row.fieldGoalsAttempted,
      threePointersMade: row.threePointersMade,
      threePointersAttempted: row.threePointersAttempted,
      freeThrowsMade: row.freeThrowsMade,
      freeThrowsAttempted: row.freeThrowsAttempted,
      plusMinus,
    };
  });

  return { game, players: finalizeBoxScorePlayers(players) };
}
