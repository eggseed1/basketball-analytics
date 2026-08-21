"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { usePlayerViewSeason } from "@/components/players/player-view-season";
import { type } from "@/lib/design-system";
import {
  playerHref,
  playerPageNavViews,
  type PlayerPageCapabilities,
  type PlayerPageView,
} from "@/lib/player-page-contract";
import type { PlayerSeasonKind } from "@/lib/player-destination";
import type { ThemeMode } from "@/themes/era-theme";
import { cn } from "@/lib/utils";

/**
 * Exact Hannah depth-nav frontend (underline tablist + season-type chips),
 * extended to P18's seven-tab universe via `view=` URL semantics.
 */
export function PlayerDepthNav({
  playerId,
  season,
  view,
  caps,
  seasonType = "regular",
  fromHistory = false,
  themeMode = "historical",
}: {
  playerId: string;
  season: string;
  view: PlayerPageView;
  caps: PlayerPageCapabilities;
  seasonType?: PlayerSeasonKind;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
}) {
  const viewSeason = usePlayerViewSeason(season);
  const tabs = playerPageNavViews(caps);
  const showSeasonType = view === "career" || view === "shooting";
  const hrefView = view === "overview" ? undefined : view;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div
        role="tablist"
        aria-label="Player statistics views"
        className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b-2 border-foreground/70 px-1 py-2"
      >
        {tabs.map((tab) => {
          const selected = tab.id === view;
          return (
            <TransitionLink
              key={tab.id}
              role="tab"
              aria-selected={selected}
              href={playerHref({
                playerId,
                season: viewSeason,
                view: tab.id === "overview" ? undefined : tab.id,
                fromHistory,
                themeMode:
                  themeMode === "modern" ? "modern" : "historical",
              })}
              scroll={false}
              prefetch={false}
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
      {showSeasonType ? (
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
                href={playerHref({
                  playerId,
                  season: viewSeason,
                  view: hrefView,
                  fromHistory,
                  themeMode:
                    themeMode === "modern" ? "modern" : "historical",
                })}
                scroll={false}
                prefetch={false}
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
      ) : null}
    </div>
  );
}
