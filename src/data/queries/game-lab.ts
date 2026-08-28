/**
 * Game Lab query - assemble best-available game shell + optional box + boards.
 *
 * Missing box ≠ missing game. Scoreboard-only shells still analyze.
 */

import { analyzeGame, type GameAnalysisSummary } from "@/analytics/game-lab";
import {
  type GameSeasonContext,
} from "@/analytics/game-season-context";
import {
  getGameShellCached,
  getFilteredPlayerSeasonsCached,
  getTeamSeasonStatsCached,
} from "@/data/queries/request-cache";
import { getTeam } from "@/data/queries/teams";
import { getGameBoxScore } from "@/data/queries/games";
import { fetchRawPlayByPlay } from "@/data/providers/nba/play-by-play-client";
import { fetchEspnCdnGameSummary } from "@/data/providers/nba/espn-cdn-summary";
import { transformEspnBoxScore } from "@/data/transformers/espn";
import { transformNbaPlayByPlay } from "@/data/transformers/play-by-play";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import type { Game, GameBoxScore, GamePlayByPlay, PlayerGame, PlayerSeason } from "@/data/types";
import type { PlayByPlayEvent } from "@/data/types/play-by-play";
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
import { finalizeBoxScorePlayers } from "@/data/providers/nba/enrich-box-score";
import { looksLikeEspnEventId } from "@/data/identity/game-id";
import { longUpstreamBudgetsEnabled } from "@/data/providers/nba/runtime-policy";
export type { GameAnalysisSummary };

export type GameAnalysisPayload = {
  analysis: GameAnalysisSummary;
  game: Game;
  players: PlayerGame[];
  events: PlayByPlayEvent[];
  pbpSource?: string;
  /** Shell availability - mirrors coverage.availability. */
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

function collectTeamKeys(
  game: Game,
  side: "home" | "away",
  themeKey: string
): Set<string> {
  const keys = new Set<string>();
  const add = (value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) keys.add(trimmed);
  };
  add(themeKey);
  if (side === "home") {
    add(game.homeTeamId);
    add(game.homeProviderTeamId);
    add(game.homeTeamAbbr);
  } else {
    add(game.awayTeamId);
    add(game.awayProviderTeamId);
    add(game.awayTeamAbbr);
  }
  for (const key of [...keys]) {
    const brand = resolveTeamBrand(key);
    add(brand?.id);
    add(brand?.espnTeamId);
    add(brand?.abbr);
    const canonical = resolveCanonicalTeam(key);
    if (canonical.status === "resolved") {
      add(canonical.team.canonicalTeamId);
      add(canonical.team.abbr);
    }
  }
  return keys;
}

/**
 * Align player teamIds to the analyzed game's theme keys so totals, filters,
 * and season joins share one namespace after PBP orientation / brand resolve.
 */
export function alignBoxPlayersToGameSides(
  players: PlayerGame[],
  orientedGame: Game,
  homeThemeKey: string,
  awayThemeKey: string
): PlayerGame[] {
  const homeKeys = collectTeamKeys(orientedGame, "home", homeThemeKey);
  const awayKeys = collectTeamKeys(orientedGame, "away", awayThemeKey);

  const aligned = players.map((player) => {
    if (homeKeys.has(player.teamId)) {
      return {
        ...player,
        teamId: homeThemeKey,
        opponentTeamId: awayThemeKey,
        isHome: true,
      };
    }
    if (awayKeys.has(player.teamId)) {
      return {
        ...player,
        teamId: awayThemeKey,
        opponentTeamId: homeThemeKey,
        isHome: false,
      };
    }
    return player;
  });

  return finalizeBoxScorePlayers(aligned);
}

/**
 * Prefer schedule abbreviation for brand identity.
 * Never resolve branding from a bare numeric id when the provider namespace
 * is required (BDL ids collide with ESPN - e.g. BDL 25 = POR, ESPN 25 = OKC).
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
 * One ESPN CDN summary hydrates both box + PBP on Cloudflare (avoids stampede).
 */
async function hydrateFromEspnCdn(
  gameId: string,
  seasonHint?: string
): Promise<{
  box: GameBoxScore | null;
  playByPlay: GamePlayByPlay | null;
}> {
  if (!looksLikeEspnEventId(gameId)) {
    return { box: null, playByPlay: null };
  }

  const summary = await fetchEspnCdnGameSummary(gameId, { preferPlays: true });
  if (!summary) return { box: null, playByPlay: null };

  const endYear = summary.header?.season?.year;
  const season =
    typeof endYear === "number" && Number.isFinite(endYear)
      ? canonicalSeasonFromStartYear(endYear - 1)
      : seasonHint ?? canonicalSeasonFromStartYear(new Date().getUTCFullYear() - 1);

  const box = transformEspnBoxScore(summary, season);
  const { normalizeEspnSummary } = await import(
    "@/data/providers/nba/play-by-play-client"
  );
  const raw = normalizeEspnSummary(summary);
  const playByPlay = transformNbaPlayByPlay(gameId, raw, "espn");

  return {
    box: box?.game?.id ? box : null,
    playByPlay: playByPlay.events.length > 0 ? playByPlay : null,
  };
}

