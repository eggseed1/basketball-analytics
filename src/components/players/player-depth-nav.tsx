import { TransitionLink } from "@/components/continuity/query-nav";

import {
  playerHref,
  playerPageNavViews,
  type PlayerPageCapabilities,
  type PlayerPageView,
} from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

/** URL-addressable deep-stat nav — no dead tabs. */
export function PlayerDepthNav({
  playerId,
  season,
  view,
  caps,
  fromHistory,
  themeMode,
}: {
  playerId: string;
  season: string;
  view: PlayerPageView;
  caps: PlayerPageCapabilities;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
}) {
  const items = playerPageNavViews(caps);
  return (
    <nav
      aria-label="Player statistics views"
      className="sticky top-0 z-20 -mx-1 border-b border-border/80 bg-background/90 px-1 py-2 backdrop-blur-md"
    >
      <ul className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = item.id === view;
          return (
            <li key={item.id} className="shrink-0">
              <TransitionLink
                href={playerHref({
                  playerId,
                  season,
                  view: item.id === "overview" ? undefined : item.id,
                  fromHistory,
                  themeMode,
                })}
                scroll={false}
                prefetch={false}
                className={cn(
                  "inline-flex rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "bg-secondary/70 text-muted-foreground hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </TransitionLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
