import { toGameSummary } from "@/data/queries/filter-utils";
import type { CompactTeamGameRow } from "@/data/history/team-matchup-index";
import { TEAM_GAMES_PAGE_SIZE } from "@/data/history/team-matchup-index";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import type { Game, GameSummary } from "@/data/types";

export type TeamSplitBucket = {
  id: string;
  label: string;
  games: number;
  wins: number;
  losses: number;
  ppg: number | null;
  oppPpg: number | null;
  diff: number | null;
};

function gameTypes(
  gameType?: Game["gameType"] | Game["gameType"][]
): Set<Game["gameType"]> | null {
  if (!gameType) return null;
  return new Set(Array.isArray(gameType) ? gameType : [gameType]);
}

/** Completed + scheduled games for a team from the build-time schedule snapshot. */
export function teamSnapshotGames(
  teamId: string,
  season: string,
  options?: { gameType?: Game["gameType"] | Game["gameType"][] }
): GameSummary[] {
  const tid = String(teamId ?? "").trim();
  if (!tid || !season) return [];
  const types = gameTypes(options?.gameType);
  return getRuntimeSnapshotGames(season)
    .filter((game) => {
      if (game.homeTeamId !== tid && game.awayTeamId !== tid) return false;
      if (types && !types.has(game.gameType)) return false;
      return true;
    })
    .map(toGameSummary)
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate));
}

export function hasTeamSnapshotGames(teamId: string, season: string): boolean {
  return teamSnapshotGames(teamId, season).length > 0;
}

function teamPoints(game: GameSummary, teamId: string): {
  pf: number;
  pa: number;
  win: boolean | null;
} {
  const home = game.homeTeamId === teamId;
  const pf = home ? game.homeScore : game.awayScore;
  const pa = home ? game.awayScore : game.homeScore;
  if (game.status !== "final") return { pf, pa, win: null };
  if (pf === pa) return { pf, pa, win: null };
  return { pf, pa, win: pf > pa };
}

function aggregateSplit(
  games: GameSummary[],
  teamId: string
): Omit<TeamSplitBucket, "id" | "label"> {
  const finals = games.filter((game) => game.status === "final");
  let wins = 0;
  let losses = 0;
  let pts = 0;
  let opp = 0;
  for (const game of finals) {
    const { pf, pa, win } = teamPoints(game, teamId);
    pts += pf;
    opp += pa;
    if (win === true) wins += 1;
    else if (win === false) losses += 1;
  }
  const gp = finals.length;
  return {
    games: gp,
    wins,
    losses,
    ppg: gp ? pts / gp : null,
    oppPpg: gp ? opp / gp : null,
    diff: gp ? (pts - opp) / gp : null,
  };
}

/** Home / away / last-10 splits from bundled schedule (regular season). */
export function computeTeamSplits(
  teamId: string,
  season: string
): TeamSplitBucket[] {
  const regular = teamSnapshotGames(teamId, season, { gameType: "regular" });
  const finalsDesc = regular.filter((game) => game.status === "final");
  const home = regular.filter((game) => game.homeTeamId === teamId);
  const away = regular.filter((game) => game.awayTeamId === teamId);
  const last10 = finalsDesc.slice(0, 10);

  return [
    { id: "overall", label: "Overall", ...aggregateSplit(regular, teamId) },
    { id: "home", label: "Home", ...aggregateSplit(home, teamId) },
    { id: "away", label: "Away", ...aggregateSplit(away, teamId) },
    { id: "last10", label: "Last 10", ...aggregateSplit(last10, teamId) },
  ];
}

export function gameSummariesToCompactRows(
  teamId: string,
  games: GameSummary[]
): CompactTeamGameRow[] {
  return games.map((game) => {
    const home = game.homeTeamId === teamId;
    const result =
      game.status === "final"
        ? teamPoints(game, teamId).win
          ? "W"
          : "L"
        : null;
    const ot =
      (game.homePeriodScores?.length ?? 0) > 4 ||
      (game.awayPeriodScores?.length ?? 0) > 4;
    return {
      gameId: game.id,
      season: game.season,
      date: game.gameDate,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeCanonicalId: game.homeTeamId,
      awayCanonicalId: game.awayTeamId,
      homeTricode: game.homeTeamAbbr ?? "",
      awayTricode: game.awayTeamAbbr ?? "",
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      ot,
      homeAway: home ? "home" : "away",
      result,
      seasonType:
        game.gameType === "playoff" || game.gameType === "play-in"
          ? "Playoffs"
          : game.gameType === "preseason"
            ? "Preseason"
            : "Regular Season",
    };
  });
}

export function paginateSnapshotTeamGames(
  rows: CompactTeamGameRow[],
  page = 1
): {
  rows: CompactTeamGameRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
} {
  const pageSize = TEAM_GAMES_PAGE_SIZE;
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageCount,
    pageSize,
  };
}
