"use client";

import { useEffect, useState } from "react";

import { PlayerCareerBoard } from "@/components/players/player-career-board";
import { PlayerBoardSkeleton } from "@/components/players/player-page-skeletons";
import type { PlayerSeason } from "@/data/types";
import {
  filterCareerBoardSource,
  pickCareerCompareSeason,
  toCareerBoardRows,
} from "@/lib/career-board-rows";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import type { ThemeMode } from "@/themes/era-theme";

/**
 * Overview career board — loads seasons on the client so first HTML does not
 * embed CareerBoardRow[] (same pattern as PlayerComparisonsBoard).
 */
export function PlayerOverviewCareerClient({
  playerId,
  season,
  seasonType,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
}) {
  const [rows, setRows] = useState<ReturnType<typeof toCareerBoardRows> | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/players/${encodeURIComponent(playerId)}/seasons`,
          { signal: ac.signal }
        );
        if (!res.ok) throw new Error(`seasons ${res.status}`);
        const json = (await res.json()) as { data?: PlayerSeason[] };
        const career = Array.isArray(json.data) ? json.data : [];
        if (cancelled) return;
        setRows(toCareerBoardRows(filterCareerBoardSource(career)));
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [playerId]);

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
      chart="seasons"
      initialMetric={preferDarko}
      showFilters
    />
  );
}
