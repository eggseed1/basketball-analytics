"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { usePlayerViewSeason } from "@/components/players/player-view-season";
import { type } from "@/lib/design-system";
import {
  playerDepthHref,
  type PlayerDepthTab,
  type PlayerSeasonKind,
} from "@/lib/player-destination";
import type { ThemeMode } from "@/themes/era-theme";
import { cn } from "@/lib/utils";

const TABS: Array<{ id: PlayerDepthTab; label: string }> = [
  { id: "career", label: "Career" },
  { id: "stats", label: "Statistics" },
  { id: "games", label: "Game logs" },
  { id: "viz", label: "Visualizations" },
];

export function PlayerDepthNav({
  playerId,
  season,
  depth,
  seasonType,
  compare,
  fromHistory = false,
  themeMode = "historical",
}: {
  playerId: string;
  season: string;
  depth: PlayerDepthTab;
  seasonType: PlayerSeasonKind;
  compare?: string;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
}) {
  const viewSeason = usePlayerViewSeason(season);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div
        role="tablist"
        aria-label="Player depth"
        className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b-2 border-foreground/70 px-1 py-2"
      >
        {TABS.map((tab) => {
          const selected = tab.id === depth;
          return (
            <TransitionLink
              key={tab.id}
              role="tab"
              aria-selected={selected}
              href={playerDepthHref(playerId, {
                season: viewSeason,
                depth: tab.id,
                seasonType,
                compare,
                fromHistory,
                themeMode,
              })}
              scroll={false}
              className={cn(
                type.bodySm,
                "px-2 py-1 font-bold tracking-tight",
                selected
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </TransitionLink>
          );
        })}
      </div>
      {depth === "games" ? null : (
        <div
          role="group"
          aria-label="Season type"
          className="flex flex-wrap gap-1.5"
        >
          {(
            [
              ["regular", "Regular season"],
              ["playoffs", "Playoffs"],
            ] as const
          ).map(([id, label]) => {
            const selected = id === seasonType;
            return (
              <TransitionLink
                key={id}
                href={playerDepthHref(playerId, {
                  season: viewSeason,
                  depth,
                  seasonType: id,
                  compare,
                  fromHistory,
                  themeMode,
                })}
                scroll={false}
                aria-pressed={selected}
                className={cn(
                  type.caption,
                  "rounded-md px-2.5 py-1 font-semibold",
                  selected
                    ? "bg-foreground text-background"
                    : "bg-white/55 text-foreground hover:bg-white/80"
                )}
              >
                {label}
              </TransitionLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
