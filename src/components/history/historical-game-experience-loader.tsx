"use client";

import { useEffect, useState } from "react";

import { HistoricalGameExperience } from "@/components/history/historical-game-experience";
import type { HistoricalGameArtifact } from "@/data/history/types";
import type { GameShotEvent } from "@/lib/shots/shot-events";

/**
 * Loads archive shots on the client so Game Lab HTML does not embed the full
 * shot array in RSC/Flight. Artifact (when present) is still SSR'd for copy.
 */
export function HistoricalGameExperienceLoader({
  gameId,
  artifact,
  homeLabel,
  awayLabel,
  missingSummary,
}: {
  gameId: string;
  artifact: HistoricalGameArtifact | null;
  homeLabel: string;
  awayLabel: string;
  missingSummary: string;
}) {
  const [shots, setShots] = useState<GameShotEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/games/${encodeURIComponent(gameId)}/archive-shots`,
          { signal: ac.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          data?: { shots?: GameShotEvent[] };
        };
        if (!cancelled) setShots(json.data?.shots ?? []);
      } catch {
        if (!cancelled) setShots([]);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [gameId]);

  if (shots === null) {
    return (
      <div
        className="h-64 animate-pulse rounded-xl border border-border bg-secondary/40"
        aria-hidden
      />
    );
  }

  if (artifact) {
    return (
      <HistoricalGameExperience
        artifact={{ ...artifact, teamGames: [] as Record<string, unknown>[] }}
        shots={shots}
        homeLabel={homeLabel}
        awayLabel={awayLabel}
      />
    );
  }

  if (shots.length > 0) {
    return <p className="text-[13px] text-muted-foreground">{missingSummary}</p>;
  }

  return null;
}
