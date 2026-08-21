"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamLogo } from "@/components/brand/team-logo";
import { useQueryNav } from "@/components/continuity/query-nav";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { ExplorePlayerBoardRow } from "@/data/queries/explore-players-board";
import { formatNumber, formatPct } from "@/lib/format";
import { textLinkClassName, type } from "@/lib/design-system";
import {
  filterPlayerBoardViewColumns,
  parsePlayerBoardRate,
  parsePlayerBoardViews,
  playerBoardViewLabel,
  type PlayerBoardRate,
  type PlayerBoardView,
} from "@/lib/explore-players-display";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";
import {
  defaultPlayerSeasonSortDir,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";

type SortKey = PlayerSeasonSortKey;

type BoardPageResponse = {
  rows?: ExplorePlayerBoardRow[];
  page?: number;
  pageCount?: number;
  totalCount?: number;
  error?: string;
};

function rowKey(player: ExplorePlayerBoardRow) {
  return `${player.playerId}-${player.season}-${player.teamId}`;
}

async function fetchBoardPage(
  searchParams: URLSearchParams,
  options: {
    page: number;
    season: string;
    sortKey: PlayerSeasonSortKey;
    sortDir: "asc" | "desc";
  }
): Promise<{
  rows: ExplorePlayerBoardRow[];
  page: number;
  pageCount: number;
  totalCount: number;
}> {
  const params = new URLSearchParams(searchParams.toString());
  params.set("page", String(options.page));
  params.set("sort", options.sortKey);
  params.set("dir", options.sortDir);
  if (!params.get("season")) params.set("season", options.season);
  const res = await fetch(`/api/explore/players/board?${params.toString()}`, {
    cache: "no-store",
  });
  const body = (await res.json()) as BoardPageResponse;
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return {
    rows: body.rows ?? [],
    page: body.page ?? options.page,
    pageCount: body.pageCount ?? 1,
    totalCount: body.totalCount ?? 0,
  };
}

export interface PlayerSeasonTableProps {
  players: ExplorePlayerBoardRow[];
  season: string;
  totalCount: number;
  pageSize: number;
  pageCount: number;
  sortKey: PlayerSeasonSortKey;
  sortDir: "asc" | "desc";
  hasDarko: boolean;
  hasLebron: boolean;
  hasDrbl: boolean;
}

export function PlayerSeasonTable({
  players,
  season,
  totalCount,
  pageSize,
  pageCount,
  sortKey,
  sortDir,
  hasDarko,
  hasLebron,
  hasDrbl,
}: PlayerSeasonTableProps) {
  const { pending, replaceParams, searchParams } = useQueryNav();
  const [rows, setRows] = useState(players);
  const [loadedPage, setLoadedPage] = useState(1);
  const [hasMore, setHasMore] = useState(pageCount > 1 && players.length >= pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestIdRef.current += 1;
    loadingRef.current = false;
    setRows(players);
    setLoadedPage(1);
    setHasMore(pageCount > 1 && players.length >= pageSize);
    setLoadingMore(false);
    setLoadError(null);
  }, [players, pageCount, pageSize, sortKey, sortDir, season]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingRef.current) return;
    const requestId = requestIdRef.current;
    loadingRef.current = true;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const next = await fetchBoardPage(searchParams, {
        page: loadedPage + 1,
        season,
        sortKey,
        sortDir,
      });
      if (requestId !== requestIdRef.current) return;
      const seen = new Set(rows.map(rowKey));
      const extra = next.rows.filter((row) => !seen.has(rowKey(row)));
      if (!extra.length) {
        setHasMore(false);
      } else {
        setRows((prev) => [...prev, ...extra]);
        setHasMore(next.page < next.pageCount);
      }
      setLoadedPage(next.page);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(
        err instanceof Error ? err.message : "Could not load more players"
      );
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadedPage, rows, searchParams, season, sortDir, sortKey]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "900px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const views = parsePlayerBoardViews(searchParams.get("view"));
  const rate = parsePlayerBoardRate(searchParams.get("rate"));
  const flags = { hasDarko, hasLebron, hasDrbl };
  const groups = views
    .map((id) => ({
      id,
      label: playerBoardViewLabel(id),
      keys: columnsForView(id, flags),
    }))
    .filter((group) => group.keys.length > 0);
  const grouped = groups.length > 1;
  const statCount = groups.reduce((sum, group) => sum + group.keys.length, 0);
  const colCount = 3 + statCount;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      const nextDir = sortDir === "asc" ? "desc" : "asc";
      replaceParams({
        sort: key,
        dir: nextDir === defaultPlayerSeasonSortDir(key) ? null : nextDir,
        page: null,
      });
    } else {
      const nextDir = defaultPlayerSeasonSortDir(key);
      replaceParams({
        sort: key,
        dir: nextDir === defaultPlayerSeasonSortDir(key) ? null : nextDir,
        page: null,
      });
    }
  }

  return (
    <section
      aria-label="Player table"
      className="query-updating-content flex flex-col gap-3"
      data-pending={pending ? "true" : "false"}
    >
      <div className="sports-card board-scroll-host overflow-hidden">
        <div className="overflow-x-auto">
          <Table container={false} className="min-w-[1600px] text-[12px]">
            <TableHeader className="sticky top-0 z-20">
              <TableRow className="hover:bg-transparent">
                <SortableTableHead
                  sticky
                  className={grouped ? "align-bottom" : undefined}
                  rowSpan={grouped ? 2 : 1}
                  active={sortKey === "playerName"}
                  dir={sortDir}
                  onClick={() => toggleSort("playerName")}
                  align="left"
                >
                  Player
                </SortableTableHead>
                <SortableTableHead
                  className={grouped ? "align-bottom" : undefined}
                  rowSpan={grouped ? 2 : 1}
                  active={sortKey === "teamName"}
                  dir={sortDir}
                  onClick={() => toggleSort("teamName")}
                  align="left"
                >
                  Tm
                </SortableTableHead>
                <SortableTableHead
                  className={grouped ? "align-bottom" : undefined}
                  rowSpan={grouped ? 2 : 1}
                  active={sortKey === "position"}
                  dir={sortDir}
                  onClick={() => toggleSort("position")}
                  align="left"
                >
                  Pos
                </SortableTableHead>
                {grouped
                  ? groups.map((group) => (
                      <TableHead
                        key={group.id}
                        colSpan={group.keys.length}
                        className="h-8 border-l border-border px-2 text-center text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                      >
                        {group.label}
                      </TableHead>
                    ))
                  : groups.flatMap((group) =>
                      group.keys.map((col) => (
                        <StatHead
                          key={`${group.id}-${col}`}
                          col={col}
                          view={group.id}
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                      ))
                    )}
              </TableRow>
              {grouped ? (
                <TableRow className="hover:bg-transparent">
                  {groups.flatMap((group, gi) =>
                    group.keys.map((col, ki) => (
                      <StatHead
                        key={`${group.id}-${col}`}
                        col={col}
                        view={group.id}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                        groupedStart={ki === 0 && gi > 0}
                      />
                    ))
                  )}
                </TableRow>
              ) : null}
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={colCount}
                    className="text-muted-foreground"
                  >
                    No players match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((player) => {
                  const isMultiTeam =
                    player.teamId === "TOT" ||
                    ["TOT", "2TM", "3TM", "4TM"].includes(
                      (player.teamAbbreviation ?? "").toUpperCase()
                    );
                  const brand = isMultiTeam
                    ? undefined
                    : resolveTeamBrand(player.teamId);
                  const teamLabel = isMultiTeam
                    ? player.teamAbbreviation?.toUpperCase() === "2TM" ||
                      player.teamAbbreviation?.toUpperCase() === "3TM" ||
                      player.teamAbbreviation?.toUpperCase() === "4TM"
                      ? "Multiple"
                      : "TOT"
                    : (brand?.abbr ??
                      player.teamAbbreviation ??
                      ( /^\d{6,}$/.test(player.teamId) ? "-" : player.teamId));
                  return (
                      <TableRow key={rowKey(player)}>
                        <TableCell className="board-sticky-frost sticky left-0 z-20">
                          <div className="flex min-w-[11.5rem] items-center">
                            <PlayerIdentity
                              playerId={player.playerId}
                              name={player.playerName}
                              teamKey={isMultiTeam ? undefined : player.teamId}
                              teamLabel={teamLabel}
                              position={player.position}
                              season={player.season}
                              variant="compact"
                              className="min-w-0 flex-1"
                              nameClassName="gap-2"
                            >
                              <PlayerHeadshot
                                playerId={player.playerId}
                                name={player.playerName}
                                teamKey={
                                  isMultiTeam ? undefined : player.teamId
                                }
                                size="sm"
                              />
                              <span
                                className={cn(
                                  "truncate",
                                  type.body,
                                  textLinkClassName
                                )}
                              >
                                {player.playerName}
                              </span>
                            </PlayerIdentity>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            {!isMultiTeam ? (
                              <TeamLogo teamKey={player.teamId} size="xs" />
                            ) : null}
                            <span className="text-[12px] font-semibold uppercase tracking-wide">
                              {teamLabel}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {player.position ?? "-"}
                        </TableCell>
                        {groups.flatMap((group, gi) =>
                          group.keys.map((col, ki) => (
                            <StatCell
                              key={`${group.id}-${col}`}
                              col={col}
                              player={player}
                              rate={rate}
                              groupedStart={grouped && ki === 0 && gi > 0}
                            />
                          ))
                        )}
                      </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {hasMore ? <div ref={sentinelRef} aria-hidden className="h-1" /> : null}
      {loadingMore ? (
        <p className="text-center text-[12px] text-muted-foreground">
          Loading more players…
        </p>
      ) : null}
      {loadError ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          className="self-center rounded-md bg-secondary px-4 py-2 text-[14px] font-semibold hover:bg-secondary/80"
        >
          Couldn’t load more - try again
        </button>
      ) : null}
      {rows.length ? (
        <p className="text-[12px] text-muted-foreground">
          Showing {rows.length} of {totalCount} player
          {totalCount === 1 ? "" : "s"}
          {hasMore ? " · more appear as you scroll" : ""}
          <span className="sr-only">
            {pending ? " Updating results…" : ""}
          </span>
        </p>
      ) : null}
    </section>
  );
}

type TableCol = PlayerSeasonSortKey | "pointsCreated" | "rimAssists";

function columnsForView(
  view: PlayerBoardView,
  flags: { hasDarko: boolean; hasLebron: boolean; hasDrbl: boolean }
): TableCol[] {
  const keys: TableCol[] = [...filterPlayerBoardViewColumns(view, flags)];
  if (view !== "all") return keys;
  const withExtras: TableCol[] = [];
  for (const key of keys) {
    withExtras.push(key);
    if (key === "ppg") withExtras.push("pointsCreated");
    if (key === "apg") withExtras.push("rimAssists");
  }
  return withExtras;
}

function columnLabel(col: TableCol, view: PlayerBoardView): string {
  const profileLike = view === "all" || view === "profile";
  switch (col) {
    case "gamesPlayed":
      return "GP";
    case "mpg":
      return "MIN";
    case "age":
      return "Age";
    case "usagePct":
      return profileLike ? "OnBall %" : "USG%";
    case "darkoDpm":
      return profileLike ? "DPM" : "DARKO";
    case "darkoOff":
      return "ODPM";
    case "darkoDef":
      return "DDPM";
    case "ppg":
      return "PTS";
    case "pointsCreated":
      return "PTS Created";
    case "apg":
      return "AST";
    case "rimAssists":
      return "Rim AST";
    case "rpg":
      return "REB";
    case "tov":
      return "TOV";
    case "trueShootingPct":
      return "TS%";
    case "relativeTrueShootingPct":
      return "rTS%";
    case "turnoverPct":
      return "cTOV%";
    case "twoPointPct":
      return "2P%";
    case "threePointPct":
      return "3P%";
    case "threePointersAttempted":
      return "3PA";
    case "freeThrowPct":
      return "FT%";
    case "freeThrowsAttempted":
      return "FTA";
    case "offensiveRebounds":
      return "OREB";
    case "defensiveRebounds":
      return "DREB";
    case "spg":
      return "STL";
    case "bpg":
      return "BLK";
    case "fieldGoalPct":
      return "FG%";
    case "effectiveFieldGoalPct":
      return "eFG%";
    case "offensiveRating":
      return "ORtg";
    case "defensiveRating":
      return "DRtg";
    case "netRating":
      return "NET";
    case "lebron":
      return "LEBRON";
    case "drbl100":
      return "DRBL/100";
    case "r1WinEquivalents":
      return "WAR1";
    default:
      return col;
  }
}

function columnHelp(col: TableCol): string | null {
  switch (col) {
    case "usagePct":
      return "usg";
    case "darkoDpm":
    case "darkoOff":
    case "darkoDef":
      return "darko";
    case "tov":
    case "turnoverPct":
      return "tov";
    case "trueShootingPct":
    case "relativeTrueShootingPct":
      return "ts";
    case "threePointPct":
      return "fg3";
    case "freeThrowPct":
      return "ft";
    case "fieldGoalPct":
      return "fg";
    case "effectiveFieldGoalPct":
      return "efg";
    case "offensiveRating":
      return "ortg";
    case "defensiveRating":
      return "drtg";
    case "netRating":
      return "net";
    case "lebron":
      return "lebron";
    default:
      return null;
  }
}

function formatStat(
  col: TableCol,
  player: ExplorePlayerBoardRow,
  rate: PlayerBoardRate
): string {
  switch (col) {
    case "gamesPlayed":
      return formatNumber(player.gamesPlayed);
    case "mpg":
      return formatNumber(
        rate === "totals" ? player.minutes : player.mpg,
        rate === "totals" ? 0 : 1
      );
    case "age":
      return player.age != null ? formatNumber(player.age, 0) : "-";
    case "usagePct":
      return formatOptionalPct(player.usagePct);
    case "darkoDpm":
      return formatOptionalImpact(player.darkoDpm);
    case "darkoOff":
      return formatOptionalImpact(player.darkoOff);
    case "darkoDef":
      return formatOptionalImpact(player.darkoDef);
    case "ppg":
      return formatCounting(player.ppg, player.points, player.mpg, rate);
    case "pointsCreated":
    case "rimAssists":
      return "-";
    case "apg":
      return formatCounting(player.apg, player.assists, player.mpg, rate);
    case "rpg":
      return formatCounting(player.rpg, player.rebounds, player.mpg, rate);
    case "tov":
      return formatCounting(player.tov, player.turnovers, player.mpg, rate);
    case "trueShootingPct":
      return formatOptionalPct(player.trueShootingPct);
    case "relativeTrueShootingPct":
      return formatRelativeTs(player.relativeTrueShootingPct);
    case "turnoverPct":
      return formatOptionalPct(player.turnoverPct);
    case "twoPointPct":
      return formatOptionalPct(player.twoPointPct);
    case "threePointPct":
      return formatPct(player.threePointPct);
    case "threePointersAttempted":
      return formatOptionalCounting(
        player.threePointersAttempted,
        player.gamesPlayed,
        player.mpg,
        rate
      );
    case "freeThrowPct":
      return formatPct(player.freeThrowPct);
    case "freeThrowsAttempted":
      return formatOptionalCounting(
        player.freeThrowsAttempted,
        player.gamesPlayed,
        player.mpg,
        rate
      );
    case "offensiveRebounds":
      return formatOptionalCounting(
        player.offensiveRebounds,
        player.gamesPlayed,
        player.mpg,
        rate
      );
    case "defensiveRebounds":
      return formatOptionalCounting(
        player.defensiveRebounds,
        player.gamesPlayed,
        player.mpg,
        rate
      );
    case "spg":
      return formatCounting(player.spg, player.steals, player.mpg, rate);
    case "bpg":
      return formatCounting(player.bpg, player.blocks, player.mpg, rate);
    case "fieldGoalPct":
      return formatPct(player.fieldGoalPct);
    case "effectiveFieldGoalPct":
      return formatOptionalPct(player.effectiveFieldGoalPct);
    case "offensiveRating":
      return formatOptionalRating(player.offensiveRating);
    case "defensiveRating":
      return formatOptionalRating(player.defensiveRating);
    case "netRating":
      return formatOptionalNet(player.netRating);
    case "lebron":
      return formatOptionalImpact(player.lebron);
    case "drbl100":
      return formatOptionalDrbl(player.drbl100);
    case "r1WinEquivalents":
      return formatOptionalDrbl(player.r1WinEquivalents);
    default:
      return "-";
  }
}

function StatHead({
  col,
  view,
  sortKey,
  sortDir,
  onSort,
  groupedStart,
}: {
  col: TableCol;
  view: PlayerBoardView;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  groupedStart?: boolean;
}) {
  const className = cn(groupedStart && "border-l border-border");
  if (col === "pointsCreated" || col === "rimAssists") {
    return (
      <TableHead className={cn("h-auto p-0", className)}>
        <div className="flex h-10 w-full min-w-max items-center justify-end px-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {columnLabel(col, view)}
          </span>
        </div>
      </TableHead>
    );
  }
  return (
    <SortableTableHead
      className={className}
      active={sortKey === col}
      dir={sortDir}
      onClick={() => onSort(col)}
      helpConceptId={columnHelp(col)}
    >
      {columnLabel(col, view)}
    </SortableTableHead>
  );
}

function StatCell({
  col,
  player,
  rate,
  groupedStart,
}: {
  col: TableCol;
  player: ExplorePlayerBoardRow;
  rate: PlayerBoardRate;
  groupedStart?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        "text-right tabular-nums text-[12px]",
        groupedStart && "border-l border-border"
      )}
    >
      {formatStat(col, player, rate)}
    </TableCell>
  );
}

