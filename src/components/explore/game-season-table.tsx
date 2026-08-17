"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { useMemo, useState, type CSSProperties } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
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
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { GameSummary } from "@/data/types";
import { formatNumber } from "@/lib/format";
import { gameSideBrandKey, gameSideDisplayName } from "@/lib/game-team-identity";
import { resolveTeamBrand } from "@/lib/nba-brand";

export interface GameSeasonTableProps {
  games: GameSummary[];
}

type SortKey = "gameDate" | "matchup" | "totalPoints" | "margin";

function matchupLabel(game: GameSummary): string {
  const away = gameSideBrandKey(game, "away");
  const home = gameSideBrandKey(game, "home");
  return `${away} @ ${home}`;
}

function defaultDir(key: SortKey): "asc" | "desc" {
  if (key === "matchup") return "asc";
  return "desc";
}

export function GameSeasonTable({ games }: GameSeasonTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("gameDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "gameDate") {
        cmp = a.gameDate.localeCompare(b.gameDate);
      } else if (sortKey === "matchup") {
        cmp = matchupLabel(a).localeCompare(matchupLabel(b));
      } else if (sortKey === "totalPoints") {
        cmp = (a.totalPoints ?? -1) - (b.totalPoints ?? -1);
      } else {
        cmp = Math.abs(a.margin ?? -1) - Math.abs(b.margin ?? -1);
      }
      if (cmp === 0) cmp = b.gameDate.localeCompare(a.gameDate);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [games, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultDir(key));
  };

  return (
    <section
      aria-labelledby="game-table-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="game-table-heading"
            className="font-bold tracking-tight text-xl"
          >
            Game table
          </h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} game{rows.length === 1 ? "" : "s"} · click a column to
            sort
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

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table container={false}>
          <TableHeader className="sticky top-0 z-20 bg-card">
            <TableRow className="hover:bg-transparent">
              <SortableTableHead
                active={sortKey === "gameDate"}
                dir={sortDir}
                onClick={() => toggleSort("gameDate")}
                align="left"
              >
                Date
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "matchup"}
                dir={sortDir}
                onClick={() => toggleSort("matchup")}
                align="left"
              >
                Matchup
              </SortableTableHead>
              <TableHead className="h-10 px-2 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Score
              </TableHead>
              <SortableTableHead
                active={sortKey === "totalPoints"}
                dir={sortDir}
                onClick={() => toggleSort("totalPoints")}
              >
                Total
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "margin"}
                dir={sortDir}
                onClick={() => toggleSort("margin")}
              >
                Margin
              </SortableTableHead>
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
              rows.map((game) => {
                const awayKey = gameSideBrandKey(game, "away");
                const homeKey = gameSideBrandKey(game, "home");
                const homeBrand = resolveTeamBrand(homeKey);
                return (
                  <TableRow
                    key={game.id}
                    className="team-stripe hover:bg-muted/40"
                    style={
                      {
                        "--team-primary":
                          homeBrand?.primary ?? "var(--primary)",
                      } as CSSProperties
                    }
                  >
                    <TableCell className="tabular-nums">
                      <TransitionLink
                        href={`/games/${game.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {game.gameDate}
                      </TransitionLink>
                    </TableCell>
                    <TableCell>
                      <TransitionLink
                        href={`/games/${game.id}`}
                        className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="inline-flex items-center gap-1">
                          <TeamLogo teamKey={awayKey} size="xs" />
                          <span className="text-xs font-semibold uppercase">
                            {awayKey}
                          </span>
                        </span>
                        <span className="text-muted-foreground">@</span>
                        <span className="inline-flex items-center gap-1">
                          <TeamLogo teamKey={homeKey} size="xs" />
                          <span className="text-xs font-semibold uppercase">
                            {homeKey}
                          </span>
                        </span>
                      </TransitionLink>
                      <span className="sr-only">
                        {matchupLabel(game)} - {gameSideDisplayName(game, "away")}{" "}
                        at {gameSideDisplayName(game, "home")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {game.awayScore != null && game.homeScore != null
                        ? `${game.awayScore}-${game.homeScore}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {game.totalPoints != null
                        ? formatNumber(game.totalPoints)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {game.margin != null ? formatNumber(game.margin) : "-"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
