"use client";

import type { ReactNode } from "react";

import { useLiveScoreboardRefresh } from "@/components/sports/use-live-scoreboard-refresh";
import type { GameSummary } from "@/data/types";

/**
 * Single scoreboard refresh controller - render-prop so list/week/home share one timer.
 */
export function LiveScoreboardScope({
  games: initialGames,
  season,
  enabled = true,
  children,
}: {
  games: GameSummary[];
  season?: string;
  enabled?: boolean;
  children: (games: GameSummary[]) => ReactNode;
}) {
  const { games } = useLiveScoreboardRefresh(initialGames, {
    season,
    enabled,
  });
  return <>{children(games)}</>;
}
