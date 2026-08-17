"use client";

import type { ReactNode } from "react";

import { QueryNavProvider } from "@/components/continuity/query-nav";
import { GameFilterToolbar } from "@/components/explore/game-filter-toolbar";
import type { Team } from "@/data/types";

export function ExploreGamesClientShell({
  seasons,
  teams,
  defaultSeason,
  children,
}: {
  seasons: string[];
  teams: Team[];
  defaultSeason: string;
  children: ReactNode;
}) {
  return (
    <QueryNavProvider>
      <GameFilterToolbar
        seasons={seasons}
        teams={teams}
        defaultSeason={defaultSeason}
      />
      <div className="query-updating-content flex flex-col gap-5">
        {children}
      </div>
    </QueryNavProvider>
  );
}
