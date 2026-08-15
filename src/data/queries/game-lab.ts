/**
 * Game Lab query — assemble best-available game shell + optional box + boards.
 *
 * Missing box ≠ missing game. Scoreboard-only shells still analyze.
 */

import { analyzeGame, type GameAnalysisSummary } from "@/analytics/game-lab";
import {
  buildGameSeasonContext,
  type GameSeasonContext,
} from "@/analytics/game-season-context";
import { getGameShell } from "@/data/queries/games";
import { getFilteredPlayerSeasons } from "@/data/queries/players";
import { getTeam } from "@/data/queries/teams";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import type { Game, PlayerGame, PlayerSeason } from "@/data/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type { GameAnalysisSummary };

export type GameAnalysisPayload = {
  analysis: GameAnalysisSummary;
  game: Game;
  players: PlayerGame[];
  /** Shell availability — mirrors coverage.availability. */
  availability: "full" | "partial" | "scoreboard";
};

function matchTeamSeason(
  rows: TeamSeasonStats[],
  teamId: string,
  abbr?: string | null
): TeamSeasonStats | null {
  const brand = resolveTeamBrand(teamId) ?? resolveTeamBrand(abbr);
  return (
    rows.find(
      (r) =>
        r.teamId === teamId ||
        (brand &&
          (r.abbreviation.toLowerCase() === brand.abbr.toLowerCase() ||
            r.teamId === brand.id ||
            r.teamId === brand.espnTeamId))
    ) ??
    rows.find(
      (r) => abbr && r.abbreviation.toLowerCase() === abbr.toLowerCase()
    ) ??
    null
  );
}

/**
 * Prefer schedule abbreviation for brand identity.
 * BallDontLie numeric team ids collide with ESPN ids (e.g. BDL 25 = POR,
 * ESPN 25 = OKC). Abbr/name on the Game row are the trustworthy labels.
 */
async function resolveSideLabels(
  teamId: string,
  abbr: string | null | undefined,
  name: string | null | undefined
): Promise<{ label: string; name: string; themeKey: string }> {
  const brand =
    resolveTeamBrand(abbr) ??
    resolveTeamBrand(teamId) ??
    // last resort: try first word of full name ("Portland Trail Blazers")
    (name ? resolveTeamBrand(name.split(/\s+/)[0] ?? "") : undefined);

  const lookupId = brand?.espnTeamId ?? brand?.id ?? teamId;
  const team = await getTeam(lookupId).catch(() => null);
  const label = brand?.abbr ?? team?.abbreviation ?? abbr ?? teamId;
  const displayName = team?.fullName ?? name ?? label;
  return {
    label,
    name: displayName,
    themeKey: brand?.espnTeamId ?? brand?.id ?? abbr ?? teamId,
  };
}

/**
 * Build Game Lab analysis for one game.
 * Returns null only when no scoreboard/schedule/box game can be resolved.
 */
export async function getGameAnalysis(
  gameId: string
): Promise<GameAnalysisPayload | null> {
  const shell = await getGameShell(gameId);
  if (!shell) return null;

  const { game, players, availability } = shell;

  const needPlayerBoard = players.length > 0;
  const [homeLabels, awayLabels, seasonBoard, teamBoard] = await Promise.all([
    resolveSideLabels(game.homeTeamId, game.homeTeamAbbr, game.homeTeamName),
    resolveSideLabels(game.awayTeamId, game.awayTeamAbbr, game.awayTeamName),
    needPlayerBoard
      ? getFilteredPlayerSeasons({
          season: game.season,
          minimumGames: 5,
        }).catch(() => [] as PlayerSeason[])
      : Promise.resolve([] as PlayerSeason[]),
    getTeamSeasonStats(game.season).catch(() => [] as TeamSeasonStats[]),
  ]);

  const seasonByPlayerId = new Map<string, PlayerSeason>();
  for (const row of seasonBoard) {
    if (row.season !== game.season) continue;
    const existing = seasonByPlayerId.get(row.playerId);
    if (!existing || row.gamesPlayed > existing.gamesPlayed) {
      seasonByPlayerId.set(row.playerId, row);
    }
  }

  const analysis = analyzeGame({
    game: {
      ...game,
      // Align identity with resolved brands when schedule id/abbr disagree.
      homeTeamId: homeLabels.themeKey,
      awayTeamId: awayLabels.themeKey,
      homeTeamAbbr: homeLabels.label,
      awayTeamAbbr: awayLabels.label,
      homeTeamName: homeLabels.name,
      awayTeamName: awayLabels.name,
    },
    players,
    homeLabel: homeLabels.label,
    awayLabel: awayLabels.label,
    homeName: homeLabels.name,
    awayName: awayLabels.name,
    homeSeason: matchTeamSeason(
      teamBoard,
      homeLabels.themeKey,
      homeLabels.label
    ),
    awaySeason: matchTeamSeason(
      teamBoard,
      awayLabels.themeKey,
      awayLabels.label
    ),
    seasonByPlayerId,
  });

  return {
    analysis,
    game: {
      ...game,
      homeTeamId: homeLabels.themeKey,
      awayTeamId: awayLabels.themeKey,
      homeTeamAbbr: homeLabels.label,
      awayTeamAbbr: awayLabels.label,
      homeTeamName: homeLabels.name,
      awayTeamName: awayLabels.name,
    },
    players,
    availability,
  };
}

/**
 * Focused Game vs Season Context — uses the same shell as Game Lab (no N+1).
 */
export async function getGameSeasonContext(
  gameId: string
): Promise<GameSeasonContext | null> {
  const payload = await getGameAnalysis(gameId);
  return payload?.analysis.gameSeasonContext ?? null;
}
