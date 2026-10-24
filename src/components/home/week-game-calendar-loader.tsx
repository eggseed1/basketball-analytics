"use client";

import { useEffect, useState } from "react";

import { WeekGameCalendarClient } from "@/components/home/week-game-calendar-client";
import { ScoreboardFeedNotice } from "@/components/sports/scoreboard-feed-notice";
import type { GameSummary } from "@/data/types";

type StripGame = GameSummary & {
  awayStarters: Array<{ id: string; name: string }>;
  homeStarters: Array<{ id: string; name: string }>;
};

type Payload = {
  mode: "week" | "upcoming";
  games: StripGame[];
  source?: "live-espn" | "cached-espn" | "unavailable";
  warnings?: string[];
};

/**
 * Fetches the week strip after paint so ~10 glass matchup cards are not in
 * first HTML / Flight.
 */
export function WeekGameCalendarLoader({ season }: { season: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/home/week-strip?season=${encodeURIComponent(season)}`,
          { signal: ac.signal }
        );
        if (!res.ok) throw new Error(`week-strip ${res.status}`);
        const json = (await res.json()) as Payload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [season]);

  if (failed) {
    return (
      <div className="flex flex-col gap-2">
        <ScoreboardFeedNotice
          source="unavailable"
          warnings={["Live scores temporarily unavailable."]}
        />
        <WeekGameCalendarClient season={season} mode="week" games={[]} />
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="h-40 animate-pulse rounded-xl bg-secondary/50"
        aria-busy="true"
        aria-label="Loading week games"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ScoreboardFeedNotice
        source={data.source}
        warnings={data.warnings ?? []}
      />
      <WeekGameCalendarClient
        season={season}
        mode={data.mode}
        games={data.games}
      />
    </div>
  );
}
