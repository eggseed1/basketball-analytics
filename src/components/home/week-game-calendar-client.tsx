"use client";

import { useLayoutEffect, useRef } from "react";
import { HomeGameStripCard } from "@/components/home/home-game-strip-card";
import { AppLink } from "@/components/ui/app-link";
import { sectionLinkClassName } from "@/lib/design-system";
import { LiveScoreboardScope } from "@/components/sports/live-scoreboard-scope";
import type { GameSummary } from "@/data/types";
import { parseTipOffMs } from "@/lib/game-countdown";
import type { GameStatusKind } from "@/lib/game-status";

type StripGame = GameSummary & {
  awayStarters: Array<{ id: string; name: string }>;
  homeStarters: Array<{ id: string; name: string }>;
};

/** Chronological by tip-off, so finals sit to the left of live and upcoming games. */
function orderStrip(games: GameSummary[]): GameSummary[] {
  const tip = (g: GameSummary) => parseTipOffMs(g.tipOffAt) ?? Date.parse(g.gameDate);
  return games
    .map((game, index) => ({ game, index }))
    .sort((a, b) => tip(a.game) - tip(b.game) || a.index - b.index)
    .map((entry) => entry.game);
}

/** First live or upcoming game; the last game when every one is settled. */
function anchorIndex(games: GameSummary[]): number {
  const index = games.findIndex((g) => !isSettledStatus(g.status));
  return index === -1 ? games.length - 1 : index;
}

function isSettledStatus(status: GameStatusKind | undefined): boolean {
  return status === "final" || status === "postponed" || status === "cancelled";
}

function StripScroller({ games }: { games: GameSummary[] }) {
  const ordered = orderStrip(games);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchoredRef = useRef(false);
  const anchor = anchorIndex(ordered);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (anchoredRef.current || !scroller || anchor <= 0) return;
    const card = scroller.children[anchor] as HTMLElement | undefined;
    if (!card) return;
    anchoredRef.current = true;
    const padding = parseFloat(getComputedStyle(scroller).paddingLeft) || 0;
    scroller.scrollLeft +=
      card.getBoundingClientRect().left - scroller.getBoundingClientRect().left - padding;
  }, [anchor]);

  return (
    <div ref={scrollerRef} className="-mx-1 -my-3 flex gap-4 touch-scroll-x px-1 py-3">
      {ordered.map((game) => (
        <HomeGameStripCard key={game.id} game={game} />
      ))}
    </div>
  );
}

/** Client strip - reuses the shared live scoreboard poller (no separate architecture). */
export function WeekGameCalendarClient({
  season,
  mode,
  games: initialGames,
}: {
  season: string;
  mode: "week" | "upcoming";
  games: StripGame[];
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="type-heading min-w-0">
          {mode === "week" ? "This week's games" : "Upcoming games"}
        </h2>
        <AppLink
          href="/scores?view=week"
          className={`type-body-sm shrink-0 ${sectionLinkClassName}`}
        >
          <span className="sm:hidden">Schedule <span data-motion-arrow aria-hidden>→</span></span>
          <span className="hidden sm:inline">See all schedule <span data-motion-arrow aria-hidden>→</span></span>
        </AppLink>
      </div>

      {initialGames.length === 0 ? (
        <div className="type-body-sm rounded-md border border-dashed border-border px-4 py-10 text-center text-muted-foreground">
          No upcoming games on the scoreboard yet.
        </div>
      ) : (
        <LiveScoreboardScope games={initialGames} season={season}>
          {(games) => <StripScroller games={games} />}
        </LiveScoreboardScope>
      )}
    </section>
  );
}
