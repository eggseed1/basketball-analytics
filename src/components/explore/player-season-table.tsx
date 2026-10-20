"use client";

import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { BoardScrollFrame } from "@/components/explore/board-scroll-frame";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamIdentity } from "@/components/teams/team-identity";
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
import { textLinkClassName, boardType } from "@/lib/design-system";
import {
  filterPlayerBoardViewColumns,
  parsePlayerBoardRate,
  parsePlayerBoardViews,
  PLAYER_BOARD_CATEGORY_VIEWS,
  type PlayerBoardRate,
  type PlayerBoardView,
} from "@/lib/explore-players-display";
import {
  boardColumnLabel,
  boardStatValue,
  formatBoardStat,
} from "@/lib/player-board-stats";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";
import {
  defaultPlayerSeasonSortDir,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";
import { usePlayerBoardI18n } from "@/components/explore/use-player-board-i18n";

type SortKey = PlayerSeasonSortKey;

function boardTeamPresentation(player: ExplorePlayerBoardRow): {
  isMultiTeam: boolean;
  /** Canonical abbr for display / a11y (PHX not PHO). */
  label: string;
  teamKey: string;
} {
  const rawAbbr = (player.teamAbbreviation ?? "").trim().toUpperCase();
  const isMultiTeam =
    player.teamId === "TOT" ||
    ["TOT", "2TM", "3TM", "4TM"].includes(rawAbbr);
  if (isMultiTeam) {
    const label =
      rawAbbr === "2TM" || rawAbbr === "3TM" || rawAbbr === "4TM"
        ? rawAbbr
        : "TOT";
    return { isMultiTeam: true, label, teamKey: player.teamId };
  }
  const brand =
    resolveTeamBrand(player.teamId) ?? resolveTeamBrand(player.teamAbbreviation);
  const label =
    brand?.abbr ??
    rawAbbr ??
    (/^\d{6,}$/.test(player.teamId) ? "-" : player.teamId);
  return {
    isMultiTeam: false,
    label,
    teamKey: brand?.id ?? player.teamId,
  };
}

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
  /** Columns with no value anywhere on this board; hidden, not shown as 0. */
  emptyColumns?: PlayerSeasonSortKey[];
  seasonAwaitingGames?: boolean;
}

