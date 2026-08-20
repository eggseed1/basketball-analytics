/**
 * Player directory API — factual season universe (not DRBL leaderboard).
 * GET /api/players/directory?season=2014-15&page=1&pageSize=100
 */
import { NextResponse } from "next/server";

import { isDrblSeason } from "@/data/drbl/season-registry";
import {
  countSeasonPlayerUniverse,
  hasPlayerUniverseSeason,
} from "@/data/history/player-universe";
import { getExplorePlayersBoardView } from "@/data/queries/explore-players-board";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import { defaultCanonicalSeasons } from "@/data/providers/nba/season";
import { filtersFromSearchParams } from "@/lib/search-params";
import {
  parsePlayerSeasonSortKey,
} from "@/lib/player-season-sort";
import {
  parseExplorePlayersPage,
  parseExplorePlayersSortDir,
} from "@/data/queries/explore-players-board";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const params = Object.fromEntries(searchParams.entries());
  const season =
    parseSeasonParam(searchParams.get("season") ?? undefined) ??
    defaultCanonicalSeasons(1)[0];

  const filters = filtersFromSearchParams({
    ...params,
    season,
  });
  const sortKey = parsePlayerSeasonSortKey(searchParams.get("sort") ?? undefined);
  const sortDir = sortKey
    ? parseExplorePlayersSortDir(searchParams.get("dir") ?? undefined, sortKey)
    : undefined;
  const page = parseExplorePlayersPage(searchParams.get("page") ?? undefined);
  const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") ?? "100", 10);
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 && pageSizeRaw <= 500
      ? pageSizeRaw
      : 100;

  const view = await getExplorePlayersBoardView({
    filters,
    sortKey,
    sortDir,
    page,
    pageSize,
  });

  const registryTotal = hasPlayerUniverseSeason(season)
    ? countSeasonPlayerUniverse(season)
    : null;

  return NextResponse.json({
    season,
    mode: "directory",
    universe: hasPlayerUniverseSeason(season)
      ? "historical-player-season-registry"
      : "provider-season-board",
    dependsOnDrbl: false,
    drblSeason: isDrblSeason(season),
    total: view.totalCount,
    page: view.page,
    pageSize: view.pageSize,
    pageCount: view.pageCount,
    sortKey: view.sortKey,
    sortDir: view.sortDir,
    registryTotal,
    players: view.rows.map((p) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      teamId: p.teamId,
      teamAbbreviation: p.teamAbbreviation,
      gamesPlayed: p.gamesPlayed,
      minutes: p.minutes,
      points: p.points,
      rebounds: p.rebounds,
      assists: p.assists,
      ppg: p.ppg,
      rpg: p.rpg,
      apg: p.apg,
      drbl100: p.drbl100 ?? null,
      war1: p.r1WinEquivalents ?? null,
    })),
  });
}
