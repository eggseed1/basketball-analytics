/**
 * Game Lab query — assemble best-available game shell + optional box + boards.
 *
 * Missing box ≠ missing game. Scoreboard-only shells still analyze.
 */

import { analyzeGame, type GameAnalysisSummary } from "@/analytics/game-lab";
import {
  type GameSeasonContext,
} from "@/analytics/game-season-context";
import { getGameShellCached } from "@/data/queries/request-cache";
import { getFilteredPlayerSeasons } from "@/data/queries/players";
import { getTeam } from "@/data/queries/teams";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import { getGamePlayByPlay } from "@/data/queries/games";
import type { Game, PlayerGame, PlayerSeason } from "@/data/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { teamEraDisplay } from "@/data/identity/team-era";
import {
  ensureGameTeamIdentity,
  gameSideBrandKey,
  inferGameTeamProvider,
} from "@/lib/game-team-identity";
import { alignGameWithPbpHomeAway } from "@/lib/game-flow/resolve-score-timeline";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { resolveCanonicalTeam } from "@/data/identity/team-map";

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
 * Never resolve branding from a bare numeric id when the provider namespace
 * is required (BDL ids collide with ESPN — e.g. BDL 25 = POR, ESPN 25 = OKC).
 */
async function resolveSideLabels(
  game: Game,
  side: "home" | "away"
): Promise<{ label: string; name: string; themeKey: string }> {
  const teamId = side === "home" ? game.homeTeamId : game.awayTeamId;
  const abbr = side === "home" ? game.homeTeamAbbr : game.awayTeamAbbr;
  const name = side === "home" ? game.homeTeamName : game.awayTeamName;
  const brandKey = gameSideBrandKey(game, side);
  const brand = resolveTeamBrand(brandKey);
  const canonical = resolveCanonicalTeam(teamId);
  const fromBrandKey = resolveCanonicalTeam(brandKey);
  // themeKey = franchise/canonical id for board joins — not historical abbr.
  const lookupId =
    (canonical.status === "resolved"
      ? canonical.team.canonicalTeamId
      : undefined) ??
    (fromBrandKey.status === "resolved"
      ? fromBrandKey.team.canonicalTeamId
      : undefined) ??
    brand?.espnTeamId ??
    brand?.id ??
    teamId;
  const team = await getTeam(lookupId).catch(() => null);
  // Season-aware era wins over stored anachronistic provider labels.
  const era = game.season
    ? teamEraDisplay(lookupId, game.season, {
        abbr: abbr ?? undefined,
        displayName: name ?? undefined,
      })
    : null;
  const label =
    (era?.fromEra ? era.abbr : undefined) ||
    abbr?.trim() ||
    brand?.abbr ||
    team?.abbreviation ||
    (canonical.status === "resolved" ? canonical.team.abbr : undefined) ||
    teamId;
  const displayName =
    (era?.fromEra ? era.displayName : undefined) ||
    name?.trim() ||
    team?.fullName ||
    (canonical.status === "resolved"
      ? canonical.team.displayName
      : undefined) ||
    label;
  return {
    label,
    name: displayName,
    themeKey: lookupId,
  };
}

/**
 * Build Game Lab analysis for one game.
 * Returns null only when no scoreboard/schedule/box game can be resolved.
 */
export async function getGameAnalysis(
  gameId: string
): Promise<GameAnalysisPayload | null> {
  const shell = await getGameShellCached(gameId);
  if (!shell) return null;

  const game = ensureGameTeamIdentity(
    shell.game,
    shell.game.teamIdProvider ?? inferGameTeamProvider(shell.game)
  );
  const { players, availability } = shell;

  const needPlayerBoard = players.length > 0;
  const playByPlay = await getGamePlayByPlay(gameId).catch(() => null);
  const orientedGame = alignGameWithPbpHomeAway(game, playByPlay);

  const [homeLabels, awayLabels, seasonBoard, teamBoard] = await Promise.all([
    resolveSideLabels(orientedGame, "home"),
    resolveSideLabels(orientedGame, "away"),
    needPlayerBoard
      ? getFilteredPlayerSeasons({
          season: orientedGame.season,
          minimumGames: 5,
        }).catch(() => [] as PlayerSeason[])
      : Promise.resolve([] as PlayerSeason[]),
    getTeamSeasonStats(orientedGame.season).catch(() => [] as TeamSeasonStats[]),
  ]);

  const seasonByPlayerId = new Map<string, PlayerSeason>();
  for (const row of seasonBoard) {
    if (row.season !== orientedGame.season) continue;
    const existing = seasonByPlayerId.get(row.playerId);
    if (!existing || row.gamesPlayed > existing.gamesPlayed) {
      seasonByPlayerId.set(row.playerId, row);
    }
  }

  const analysis = analyzeGame({
    game: {
      ...orientedGame,
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
    playByPlay,
  });

  return {
    analysis,
    game: {
      ...orientedGame,
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
