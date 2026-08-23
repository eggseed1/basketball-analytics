"use client";

import type { ReactNode } from "react";

import { PlayerFilterToolbar } from "@/components/explore/player-filter-toolbar";
import { QueryNavProvider } from "@/components/continuity/query-nav";
import type { Team } from "@/data/types";

export function ExplorePlayersClientShell({
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
      <div className="relative flex w-full min-w-0 max-w-full flex-col gap-5">
        <PlayerFilterToolbar
          seasons={seasons}
          teams={teams}
          defaultSeason={defaultSeason}
        />
        <div className="min-w-0 max-w-full">{children}</div>
      </div>
    </QueryNavProvider>
  );
}
