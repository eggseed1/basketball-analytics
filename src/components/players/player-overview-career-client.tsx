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

const FETCH_ATTEMPTS = 3;
const RETRY_MS = 600;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = window.setTimeout(() => resolve(), ms);
    const onAbort = () => {
      window.clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Overview career board — loads seasons on the client so first HTML does not
 * embed CareerBoardRow[] (same pattern as PlayerComparisonsBoard).
 *
 * Retries empty / failed responses: the edge career budget can return [] on a
 * cold ESPN hit even when the player has a full career.
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
  const [rows, setRows] = useState<ReturnType<typeof toCareerBoardRows> | null>(
    initialRows && initialRows.length > 0 ? initialRows : null
  );

  useEffect(() => {
    if (initialRows && initialRows.length > 0) {
      setRows(initialRows);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      let lastRows: ReturnType<typeof toCareerBoardRows> = [];
      for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
        try {
          const res = await fetch(
            `/api/players/${encodeURIComponent(playerId)}/seasons`,
            { signal: ac.signal }
          );
          if (!res.ok) throw new Error(`seasons ${res.status}`);
          const json = (await res.json()) as { data?: PlayerSeason[] };
          const career = Array.isArray(json.data) ? json.data : [];
          lastRows = toCareerBoardRows(filterCareerBoardSource(career));
          if (cancelled) return;
          if (lastRows.length > 0) {
            setRows(lastRows);
            return;
          }
        } catch (error) {
          if (cancelled) return;
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        }
        if (attempt < FETCH_ATTEMPTS) {
          try {
            await sleep(RETRY_MS * attempt, ac.signal);
          } catch {
            return;
          }
        }
      }
      if (!cancelled) setRows(lastRows);
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
      chart="seasons"
      initialMetric={preferDarko}
      showFilters
    />
  );
}
