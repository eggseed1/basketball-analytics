"use client";

import {
  Fragment,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  buildLeaderboardRowContext,
  leaderboardContextIndexFromPools,
  type LeaderboardRowContext,
} from "@/analytics";
import {
  LeaderboardContextBody,
  LeaderboardRowContextPanel,
} from "@/components/explore/leaderboard-row-context";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  TransitionLink,
  useQueryNav,
} from "@/components/continuity/query-nav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { ExplorePlayerBoardRow } from "@/data/queries/explore-players-board";
import { formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";
import {
  defaultPlayerSeasonSortDir,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";

type SortKey = PlayerSeasonSortKey;

export interface PlayerSeasonTableProps {
  players: ExplorePlayerBoardRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sortKey: PlayerSeasonSortKey;
  sortDir: "asc" | "desc";
  hasDarko: boolean;
  hasLebron: boolean;
  boardSampleSize: number;
  contextPools: Record<string, number[]>;
}

export function PlayerSeasonTable({
  players,
  totalCount,
  page,
  pageSize,
  pageCount,
  sortKey,
  sortDir,
  hasDarko,
  hasLebron,
  boardSampleSize,
  contextPools,
}: PlayerSeasonTableProps) {
  const { pending, replaceParams, searchParams, pathname } = useQueryNav();
  const [openContextId, setOpenContextId] = useState<string | null>(null);
  const playerQuery = searchParams.get("player") ?? "";
  const [queryDraft, setQueryDraft] = useState(playerQuery);
  const [draftSource, setDraftSource] = useState(playerQuery);

  if (playerQuery !== draftSource) {
    setDraftSource(playerQuery);
    setQueryDraft(playerQuery);
  }

  const contextIndex = useMemo(
    () =>
      leaderboardContextIndexFromPools({
        sortKey,
        sampleSize: boardSampleSize,
        pools: contextPools,
      }),
    [boardSampleSize, contextPools, sortKey]
  );

  function patchParams(patch: Record<string, string | null>) {
    replaceParams(patch);
  }

  function toggleSort(key: SortKey) {
    setOpenContextId(null);
    if (sortKey === key) {
      const nextDir = sortDir === "asc" ? "desc" : "asc";
      patchParams({
        sort: key,
        dir: nextDir === defaultPlayerSeasonSortDir(key) ? null : nextDir,
        page: null,
      });
    } else {
      const nextDir = defaultPlayerSeasonSortDir(key);
      patchParams({
        sort: key,
        dir: nextDir === defaultPlayerSeasonSortDir(key) ? null : nextDir,
        page: null,
      });
    }
  }

  const sortHint = (() => {
    const label = COLUMN_META[sortKey]?.label ?? sortKey;
    if (
      sortKey === "playerName" ||
      sortKey === "teamName" ||
      sortKey === "position"
    ) {
      return sortDir === "asc" ? `${label} · A → Z` : `${label} · Z → A`;
    }
    if (sortKey === "defensiveRating" || sortKey === "tov") {
      return sortDir === "asc"
        ? `${label} · best → worst`
        : `${label} · worst → best`;
    }
    return sortDir === "desc"
      ? `${label} · best → worst`
      : `${label} · worst → best`;
  })();

  const colCount = 18 + (hasDarko ? 1 : 0) + (hasLebron ? 1 : 0);
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  const pageHref = (p: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <section
      aria-labelledby="player-table-heading"
      className="query-updating-content flex flex-col gap-3"
      data-pending={pending ? "true" : "false"}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="player-table-heading"
            className="text-xl font-bold tracking-tight"
          >
            Player table
          </h2>
          <p className="text-sm text-muted-foreground">
            {totalCount} player{totalCount === 1 ? "" : "s"}
            {totalCount > 0 ? (
              <>
                {" "}
                · showing {from}–{to}
              </>
            ) : null}{" "}
            · per-game counting stats ·{" "}
            <span className="font-medium text-foreground">{sortHint}</span>
            {" · "}
            tap <span className="font-semibold text-foreground">i</span> for
            percentile context
          </p>
        </div>
        <form
          className="flex w-full max-w-xs flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            setOpenContextId(null);
            patchParams({
              player: queryDraft.trim() || null,
              page: null,
            });
          }}
        >
          <Label htmlFor="table-search">Find in table</Label>
          <Input
            id="table-search"
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            onBlur={() => {
              const next = queryDraft.trim();
              if (next === playerQuery) return;
              setOpenContextId(null);
              patchParams({ player: next || null, page: null });
            }}
            placeholder="Name, team, position"
            autoComplete="off"
          />
        </form>
      </div>

      <div className="sports-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table container={false} className="min-w-[1100px] text-[12px]">
            <TableHeader className="sticky top-0 z-20 bg-card">
              <TableRow className="hover:bg-transparent">
                <SortableTableHead
                  sticky
                  active={sortKey === "playerName"}
                  dir={sortDir}
                  onClick={() => toggleSort("playerName")}
                  align="left"
                >
                  Player
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "teamName"}
                  dir={sortDir}
                  onClick={() => toggleSort("teamName")}
                  align="left"
                >
                  Tm
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "position"}
                  dir={sortDir}
                  onClick={() => toggleSort("position")}
                  align="left"
                >
                  Pos
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "gamesPlayed"}
                  dir={sortDir}
                  onClick={() => toggleSort("gamesPlayed")}
                >
                  GP
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "mpg"}
                  dir={sortDir}
                  onClick={() => toggleSort("mpg")}
                >
                  MPG
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "ppg"}
                  dir={sortDir}
                  onClick={() => toggleSort("ppg")}
                >
                  PPG
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "rpg"}
                  dir={sortDir}
                  onClick={() => toggleSort("rpg")}
                >
                  RPG
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "apg"}
                  dir={sortDir}
                  onClick={() => toggleSort("apg")}
                >
                  APG
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "spg"}
                  dir={sortDir}
                  onClick={() => toggleSort("spg")}
                >
                  SPG
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "bpg"}
                  dir={sortDir}
                  onClick={() => toggleSort("bpg")}
                >
                  BPG
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "tov"}
                  dir={sortDir}
                  onClick={() => toggleSort("tov")}
                  helpConceptId="tov"
                >
                  TOV
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "fieldGoalPct"}
                  dir={sortDir}
                  onClick={() => toggleSort("fieldGoalPct")}
                  helpConceptId="fg"
                >
                  FG%
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "threePointPct"}
                  dir={sortDir}
                  onClick={() => toggleSort("threePointPct")}
                  helpConceptId="fg3"
                >
                  3P%
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "freeThrowPct"}
                  dir={sortDir}
                  onClick={() => toggleSort("freeThrowPct")}
                  helpConceptId="ft"
                >
                  FT%
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "effectiveFieldGoalPct"}
                  dir={sortDir}
                  onClick={() => toggleSort("effectiveFieldGoalPct")}
                  helpConceptId="efg"
                >
                  eFG%
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "trueShootingPct"}
                  dir={sortDir}
                  onClick={() => toggleSort("trueShootingPct")}
                  helpConceptId="ts"
                >
                  TS%
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "usagePct"}
                  dir={sortDir}
                  onClick={() => toggleSort("usagePct")}
                  helpConceptId="usg"
                >
                  USG%
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "offensiveRating"}
                  dir={sortDir}
                  onClick={() => toggleSort("offensiveRating")}
                  helpConceptId="ortg"
                >
                  ORtg
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "defensiveRating"}
                  dir={sortDir}
                  onClick={() => toggleSort("defensiveRating")}
                  helpConceptId="drtg"
                >
                  DRtg
                </SortableTableHead>
                <SortableTableHead
                  active={sortKey === "netRating"}
                  dir={sortDir}
                  onClick={() => toggleSort("netRating")}
                  helpConceptId="net"
                >
                  NET
                </SortableTableHead>
                {hasDarko ? (
                  <SortableTableHead
                    active={sortKey === "darkoDpm"}
                    dir={sortDir}
                    onClick={() => toggleSort("darkoDpm")}
                    helpConceptId="darko"
                  >
                    DARKO
                  </SortableTableHead>
                ) : null}
                {hasLebron ? (
                  <SortableTableHead
                    active={sortKey === "lebron"}
                    dir={sortDir}
                    onClick={() => toggleSort("lebron")}
                    helpConceptId="lebron"
                  >
                    LEBRON
                  </SortableTableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={colCount}
                    className="text-muted-foreground"
                  >
                    No players match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                players.map((player) => {
                  const brand = resolveTeamBrand(player.teamId);
                  const rowContext = buildLeaderboardRowContext(
                    player as Parameters<typeof buildLeaderboardRowContext>[0],
                    contextIndex
                  );
                  const open = openContextId === player.playerId;
                  return (
                    <Fragment key={`${player.playerId}-${player.season}`}>
                      <TableRow
                        className={cn(
                          "team-stripe",
                          open && "bg-secondary/30"
                        )}
                        style={
                          {
                            "--team-primary":
                              brand?.primary ?? "var(--primary)",
                          } as CSSProperties
                        }
                      >
                        <TableCell className="sticky left-0 z-10 overflow-visible bg-card">
                          <div className="flex min-w-[11.5rem] items-center gap-1.5">
                            <PlayerIdentity
                              playerId={player.playerId}
                              name={player.playerName}
                              teamKey={player.teamId}
                              teamLabel={brand?.abbr ?? player.teamId}
                              position={player.position}
                              season={player.season}
                              variant="compact"
                              className="min-w-0 flex-1"
                            >
                              <span className="relative inline-flex shrink-0">
                                <PlayerHeadshot
                                  playerId={player.playerId}
                                  name={player.playerName}
                                  teamKey={player.teamId}
                                  size="sm"
                                />
                                <span className="absolute -right-1 -bottom-1 rounded-full bg-card p-px ring-1 ring-border">
                                  <TeamLogo
                                    teamKey={player.teamId}
                                    size="2xs"
                                  />
                                </span>
                              </span>
                              <span className="truncate">
                                {player.playerName}
                              </span>
                            </PlayerIdentity>
                            {rowContext ? (
                              <LeaderboardRowContextPanel
                                context={rowContext}
                                open={open}
                                onOpenChange={(next) =>
                                  setOpenContextId(
                                    next ? player.playerId : null
                                  )
                                }
                              />
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            <TeamLogo teamKey={player.teamId} size="xs" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide">
                              {brand?.abbr ?? player.teamId}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {player.position ?? "-"}
                        </TableCell>
                        <Num>{formatNumber(player.gamesPlayed)}</Num>
                        <Num>{formatNumber(player.mpg, 1)}</Num>
                        <Num>{formatNumber(player.ppg, 1)}</Num>
                        <Num>{formatNumber(player.rpg, 1)}</Num>
                        <Num>{formatNumber(player.apg, 1)}</Num>
                        <Num>{formatNumber(player.spg, 1)}</Num>
                        <Num>{formatNumber(player.bpg, 1)}</Num>
                        <Num>{formatNumber(player.tov, 1)}</Num>
                        <Num>{formatPct(player.fieldGoalPct)}</Num>
                        <Num>{formatPct(player.threePointPct)}</Num>
                        <Num>{formatPct(player.freeThrowPct)}</Num>
                        <Num>{formatOptionalPct(player.effectiveFieldGoalPct)}</Num>
                        <Num>{formatOptionalPct(player.trueShootingPct)}</Num>
                        <Num>{formatOptionalPct(player.usagePct)}</Num>
                        <Num>
                          {formatOptionalRating(player.offensiveRating)}
                        </Num>
                        <Num>
                          {formatOptionalRating(player.defensiveRating)}
                        </Num>
                        <Num>{formatOptionalNet(player.netRating)}</Num>
                        {hasDarko ? (
                          <Num>{formatOptionalImpact(player.darkoDpm)}</Num>
                        ) : null}
                        {hasLebron ? (
                          <Num>{formatOptionalImpact(player.lebron)}</Num>
                        ) : null}
                      </TableRow>
                      {open && rowContext ? (
                        <TableRow className="border-0 sm:hidden">
                          <TableCell
                            colSpan={colCount}
                            className="bg-secondary/25 px-3 pb-3 pt-0"
                          >
                            <LeaderboardMobileContext context={rowContext} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {pageCount > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-3"
          aria-label="Player table pages"
        >
          <p className="text-[13px] text-muted-foreground">
            Page {page} of {pageCount}
            <span className="sr-only">
              {pending ? " Updating results…" : ""}
            </span>
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <TransitionLink
                href={pageHref(page - 1)}
                className="sports-pill text-[13px]"
                scroll={false}
                replace
              >
                Previous
              </TransitionLink>
            ) : (
              <span className="sports-pill pointer-events-none text-[13px] opacity-40">
                Previous
              </span>
            )}
            {page < pageCount ? (
              <TransitionLink
                href={pageHref(page + 1)}
                className="sports-pill text-[13px]"
                scroll={false}
                replace
              >
                Next
              </TransitionLink>
            ) : (
              <span className="sports-pill pointer-events-none text-[13px] opacity-40">
                Next
              </span>
            )}
          </div>
        </nav>
      ) : null}
    </section>
  );
}

function LeaderboardMobileContext({
  context,
}: {
  context: LeaderboardRowContext;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-3">
      <LeaderboardContextBody context={context} />
    </div>
  );
}

const COLUMN_META: Partial<Record<SortKey, { label: string }>> = {
  playerName: { label: "Player" },
  teamName: { label: "Team" },
  position: { label: "Pos" },
  gamesPlayed: { label: "GP" },
  mpg: { label: "MPG" },
  ppg: { label: "PPG" },
  rpg: { label: "RPG" },
  apg: { label: "APG" },
  spg: { label: "SPG" },
  bpg: { label: "BPG" },
  tov: { label: "TOV" },
  fieldGoalPct: { label: "FG%" },
  threePointPct: { label: "3P%" },
  freeThrowPct: { label: "FT%" },
  effectiveFieldGoalPct: { label: "eFG%" },
  trueShootingPct: { label: "TS%" },
  usagePct: { label: "USG%" },
  offensiveRating: { label: "ORtg" },
  defensiveRating: { label: "DRtg" },
  netRating: { label: "NET" },
  darkoDpm: { label: "DARKO" },
  lebron: { label: "LEBRON" },
};

function formatSigned(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatNumber(n, 1)}`;
}

/** Missing ≠ zero — ESPN boards omit individual DRtg/NET. */
function formatOptionalRating(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return formatNumber(n, 1);
}

function formatOptionalPct(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return formatPct(n);
}

function formatOptionalNet(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return formatSigned(n);
}

function formatOptionalImpact(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function Num({ children }: { children: ReactNode }) {
  return (
    <TableCell className="text-right tabular-nums text-[12px]">
      {children}
    </TableCell>
  );
}
