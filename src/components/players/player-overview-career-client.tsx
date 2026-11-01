"use client";

import { useEffect, useState } from "react";

import { PlayerCareerBoard } from "@/components/players/player-career-board";
import { PlayerBoardSkeleton } from "@/components/players/player-page-skeletons";
import {
  filterCareerBoardSource,
  pickCareerCompareSeason,
  toCareerBoardRows,
} from "@/lib/career-board-rows";
import { fetchPlayerCareerSeasons } from "@/lib/fetch-player-career-seasons";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import type { ThemeMode } from "@/themes/era-theme";

/**
 * Overview career board — loads seasons on the client so first HTML does not
 * embed CareerBoardRow[] when SSR did not already supply them.
 */
export function PlayerOverviewCareerClient({
  playerId,
  season,
  seasonType,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
  initialRows = null,
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
  /** SSR rows when the page already paid for career; skips the first fetch. */
  initialRows?: ReturnType<typeof toCareerBoardRows> | null;
}) {
  const [fetched, setFetched] = useState<{ playerId: string; rows: ReturnType<typeof toCareerBoardRows> } | null>(null);
  const rows = initialRows && initialRows.length > 0 ? initialRows
    : fetched?.playerId === playerId ? fetched.rows : null;

  useEffect(() => {
    if (initialRows && initialRows.length > 0) {
      return;
    }

    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        const career = await fetchPlayerCareerSeasons(playerId, {
          signal: ac.signal,
        });
        if (cancelled) return;
        setFetched({ playerId, rows: toCareerBoardRows(filterCareerBoardSource(career)) });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setFetched({ playerId, rows: [] });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [playerId, initialRows]);

  if (rows == null) {
    return <PlayerBoardSkeleton context="section-chart" />;
  }

  if (!rows.length) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No career seasons available yet.
      </p>
    );
  }

  const seasons = rows.map((row) => row.season);
  const compare = pickCareerCompareSeason(seasons, season);
  const preferDarko = rows.some((row) => row.darko != null) ? "darko" : undefined;

  return (
    <PlayerCareerBoard
      playerId={playerId}
      season={season}
      seasonType={seasonType}
      rows={rows}
      compareSeason={compare}
      teamKey={teamKey}
      fromHistory={fromHistory}
      themeMode={themeMode}
      chart="games"
      initialMetric={preferDarko}
      showFilters
    />
  );
}