export function PlayerSeasonTable({
  players,
  season,
  totalCount,
  pageSize,
  pageCount,
  sortKey,
  sortDir,
  emptyColumns,
  seasonAwaitingGames = false,
}: PlayerSeasonTableProps) {
  const { pending, replaceParams, searchParams } = useQueryNav();
  const { t, viewLabel } = usePlayerBoardI18n();
  const [rows, setRows] = useState(players);
  const [loadedPage, setLoadedPage] = useState(1);
  const [hasMore, setHasMore] = useState(pageCount > 1 && players.length >= pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const statsTableRef = useRef<HTMLTableElement>(null);
  const frozenColRef = useRef<HTMLDivElement>(null);

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
      // A page is 100 rows with two preview cards each. As a transition React
      // renders them in slices between frames instead of stalling the scroll.
      startTransition(() => {
        if (!extra.length) {
          setHasMore(false);
        } else {
          setRows((prev) => [...prev, ...extra]);
          setHasMore(next.page < next.pageCount);
        }
        setLoadedPage(next.page);
      });
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

  const viewParam = searchParams.get("view");
  const rate = parsePlayerBoardRate(searchParams.get("rate"));
  const emptyKey = emptyColumns?.join(",") ?? "";
  // Rows are memoized, so groups must keep its identity while more rows load.
  const groups = useMemo(
    () =>
      buildPlayerBoardGroups(
        parsePlayerBoardViews(viewParam),
        new Set(emptyKey ? (emptyKey.split(",") as PlayerSeasonSortKey[]) : []),
        viewLabel
      ),
    [viewParam, emptyKey, viewLabel]
  );
  // Always show category band headers — including a single category and the
  // partitioned "all stats" layout.
  const grouped = groups.length > 0;
  const statCount = groups.reduce((sum, group) => sum + group.keys.length, 0);
  // Stats pane: spacer + Tm + Pos + stats (Player lives on the glass overlay).
  const colCount = 3 + statCount;

  const syncFrozenRowHeights = useCallback((from = 0) => {
    const table = statsTableRef.current;
    const frozen = frozenColRef.current;
    if (!table || !frozen) return;
    const head = frozen.querySelector<HTMLElement>("[data-frozen-head]");
    const thead = table.tHead;
    if (head && thead) {
      head.style.height = `${thead.getBoundingClientRect().height}px`;
    }
    const bodyRows = table.tBodies[0]?.rows;
    const frozenRows = frozen.querySelectorAll<HTMLElement>("[data-frozen-row]");
    if (!bodyRows) return;
    // The headshot can make a frozen row taller than its table row (phones), so
    // both sides take the larger natural height. Clear, read all, then write all.
    const pairs: Array<[HTMLTableRowElement, HTMLElement]> = [];
    for (let i = from; i < frozenRows.length; i++) {
      const tr = bodyRows.item(i);
      const fr = frozenRows[i];
      if (!tr || !fr) continue;
      tr.style.height = "";
      fr.style.height = "";
      pairs.push([tr, fr]);
    }
    const heights = pairs.map(([tr, fr]) =>
      Math.max(tr.getBoundingClientRect().height, fr.getBoundingClientRect().height)
    );
    pairs.forEach(([tr, fr], i) => {
      tr.style.height = `${heights[i]}px`;
      fr.style.height = `${heights[i]}px`;
    });
  }, []);

  // Loading more appends rows without touching the ones above, so only the new
  // rows need measuring. A new first row or column set means a fresh list.
  const syncedRef = useRef<{
    first?: ExplorePlayerBoardRow;
    groups?: BoardGroup[];
    count: number;
  }>({ count: 0 });
  useLayoutEffect(() => {
    const prev = syncedRef.current;
    const appended =
      prev.first === rows[0] &&
      prev.groups === groups &&
      rows.length >= prev.count;
    syncFrozenRowHeights(appended ? prev.count : 0);
    syncedRef.current = { first: rows[0], groups, count: rows.length };
  }, [syncFrozenRowHeights, rows, groups]);

  useLayoutEffect(() => {
    const table = statsTableRef.current;
    if (!table || typeof ResizeObserver === "undefined") return;
    let width = -1;
    const ro = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width ?? 0;
      if (next === width) return;
      width = next;
      syncFrozenRowHeights();
    });
    ro.observe(table);
    return () => ro.disconnect();
  }, [syncFrozenRowHeights]);

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
      aria-label={t("tableRegion")}
      className="query-updating-content flex w-full min-w-0 max-w-full flex-col gap-3"
      data-pending={pending ? "true" : "false"}
    >
      <BoardScrollFrame
        frozen={
          <div ref={frozenColRef} className="flex h-full min-h-0 flex-col">
            <div
              data-frozen-head
              className={cn(
                "flex shrink-0 flex-col justify-end border-b border-white/45 px-1.5 dark:border-white/12 sm:px-2",
                grouped && "h-[55px] sm:h-[73px]"
              )}
            >
              <button
                type="button"
                onClick={() => toggleSort("playerName")}
                aria-sort={
                  sortKey === "playerName"
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className={cn(
                  "group flex h-7 w-full min-w-0 items-center gap-1 font-semibold uppercase transition-colors sm:h-10",
                  boardType.head,
                  sortKey === "playerName"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>Player</span>
                <span className="sr-only">
                  {sortKey === "playerName"
                    ? `Sorted ${sortDir === "asc" ? "ascending" : "descending"}`
                    : "Sort"}
                </span>
              </button>
            </div>
            <div className="flex min-h-0 flex-col">
              {rows.map((player) => (
                <FrozenRow key={rowKey(player)} player={player} />
              ))}
            </div>
          </div>
        }
      >
        <Table
          ref={statsTableRef}
          container={false}
          className="board-stats !w-max border-separate border-spacing-0 text-[10.5px] sm:text-[12px]"
        >
          <TableHeader className="sticky top-0 z-20">
            <TableRow className="hover:bg-transparent">
              <TableHead
                aria-hidden
                rowSpan={grouped ? 2 : 1}
                className="board-frozen-spacer sticky left-0 z-10"
              >
                <span className="board-frozen-spacer-slot" />
              </TableHead>
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
                      className={cn(
                        "h-8 border-l border-border/40 px-2 text-center font-semibold uppercase text-muted-foreground",
                        boardType.head
                      )}
                    >
                      {group.label}
                    </TableHead>
                  ))
                : groups.flatMap((group) =>
                    group.keys.map((col) => (
                      <StatHead
                        key={`${group.id}-${col}`}
                        col={col}
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
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      groupedStart={ki === 0}
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
              rows.map((player) => (
                <StatRow
                  key={rowKey(player)}
                  player={player}
                  groups={groups}
                  grouped={grouped}
                  rate={rate}
                  seasonAwaitingGames={seasonAwaitingGames}
                />
              ))
            )}
          </TableBody>
        </Table>
      </BoardScrollFrame>

      {hasMore ? <div ref={sentinelRef} aria-hidden className="h-1" /> : null}
      {loadingMore ? (
        <p className="text-center text-[12px] text-muted-foreground">
          {t("loadingMore")}
        </p>
      ) : null}
      {loadError ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          className="self-center rounded-md bg-secondary px-4 py-2 text-[14px] font-semibold hover:bg-secondary/80"
        >
          {t("loadMoreRetry")}
        </button>
      ) : null}
      {rows.length ? (
        <p className="text-[12px] text-muted-foreground">
          {t("showing", { shown: rows.length, total: totalCount })}
          {hasMore ? t("showingScrollHint") : ""}
          <span className="sr-only">
            {pending ? ` ${t("updatingResultsSr")}` : ""}
          </span>
        </p>
      ) : null}
    </section>
  );
}

