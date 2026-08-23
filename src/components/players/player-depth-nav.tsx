"use client";

/**
 * Exact Hannah depth-nav frontend (underline tablist),
 * extended to P18's seven-tab universe via `view=` URL semantics.
 */
import { TransitionLink } from "@/components/continuity/query-nav";
import { usePlayerViewSeason } from "@/components/players/player-view-season";
import { type } from "@/lib/design-system";
import {
  playerHref,
  playerPageNavViews,
  type PlayerPageCapabilities,
  type PlayerPageView,
} from "@/lib/player-page-contract";
import type { ThemeMode } from "@/themes/era-theme";
import { cn } from "@/lib/utils";

export function PlayerDepthNav({
  playerId,
  season,
  view,
  caps,
  fromHistory = false,
  themeMode = "historical",
}: {
  playerId: string;
  season: string;
  view: PlayerPageView;
  caps: PlayerPageCapabilities;
  /** @deprecated Season type lives on Statistics / Career boards. */
  seasonType?: string;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
}) {
  const viewSeason = usePlayerViewSeason(season);
  const tabs = playerPageNavViews(caps);

  return (
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
            prefetch={tab.id === "games"}
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
  );
}
