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
import type { GameSummary } from "@/data/types";
import { formatNumber } from "@/lib/format";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";

export interface GameSeasonTableProps {
  games: GameSummary[];
}

function matchupLabel(game: GameSummary): string {
  const away = nbaTeamAbbr(game.awayTeamId, game.awayTeamAbbr);
  const home = nbaTeamAbbr(game.homeTeamId, game.homeTeamAbbr);
  return `${away} @ ${home}`;
}

export function GameSeasonTable({ games }: GameSeasonTableProps) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? games.filter((g) => {
          const hay = [
            g.homeTeamAbbr,
            g.awayTeamAbbr,
            g.homeTeamName,
            g.awayTeamName,
            g.homeTeamId,
            g.awayTeamId,
            g.gameDate,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        })
      : games;

    return [...filtered].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  }, [games, query]);

  return (
    <section
      aria-labelledby="game-table-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="game-table-heading" className="text-lg font-semibold">
            Game table
          </h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} game{rows.length === 1 ? "" : "s"} shown. Same
            filtered set as the chart.
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          <Label htmlFor="game-table-search">Find in table</Label>
          <Input
            id="game-table-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Team or date"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Matchup</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No games match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((game) => (
                <TableRow key={game.id}>
                  <TableCell className="tabular-nums">{game.gameDate}</TableCell>
                  <TableCell>
                    <Link
                      href={`/games/${game.id}`}
                      className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {matchupLabel(game)}
                    </Link>
                    <span className="sr-only">
                      {game.awayTeamName} at {game.homeTeamName}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {game.awayScore}–{game.homeScore}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(game.totalPoints)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {game.margin > 0 ? "+" : ""}
                    {formatNumber(game.margin)}
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
