"use client";

import {
  Fragment,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  buildLeaderboardContextIndex,
  buildLeaderboardRowContext,
  type LeaderboardRowContext,
} from "@/analytics";
import {
  LeaderboardContextBody,
  LeaderboardRowContextPanel,
} from "@/components/explore/leaderboard-row-context";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamLogo } from "@/components/brand/team-logo";
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
import type { PlayerSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";
import {
  defaultPlayerSeasonSortDir,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";

type SortKey = PlayerSeasonSortKey;

export interface PlayerSeasonTableProps {
  players: PlayerSeason[];
  /** Seed sort from URL (?sort=trueShootingPct). */
  initialSortKey?: PlayerSeasonSortKey;
  initialSortDir?: "asc" | "desc";
}

type Row = PlayerSeason & {
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  tov: number;
};

function perGame(total: number, gp: number): number {
  if (!gp) return 0;
  return total / gp;
}

function toRow(p: PlayerSeason): Row {
  const gp = p.gamesPlayed || 0;
  return {
    ...p,
    mpg: perGame(p.minutes, gp),
    ppg: perGame(p.points, gp),
    rpg: perGame(p.rebounds, gp),
    apg: perGame(p.assists, gp),
    spg: perGame(p.steals, gp),
    bpg: perGame(p.blocks, gp),
    tov: perGame(p.turnovers, gp),
  };
}

function sortValue(row: Row, key: SortKey): string | number {
  const v = row[key];
  if (v == null || Number.isNaN(v as number)) {
    if (typeof v === "string") return "";
    return sortKeyIsImpact(key) ? Number.NEGATIVE_INFINITY : 0;
  }
  return v as string | number;
}

function sortKeyIsImpact(key: SortKey): boolean {
  return key === "darkoDpm" || key === "lebron";
}

export function PlayerSeasonTable({
  players,
  initialSortKey,
  initialSortDir,
}: PlayerSeasonTableProps) {
  const [query, setQuery] = useState("");
  const [openContextId, setOpenContextId] = useState<string | null>(null);
  const hasDarko = players.some((p) => p.darkoDpm != null);
  const hasLebron = players.some((p) => p.lebron != null);
  const [sortKey, setSortKey] = useState<SortKey>(
    initialSortKey ?? (hasDarko ? "darkoDpm" : "ppg")
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    initialSortDir ??
      defaultPlayerSeasonSortDir(
        initialSortKey ?? (hasDarko ? "darkoDpm" : "ppg")
      )
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const mapped = players.map(toRow);
    const filtered = needle
      ? mapped.filter(
          (p) =>
            p.playerName.toLowerCase().includes(needle) ||
            p.teamName.toLowerCase().includes(needle) ||
            p.teamId.toLowerCase().includes(needle) ||
            (p.position ?? "").toLowerCase().includes(needle)
        )
      : mapped;

    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      if (an === bn) return a.playerName.localeCompare(b.playerName);
      return sortDir === "asc" ? an - bn : bn - an;
    });
  }, [players, query, sortDir, sortKey]);

  /** Percentile pools for the current filtered board + active sort focus. */
  const contextIndex = useMemo(
    () => buildLeaderboardContextIndex(rows, sortKey),
    [rows, sortKey]
  );

  function toggleSort(key: SortKey) {
    setOpenContextId(null);
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultPlayerSeasonSortDir(key));
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

  return (
    <section
      aria-labelledby="player-table-heading"
      className="flex flex-col gap-3"
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
            {rows.length} player{rows.length === 1 ? "" : "s"} · per-game
            counting stats ·{" "}
            <span className="font-medium text-foreground">{sortHint}</span>
            {" · "}
            tap <span className="font-semibold text-foreground">i</span> for
            percentile context
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          <Label htmlFor="table-search">Find in table</Label>
          <Input
            id="table-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpenContextId(null);
            }}
            placeholder="Name, team, position"
            autoComplete="off"
          />
        </div>
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
                  const brand = resolveTeamBrand(player.teamId);
                  const rowContext = buildLeaderboardRowContext(
                    player,
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
                        <Num>{formatPct(player.effectiveFieldGoalPct)}</Num>
                        <Num>{formatPct(player.trueShootingPct)}</Num>
                        <Num>{formatPct(player.usagePct)}</Num>
                        <Num>{formatNumber(player.offensiveRating, 1)}</Num>
                        <Num>{formatNumber(player.defensiveRating, 1)}</Num>
                        <Num>{formatSigned(player.netRating)}</Num>
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

function formatOptionalImpact(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
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
