/**
 * Team asset ledger query.
 *
 * Players: from verified season board roster rows (canonical playerIds).
 * Draft capital / TPEs / draft rights: blocked until a structured ledger exists.
 * Never parses ESPN free-text transactions into assets.
 *
 * Pre-modern seasons never hit ESPN athlete boards — fail fast with diagnosed
 * unsupported state (same floor as team roster / player-board health).
 */

import {
  EMPTY_TRADE_EXCEPTION_FIT,
  TEAM_ASSETS_METHODOLOGY_VERSION,
  type TeamAssetCategoryCoverage,
  type TeamAssetLedger,
  type TeamPlayerAsset,
  type TradeExceptionFitResult,
} from "@/data/types/team-assets";
import { TRANSACTION_LINEAGE_METHODOLOGY_VERSION } from "@/data/types/transaction-lineage";
import {
  getTeamRoster,
  isTeamRosterBoardSupported,
  TEAM_ROSTER_BOARD_EARLIEST_START_YEAR,
  type TeamRosterStatus,
} from "@/data/queries/players";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import { isTransactionGenealogyUiReady } from "@/data/queries/transaction-lineage";
import { playerPageHref } from "@/lib/player-season-resolve";
import { resolveTeamBrand } from "@/lib/nba-brand";

function blocked(
  id: TeamAssetCategoryCoverage["id"],
  label: string,
  note: string
): TeamAssetCategoryCoverage {
  return {
    id,
    label,
    availability: "blocked_pending_structured_source",
    count: 0,
    note,
  };
}

function available(
  id: TeamAssetCategoryCoverage["id"],
  label: string,
  count: number,
  note: string | null = null
): TeamAssetCategoryCoverage {
  return {
    id,
    label,
    availability: count > 0 ? "available" : "unavailable",
    count,
    note,
  };
}

function playerCategoryFromRosterStatus(
  status: TeamRosterStatus,
  season: string,
  count: number,
  warning?: string
): TeamAssetCategoryCoverage {
  if (status === "unsupported") {
    return {
      id: "players",
      label: "Players",
      availability: "unsupported",
      count: 0,
      note:
        warning ??
        `Historical player assets unavailable for ${season}. ESPN athlete boards are not available before ${TEAM_ROSTER_BOARD_EARLIEST_START_YEAR}.`,
    };
  }
  if (status === "timeout") {
    return {
      id: "players",
      label: "Players",
      availability: "timeout",
      count: 0,
      note:
        warning ??
        `Player assets unavailable for ${season} (provider timed out).`,
    };
  }
  if (status === "error") {
    return {
      id: "players",
      label: "Players",
      availability: "provider_error",
      count: 0,
      note:
        warning ??
        `Player assets unavailable for ${season} (provider failed).`,
    };
  }
  return available(
    "players",
    "Players",
    count,
    count > 0 ? null : "No qualified board rows for this team-season."
  );
}

function emptyStructuredCategories(): TeamAssetCategoryCoverage[] {
  return [
    blocked(
      "draft_capital",
      "Draft capital",
      "No structured pick ownership ledger in production."
    ),
    blocked(
      "trade_exceptions",
      "Trade exceptions",
      "No structured TPE feed in production."
    ),
    blocked(
      "draft_rights",
      "Draft rights",
      "No structured draft-rights / draft-and-stash ledger in production."
    ),
    blocked(
      "other",
      "Other assets",
      "No additional structured asset classes admitted."
    ),
  ];
}

/**
 * Build the team asset ledger for a season snapshot.
 * Roster players require canonical board playerIds — never free-text names.
 */