const FrozenRow = memo(function FrozenRow({
  player,
}: {
  player: ExplorePlayerBoardRow;
}) {
  const { isMultiTeam, label: teamLabel, teamKey } =
    boardTeamPresentation(player);
  return (
    <div
      data-frozen-row
      className="flex items-center whitespace-nowrap px-1 py-1 sm:px-2 sm:py-2"
    >
      <PlayerIdentity
        playerId={player.playerId}
        name={player.playerName}
        teamKey={isMultiTeam ? undefined : teamKey}
        teamLabel={teamLabel}
        position={player.position}
        season={player.season}
        variant="compact"
        className="w-max max-w-none"
        nameClassName="w-max max-w-none gap-1.5 sm:gap-2"
      >
        <PlayerHeadshot
          playerId={player.playerId}
          name={player.playerName}
          teamKey={isMultiTeam ? undefined : teamKey}
          size="sm"
          className="h-6 w-6 sm:h-9 sm:w-9"
          portraitUrl={player.portraitUrl}
          registryOnly={Boolean(player.portraitUrl)}
        />
        <span
          className={cn(
            "board-name whitespace-nowrap",
            boardType.name,
            textLinkClassName
          )}
        >
          {player.playerName}
        </span>
      </PlayerIdentity>
    </div>
  );
});

const StatRow = memo(function StatRow({
  player,
  groups,
  grouped,
  rate,
  seasonAwaitingGames,
}: {
  player: ExplorePlayerBoardRow;
  groups: BoardGroup[];
  grouped: boolean;
  rate: PlayerBoardRate;
  seasonAwaitingGames: boolean;
}) {
  const { isMultiTeam, label: teamLabel, teamKey } =
    boardTeamPresentation(player);
  return (
    <TableRow className="h-7 hover:bg-transparent sm:h-[52px]">
      <TableCell
        aria-hidden
        className="board-frozen-spacer sticky left-0 z-10"
      >
        <span className="board-frozen-spacer-slot" />
      </TableCell>
      <TableCell>
        {isMultiTeam ? (
          <span
            className={cn(
              "board-tm font-semibold uppercase tracking-wide tabular-nums",
              boardType.cell
            )}
            title="Multiple teams this season"
          >
            {teamLabel}
          </span>
        ) : (
          <TeamIdentity
            teamKey={teamKey}
            label={teamLabel}
            season={player.season}
            className="inline-flex min-w-0"
            nameClassName={cn(
              "board-tm inline-flex items-center font-semibold uppercase tracking-wide",
              boardType.cell
            )}
          >
            <TeamLogo teamKey={teamKey} size="xs" textAbbr={teamLabel} />
            <span className="sr-only">{teamLabel}</span>
          </TeamIdentity>
        )}
      </TableCell>
      <TableCell className={boardType.cell}>
        {player.position ?? "-"}
      </TableCell>
      {groups.flatMap((group) =>
        group.keys.map((col, ki) => (
          <StatCell
            key={`${group.id}-${col}`}
            col={col}
            player={player}
            rate={rate}
            groupedStart={grouped && ki === 0}
            seasonAwaitingGames={seasonAwaitingGames}
          />
        ))
      )}
    </TableRow>
  );
});

