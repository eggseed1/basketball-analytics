"use client";

import type { ReactNode } from "react";

import { useLiveScoreboardRefresh } from "@/components/sports/use-live-scoreboard-refresh";
import type { GameSummary } from "@/data/types";

/**
 * Single scoreboard refresh controller. Existing callers use the render-prop
 * form; static children are also supported so wrapper composition does not
 * force a second refresh controller.
 */
export function LiveScoreboardScope({
  games: initialGames = [],
  season,
  enabled = true,
  children,
}: {
  games?: GameSummary[];
  season?: string;
  enabled?: boolean;
  children: ReactNode | ((games: GameSummary[]) => ReactNode);
}) {
  const { games } = useLiveScoreboardRefresh(initialGames, {
    season,
    enabled: enabled && typeof children === "function",
  });
  return <>{typeof children === "function" ? children(games) : children}</>;
}