export async function getTeamAssets(options: {
  teamId: string;
  /** Preferred board filter (e.g. BOS) when known. */
  abbreviation?: string;
  season?: string;
  asOfDate?: string;
  /** Minimum games for board inclusion (same spirit as explore boards). */
  minimumGames?: number;
  /** Override roster board budget (tests). */
  budgetMs?: number;
}): Promise<TeamAssetLedger> {
  const brand =
    resolveTeamBrand(options.teamId) ??
    resolveTeamBrand(options.abbreviation);
  const teamKey = brand?.espnTeamId ?? brand?.id ?? options.teamId;
  const season = options.season ?? null;
  const minimumGames = options.minimumGames ?? 1;

  const notes: string[] = [
    "Draft capital, trade exceptions, and draft rights stay blocked until a structured asset ledger is ingested.",
    "ESPN free-text transaction blurbs never invent player, pick, or TPE assets.",
  ];

  if (!season) {
    notes.push(
      "Pass season to load verified roster player assets from the season board."
    );
    return {
      teamId: teamKey,
      asOfSeason: null,
      asOfDate: options.asOfDate ?? null,
      methodologyVersion: TEAM_ASSETS_METHODOLOGY_VERSION,
      lineageMethodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
      structuredLedgerAvailable: false,
      genealogyUiReady: false,
      playerBoardStatus: "unavailable",
      warning: "Season required for roster player assets.",
      categories: [
        available(
          "players",
          "Players",
          0,
          "Season required for roster player assets."
        ),
        ...emptyStructuredCategories(),
      ],
      players: [],
      draftCapital: [],
      tradeExceptions: [],
      draftRights: [],
      notes,
    };
  }

  // Pre-modern: do not touch ESPN athlete boards (or modern roster substitution).
  // Skip genealogy coverage scan — irrelevant without a supported player board.
  if (!isTeamRosterBoardSupported(season)) {
    const warning = `Historical player assets unavailable for ${season}.`;
    notes.push(warning);
    return {
      teamId: teamKey,
      asOfSeason: season,
      asOfDate: options.asOfDate ?? null,
      methodologyVersion: TEAM_ASSETS_METHODOLOGY_VERSION,
      lineageMethodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
      structuredLedgerAvailable: false,
      genealogyUiReady: false,
      playerBoardStatus: "unsupported",
      warning,
      categories: [
        playerCategoryFromRosterStatus("unsupported", season, 0, warning),
        ...emptyStructuredCategories(),
      ],
      players: [],
      draftCapital: [],
      tradeExceptions: [],
      draftRights: [],
      notes,
    };
  }

  const genealogyUiReady = await isTransactionGenealogyUiReady().catch(
    () => false
  );

  // Share the same bounded roster board path as the roster island.
  const roster =
    options.budgetMs != null
      ? await getTeamRoster(
          teamKey,
          season,
          { minimumGames },
          { budgetMs: options.budgetMs }
        )
      : await getTeamRosterCached(teamKey, season, minimumGames);


  const players: TeamPlayerAsset[] = [];
  if (roster.status === "ok") {
    const seen = new Set<string>();
    for (const row of roster.players) {
      if (!row.playerId?.trim()) continue;
      if (seen.has(row.playerId)) continue;
      seen.add(row.playerId);
      const gp = Math.max(1, row.gamesPlayed);
      players.push({
        kind: "player",
        playerId: row.playerId,
        playerName: row.playerName,
        teamId: teamKey,
        season: row.season,
        position: row.position,
        pointsPerGame: row.points / gp,
        minutesPerGame: row.minutes / gp,
        href: playerPageHref(row.playerId, row.season),
      });
    }
    players.sort(
      (a, b) =>
        (b.pointsPerGame ?? 0) - (a.pointsPerGame ?? 0) ||
        a.playerName.localeCompare(b.playerName)
    );
  } else if (roster.warning) {
    notes.push(roster.warning);
  }

  const playerCat = playerCategoryFromRosterStatus(
    roster.status,
    season,
    players.length,
    roster.warning
  );

  return {
    teamId: teamKey,
    asOfSeason: season,
    asOfDate: options.asOfDate ?? null,
    methodologyVersion: TEAM_ASSETS_METHODOLOGY_VERSION,
    lineageMethodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
    structuredLedgerAvailable: false,
    genealogyUiReady,
    playerBoardStatus: roster.status,
    warning: roster.status === "ok" ? undefined : roster.warning,
    categories: [playerCat, ...emptyStructuredCategories()],
    players,
    draftCapital: [],
    tradeExceptions: [],
    draftRights: [],
    notes,
  };
}

/**
 * TPE salary-fit placeholder — always unavailable until structured TPE + salary data exist.
 * Does not invent fits from free text.
 */
export async function getTradeExceptionFits(options: {
  teamId: string;
  exceptionId: string;
}): Promise<TradeExceptionFitResult> {
  return EMPTY_TRADE_EXCEPTION_FIT(
    options.exceptionId,
    options.teamId,
    "Structured trade-exception and salary data are not available. Fit lists stay empty — DRBL will not invent them."
  );
}
