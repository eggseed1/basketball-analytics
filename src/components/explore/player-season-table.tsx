"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
import type { PlayerSeason } from "@/data/types";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";

export interface PlayerSeasonTableProps {
  players: PlayerSeason[];
}

type SortKey =
  | "playerName"
  | "teamName"
  | "usagePct"
  | "trueShootingPct"
  | "minutes"
  | "gamesPlayed"
  | "points";

export function PlayerSeasonTable({ players }: PlayerSeasonTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("usagePct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? players.filter(
          (p) =>
            p.playerName.toLowerCase().includes(needle) ||
            p.teamName.toLowerCase().includes(needle) ||
            p.teamId.toLowerCase().includes(needle)
        )
      : players;

    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });

    return sorted;
  }, [players, query, sortDir, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "playerName" || key === "teamName" ? "asc" : "desc");
    }
  }

  function sortLabel(key: SortKey, label: string) {
    const active = sortKey === key;
    return `${label}${active ? (sortDir === "asc" ? " ascending" : " descending") : ""}`;
  }

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
            {rows.length} player{rows.length === 1 ? "" : "s"} shown. Same
            filtered set as the chart.
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
              <TableHead>
                <button
                  type="button"
                  className="font-medium"
                  onClick={() => toggleSort("playerName")}
                  aria-label={sortLabel("playerName", "Sort by player")}
                >
                  Player
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="font-medium"
                  onClick={() => toggleSort("teamName")}
                  aria-label={sortLabel("teamName", "Sort by team")}
                >
                  Team
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  className="font-medium"
                  onClick={() => toggleSort("usagePct")}
                  aria-label={sortLabel("usagePct", "Sort by usage percent")}
                >
                  Usage %
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  className="font-medium"
                  onClick={() => toggleSort("trueShootingPct")}
                  aria-label={sortLabel(
                    "trueShootingPct",
                    "Sort by true shooting percent"
                  )}
                >
                  TS %
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  className="font-medium"
                  onClick={() => toggleSort("minutes")}
                  aria-label={sortLabel("minutes", "Sort by minutes")}
                >
                  Minutes
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  className="font-medium"
                  onClick={() => toggleSort("gamesPlayed")}
                  aria-label={sortLabel("gamesPlayed", "Sort by games")}
                >
                  GP
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  className="font-medium"
                  onClick={() => toggleSort("points")}
                  aria-label={sortLabel("points", "Sort by points")}
                >
                  PTS
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No players match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((player) => (
                <TableRow key={`${player.playerId}-${player.season}`}>
                  <TableCell>
                    <Link
                      href={`/players/${player.playerId}`}
                      className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {player.playerName}
                    </Link>
                    {player.position ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {player.position}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs uppercase">
                      {player.teamId}
                    </span>
                    <span className="sr-only"> {player.teamName}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPct(player.usagePct)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPct(player.trueShootingPct)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinutes(player.minutes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(player.gamesPlayed)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(player.points)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
