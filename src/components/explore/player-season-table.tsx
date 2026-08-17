"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PlayerHeadshot } from "@/components/player/player-headshot";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTooltip } from "@/components/ui/stat-tooltip";
import type { PlayerSeason } from "@/data/types";
import {
  PLAYER_TABLE_COLUMNS,
  getPlayerSortOption,
  parseSortDir,
  sortPlayerSeasons,
  type PlayerSortKey,
} from "@/lib/player-explore-sort";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import { cn } from "@/lib/utils";

export interface PlayerSeasonTableProps {
  players: PlayerSeason[];
  /** Rows shown before “Load more” (default 50). */
  pageSize?: number;
}

export function PlayerSeasonTable({
  players,
  pageSize = 50,
}: PlayerSeasonTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const seasonKey = searchParams.get("season") ?? "";

  // Drop leftover table needles when the season (or dataset) changes.
  useEffect(() => {
    setQuery("");
    setVisibleCount(pageSize);
  }, [seasonKey, players.length, pageSize]);

  const sortKey = getPlayerSortOption(searchParams.get("sort")).key;
  const sortDir = parseSortDir(searchParams.get("dir"));

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? players.filter((p) => {
          const abbr = nbaTeamAbbr(p.teamId, p.teamAbbreviation).toLowerCase();
          return (
            p.playerName.toLowerCase().includes(needle) ||
            p.teamName.toLowerCase().includes(needle) ||
            abbr.includes(needle) ||
            p.teamId.toLowerCase().includes(needle)
          );
        })
      : players;

    return sortPlayerSeasons(filtered, sortKey, sortDir);
  }, [players, query, sortDir, sortKey]);

  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = visibleCount < rows.length;

  function setSort(key: PlayerSortKey) {
    const next = new URLSearchParams(searchParams.toString());
    if (key === sortKey) {
      next.set("dir", sortDir === "asc" ? "desc" : "asc");
    } else {
      const opt = getPlayerSortOption(key);
      next.set("sort", key);
      next.set("dir", opt.defaultDir);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function teamHref(teamId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("team", teamId);
    return `${pathname}?${next.toString()}`;
  }

  const columns = PLAYER_TABLE_COLUMNS.map((key) => getPlayerSortOption(key));

  return (
    <section
      aria-labelledby="player-table-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="player-table-heading" className="text-lg font-semibold">
            Player table
          </h2>
          <p className="text-sm text-muted-foreground">
            Showing {visibleRows.length} of {rows.length} player
            {rows.length === 1 ? "" : "s"} · click a column to sort · click a
            team to filter
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          <Label htmlFor="table-search">Find in table</Label>
          <Input
            id="table-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter visible rows"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => {
                const active = sortKey === col.key;
                const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                return (
                  <TableHead
                    key={col.key}
                    className={cn(col.numeric && "text-right")}
                  >
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-0.5 font-medium hover:text-foreground",
                        active ? "text-foreground" : "text-muted-foreground",
                        col.numeric && "w-full justify-end"
                      )}
                      onClick={() => setSort(col.key)}
                      aria-label={`Sort by ${col.label}${active ? (sortDir === "asc" ? ", ascending" : ", descending") : ""}`}
                    >
                      <StatTooltip nestable stat={col.label}>
                        {col.label}
                      </StatTooltip>
                      <span aria-hidden>{arrow}</span>
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground"
                >
                  No players match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((player) => (
                <TableRow key={`${player.playerId}-${player.season}`}>
                  <TableCell>
                    <Link
                      href={`/players/${player.playerId}?season=${player.season}`}
                      className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <PlayerHeadshot
                        playerId={player.playerId}
                        name={player.playerName}
                        size="xs"
                      />
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span>{player.playerName}</span>
                        {player.position ? (
                          <span className="text-xs font-normal text-muted-foreground">
                            {player.position}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={teamHref(player.teamId)}
                      className="font-mono text-xs uppercase underline-offset-4 hover:underline"
                      title={`View ${player.teamName} only`}
                    >
                      {nbaTeamAbbr(player.teamId, player.teamAbbreviation)}
                    </Link>
                  </TableCell>
                  {columns.slice(2).map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        "tabular-nums",
                        col.numeric && "text-right"
                      )}
                    >
                      {col.format(player)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            onClick={() => setVisibleCount((n) => n + pageSize)}
          >
            Show more ({rows.length - visibleCount} remaining)
          </button>
        </div>
      ) : null}
    </section>
  );
}
