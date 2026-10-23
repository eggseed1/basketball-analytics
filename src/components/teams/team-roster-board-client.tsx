"use client";

import { useEffect, useState } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import { PlayerSeasonTable } from "@/components/explore/player-season-table";
import type { ExplorePlayerBoardRow } from "@/data/queries/explore-players-board-pure";
import { type } from "@/lib/design-system";
import type { PlayerSeasonSortKey } from "@/lib/player-season-sort";
import { cn } from "@/lib/utils";

type BoardPayload = {
  rows: ExplorePlayerBoardRow[];
  totalCount: number;
  pageSize: number;
  emptyColumns?: PlayerSeasonSortKey[];
  seasonAwaitingGames?: boolean;
  statsSeason?: string;
  usingPriorSeasonStats?: boolean;
  sortKey?: PlayerSeasonSortKey;
  sortDir?: "asc" | "desc";
};

/**
 * Team roster explore table — fetched client-side so first HTML does not embed
 * up to 60 board rows in Flight.
 */
export function TeamRosterBoardClient({
  teamId,
  season,
  sortKey,
  sortDir,
  rosterPeople,
}: {
  teamId: string;
  season: string;
  sortKey: PlayerSeasonSortKey;
  sortDir: "asc" | "desc";
  /** Full current roster; used for “no prior stats” footnote when board falls back. */
  rosterPeople?: Array<{ playerId: string; name: string }> | null;
}) {
  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const params = new URLSearchParams({
      season,
      team: teamId,
      sort: sortKey,
      dir: sortDir,
      page: "1",
      pageSize: "60",
      minimumMinutes: "0",
      minimumGames: "0",
      view: "all",
    });
    (async () => {
      try {
        const res = await fetch(`/api/explore/players/board?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`board ${res.status}`);
        const json = (await res.json()) as BoardPayload;
        if (!cancelled) setBoard(json);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [teamId, season, sortKey, sortDir]);

  if (error) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        Roster board could not load. Try refreshing.
      </p>
    );
  }

  if (!board) {
    return (
      <div
        className="min-h-[16rem] animate-pulse rounded-xl border border-border bg-secondary/40"
        aria-busy="true"
        aria-label="Loading roster board"
      />
    );
  }

  if (board.totalCount === 0) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No roster rows available for {season}.
      </p>
    );
  }

  const present = new Set(board.rows.map((row) => row.playerId));
  const missing =
    board.usingPriorSeasonStats && rosterPeople?.length
      ? rosterPeople.filter((p) => !present.has(p.playerId))
      : null;
  const statsSeason = board.statsSeason ?? season;

  return (
    <>
      <PlayerSeasonTable
        players={board.rows}
        season={season}
        totalCount={board.totalCount}
        pageSize={board.pageSize}
        pageCount={1}
        sortKey={board.sortKey ?? sortKey}
        sortDir={board.sortDir ?? sortDir}
        emptyColumns={board.emptyColumns ?? []}
        seasonAwaitingGames={board.seasonAwaitingGames ?? false}
      />
      {missing?.length ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Also on the roster, with no {statsSeason} NBA stats:{" "}
          {missing.map((p, i) => (
            <span key={p.playerId}>
              {i ? ", " : null}
              <TransitionLink
                href={`/players/${p.playerId}`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {p.name}
              </TransitionLink>
            </span>
          ))}
          .
        </p>
      ) : null}
    </>
  );
}