async function loadPlayByPlayForGameLab(
  gameId: string
): Promise<GamePlayByPlay | null> {
  const payload = await fetchRawPlayByPlay(gameId);
  if (!payload) return null;
  const source = payload.source === "disk" ? "cdn" : payload.source;
  const playByPlay = transformNbaPlayByPlay(gameId, payload.raw, source);
  return playByPlay.events.length > 0 ? playByPlay : null;
}

export async function getGameAnalysis(
  gameId: string
): Promise<GameAnalysisPayload | null> {
  const shell = await getGameShellCached(gameId);
  if (!shell) return null;

  let game = ensureGameTeamIdentity(
    shell.game,
    shell.game.teamIdProvider ?? inferGameTeamProvider(shell.game)
  );
  let players = shell.players;
  let availability = shell.availability;

  const { withBudget } = await import("@/data/queries/budget");
  const hydrateBudgetMs = longUpstreamBudgetsEnabled() ? 12_000 : 6_000;

  // Single CDN hydrate for ESPN games — box + PBP share one response.
  let playByPlay: GamePlayByPlay | null = null;
  const hydrated = await withBudget(
    hydrateFromEspnCdn(gameId, game.season).catch(() => ({
      box: null,
      playByPlay: null,
    })),
    hydrateBudgetMs,
    { box: null, playByPlay: null }
  );
  playByPlay = hydrated.value.playByPlay;
  if (hydrated.value.box?.players?.length) {
    const box = hydrated.value.box;
    players = box.players;
    game = ensureGameTeamIdentity(
      box.game,
      box.game.teamIdProvider ?? inferGameTeamProvider(box.game)
    );
    const hasBox = box.players.some(
      (p) => p.minutes > 0 || p.points > 0 || p.fieldGoalsAttempted > 0
    );
    const hasPeriods = Boolean(
      box.game.homePeriodScores?.length && box.game.awayPeriodScores?.length
    );
    availability = hasBox
      ? hasPeriods
        ? "full"
        : "partial"
      : hasPeriods
        ? "partial"
        : "scoreboard";
  }

  // Fallback paths when the shared CDN hydrate missed one side.
  if (!playByPlay) {
    playByPlay = await loadPlayByPlayForGameLab(gameId).catch(() => null);
  }
  if (players.length === 0) {
    const lateBox = await withBudget(
      getGameBoxScore(gameId).catch(() => null),
      hydrateBudgetMs,
      null
    );
    if (lateBox.value?.players?.length) {
      const box = lateBox.value;
      players = box.players;
      game = ensureGameTeamIdentity(
        box.game,
        box.game.teamIdProvider ?? inferGameTeamProvider(box.game)
      );
      availability = "full";
    }
  }

  const needPlayerBoard = players.length > 0;

  const seasonBoardPromise = needPlayerBoard
    ? getFilteredPlayerSeasonsCached(game.season, 5).catch(
        () => [] as PlayerSeason[]
      )
    : Promise.resolve([] as PlayerSeason[]);
  const teamBoardPromise = getTeamSeasonStatsCached(game.season).catch(
    () => [] as TeamSeasonStats[]
  );

  const orientedGame = alignGameWithPbpHomeAway(game, playByPlay);

  const [homeLabels, awayLabels, seasonBoard, teamBoard] = await Promise.all([
    resolveSideLabels(orientedGame, "home"),
    resolveSideLabels(orientedGame, "away"),
    seasonBoardPromise,
    teamBoardPromise,
  ]);

  const seasonByPlayerId = new Map<string, PlayerSeason>();
  for (const row of seasonBoard) {
    if (row.season !== orientedGame.season) continue;
    const existing = seasonByPlayerId.get(row.playerId);
    if (!existing || row.gamesPlayed > existing.gamesPlayed) {
      seasonByPlayerId.set(row.playerId, row);
    }
  }

  const alignedPlayers = alignBoxPlayersToGameSides(
    players,
    orientedGame,
    homeLabels.themeKey,
    awayLabels.themeKey
  );

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
    players: alignedPlayers,
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
    players: alignedPlayers,
    events: playByPlay?.events ?? [],
    pbpSource: playByPlay?.source,
    availability,
  };
}

/**
 * Focused Game vs Season Context - uses the same shell as Game Lab (no N+1).
 */
export async function getGameSeasonContext(
  gameId: string
): Promise<GameSeasonContext | null> {
  const payload = await getGameAnalysis(gameId);
  return payload?.analysis.gameSeasonContext ?? null;
}
