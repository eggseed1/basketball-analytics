"use client";

import { useEffect, useState } from "react";

import { HomeStandingsBoard } from "@/components/home/home-standings-board";
import type { HomeStandingSlim } from "@/lib/home-standings-slim";

type Payload = {
  season: string;
  requestSeason: string;
  east: HomeStandingSlim[];
  west: HomeStandingSlim[];
};

/**
 * Home standings / playoff-race cards — client fetch so slim rows stay out of
 * first HTML (both desk modules share one cached response).
 */
export function HomeStandingsClient({
  season,
  race = false,
}: {
  season: string;
  race?: boolean;
}) {
  const [board, setBoard] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/home/standings?season=${encodeURIComponent(season)}`,
          { signal: ac.signal }
        );
        if (!res.ok) throw new Error(`standings ${res.status}`);
        const json = (await res.json()) as Payload;
        if (!cancelled) setBoard(json);
      } catch {
        if (!cancelled) setBoard(null);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [season]);

  if (!board) {
    return (
      <div
        className="sports-card h-64 animate-pulse p-4"
        aria-busy="true"
        aria-label={race ? "Loading playoff race" : "Loading standings"}
      />
    );
  }

  if (!board.east.length && !board.west.length) return null;

  const shown = race ? 10 : 8;
  return (
    <HomeStandingsBoard
      season={board.season}
      east={board.east.slice(0, shown)}
      west={board.west.slice(0, shown)}
      race={race && board.season === board.requestSeason}
    />
  );
}