function formatCounting(
  perGame: number,
  total: number,
  mpg: number,
  rate: PlayerBoardRate
): string {
  if (rate === "totals") return formatNumber(total, 0);
  if (rate === "perGame" || mpg <= 0) return formatNumber(perGame, 1);
  const scaled = rate === "per75" ? (perGame * 75) / mpg : (perGame * 100) / mpg;
  return formatNumber(scaled, 1);
}

function formatOptionalCounting(
  total: number | undefined,
  gp: number,
  mpg: number,
  rate: PlayerBoardRate
): string {
  if (total == null || Number.isNaN(total)) return "-";
  return formatCounting(gp ? total / gp : 0, total, mpg, rate);
}

function formatRelativeTs(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  const pts = n * 100;
  const sign = pts > 0 ? "+" : "";
  return `${sign}${formatNumber(pts, 1)}`;
}

function formatSigned(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatNumber(n, 1)}`;
}

/** Missing ≠ zero - ESPN boards omit individual DRtg/NET. */
function formatOptionalRating(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  return formatNumber(n, 1);
}

function formatOptionalPct(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  return formatPct(n);
}

function formatOptionalNet(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  return formatSigned(n);
}

function formatOptionalImpact(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

/** Missing DRBL ≠ zero - never display placeholder zeros as estimates. */
function formatOptionalDrbl(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  return formatNumber(n, 1);
}
