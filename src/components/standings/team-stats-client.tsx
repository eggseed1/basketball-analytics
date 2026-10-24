"use client";

import { useEffect, useState } from "react";

import { TeamSeasonTable } from "@/components/explore/team-season-table";
import type { TeamSeasonStats } from "@/data/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Standings team-stats table — client fetch so ~30 team rows stay out of first HTML.
 */
export function TeamStatsClient({ season }: { season: string }) {
  const [teams, setTeams] = useState<TeamSeasonStats[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/standings/team-stats?season=${encodeURIComponent(season)}`,
          { signal: ac.signal }
        );
        if (!res.ok) throw new Error(`team-stats ${res.status}`);
        const json = (await res.json()) as { data?: TeamSeasonStats[] };
        if (!cancelled) setTeams(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [season]);

  if (error) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        Team stats could not load. Try refreshing.
      </p>
    );
  }

  if (teams == null) {
    return (
      <div
        className="h-72 animate-pulse rounded-xl bg-secondary"
        aria-busy="true"
        aria-label="Loading team stats"
      />
    );
  }

  if (!teams.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No team stats for {season}.
      </p>
    );
  }

  return <TeamSeasonTable teams={teams} />;
}