type TableCol = PlayerSeasonSortKey;

type BoardGroup = {
  id: PlayerBoardView;
  label: string;
  keys: TableCol[];
};

type EmptyColumns = ReadonlySet<PlayerSeasonSortKey>;

/** Full union of category presets, bucketed under Impact / Profile / … bands. */
function partitionAllColumnsIntoCategories(
  empty: EmptyColumns,
  labelFor: (id: PlayerBoardView) => string
): BoardGroup[] {
  return PLAYER_BOARD_CATEGORY_VIEWS.map((cat) => ({
    id: cat.id,
    label: labelFor(cat.id),
    keys: filterPlayerBoardViewColumns(cat.id, empty),
  })).filter((group) => group.keys.length > 0);
}

function buildPlayerBoardGroups(
  views: PlayerBoardView[],
  empty: EmptyColumns,
  labelFor: (id: PlayerBoardView) => string
): BoardGroup[] {
  if (views.length === 1 && views[0] === "all") {
    return partitionAllColumnsIntoCategories(empty, labelFor);
  }
  return views
    .map((id) => ({
      id,
      label: labelFor(id),
      keys: filterPlayerBoardViewColumns(id, empty),
    }))
    .filter((group) => group.keys.length > 0);
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
    case "raptor":
    case "oRaptor":
    case "dRaptor":
      return "raptor";
    case "winsAdded":
      return "wins_added";
    case "bpm":
      return "bpm";
    case "obpm":
      return "obpm";
    case "dbpm":
      return "dbpm";
    case "per":
      return "per";
    case "winShares":
      return "ws";
    case "winSharesPer48":
      return "ws48";
    case "vorp":
      return "vorp";
    case "pie":
      return "pie";
    case "plusMinus":
      return "plus_minus";
    case "assistToTurnover":
      return "ast_to";
    case "offensiveReboundPct":
      return "orb";
    case "threePointAttemptRate":
      return "three_par";
    case "drbl100":
      return "drbl";
    case "drblO":
      return "drbl_o";
    case "drblD":
      return "drbl_d";
    case "r1WinEquivalents":
      return "r1_win_eq";
    default:
      return null;
  }
}

function formatStat(
  col: TableCol,
  player: ExplorePlayerBoardRow,
  rate: PlayerBoardRate,
  seasonAwaitingGames: boolean
): string {
  if (seasonAwaitingGames) return "—";
  return formatBoardStat(col, boardStatValue(player, col, rate), rate);
}

function StatHead({
  col,
  sortKey,
  sortDir,
  onSort,
  groupedStart,
}: {
  col: TableCol;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  groupedStart?: boolean;
}) {
  const className = cn(groupedStart && "border-l border-border/40");
  return (
    <SortableTableHead
      className={className}
      active={sortKey === col}
      dir={sortDir}
      onClick={() => onSort(col)}
      helpConceptId={columnHelp(col)}
    >
      {boardColumnLabel(col)}
    </SortableTableHead>
  );
}

function StatCell({
  col,
  player,
  rate,
  groupedStart,
  seasonAwaitingGames = false,
}: {
  col: TableCol;
  player: ExplorePlayerBoardRow;
  rate: PlayerBoardRate;
  groupedStart?: boolean;
  seasonAwaitingGames?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        "board-stat text-right tabular-nums",
        boardType.cell,
        groupedStart && "border-l border-border/40",
        seasonAwaitingGames && "text-muted-foreground"
      )}
    >
      {formatStat(col, player, rate, seasonAwaitingGames)}
    </TableCell>
  );
}
