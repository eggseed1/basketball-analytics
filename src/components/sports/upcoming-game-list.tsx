"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { GameMatchupRow } from "@/components/sports/game-score-card";
import { LiveScoreboardScope } from "@/components/sports/live-scoreboard-scope";
import type { GameSummary } from "@/data/types";
import { isLiveLikeStatus } from "@/lib/game-status";
import { upcomingCursorFromGames } from "@/lib/upcoming-cursor";

type Cursor = { after: string; afterId: string };

type UpcomingPage = {
  data?: GameSummary[];
  hasMore?: boolean;
  error?: string;
};

function groupByDate(games: GameSummary[]) {
  const map = new Map<string, GameSummary[]>();
  for (const g of games) {
    const list = map.get(g.gameDate) ?? [];
    list.push(g);
    map.set(g.gameDate, list);
  }
  return map;
}

function dayHeading(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function fetchUpcomingPage(
  cursor: Cursor,
  season: string
): Promise<{ games: GameSummary[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    after: cursor.after,
    afterId: cursor.afterId,
    limit: "40",
  });
  if (season) params.set("season", season);
  const res = await fetch(`/api/scores/upcoming?${params.toString()}`, {
    cache: "no-store",
  });
  const body = (await res.json()) as UpcomingPage;
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return {
    games: body.data ?? [],
    hasMore: Boolean(body.hasMore),
  };
}

function ListBoard({ games }: { games: GameSummary[] }) {
  const live = games.filter((g) => isLiveLikeStatus(g.status));
  const upcoming = games.filter((g) => !isLiveLikeStatus(g.status));
  const byDate = groupByDate(upcoming);
  const dates = [...byDate.keys()].sort();

  if (!games.length) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[14px] text-muted-foreground">
        No upcoming NBA games are available yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {live.length ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            Live now
          </h2>
          <div className="flex flex-col gap-1">
            {live.map((game) => (
              <GameMatchupRow key={game.id} game={game} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          Upcoming
        </h2>
        {dates.map((iso) => (
          <div key={iso} className="flex flex-col gap-1.5">
            <h3 className="text-[12px] font-bold tracking-tight text-muted-foreground">
              {dayHeading(iso)}
            </h3>
            <div className="flex flex-col gap-1">
              {(byDate.get(iso) ?? []).map((game) => (
                <GameMatchupRow key={game.id} game={game} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Upcoming scoreboard list - prefetches the next page and appends as you
 * approach the bottom, instead of a full document navigation.
 *
 * `games` is a compatibility alias for the NBA-schedule-first Gamefeed. The
 * canonical prop remains `initialGames` so existing callers are unchanged.
 */
export function UpcomingGameList({
  initialGames,
  games: gamesProp,
  hasMore: initialHasMore,
  season = "",
}: {
  initialGames?: GameSummary[];
  games?: GameSummary[];
  hasMore: boolean;
  season?: string;
}) {
  const seedGames = initialGames ?? gamesProp ?? [];
  const initialKey = seedGames.map((g) => g.id).join(",");
  const [games, setGames] = useState(seedGames);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const prefetchRef = useRef<Promise<{
    games: GameSummary[];
    hasMore: boolean;
  }> | null>(null);
  const cursor = upcomingCursorFromGames(games);

  useEffect(() => {
    setGames(seedGames);
    setHasMore(initialHasMore);
    setError(null);
    prefetchRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity is the id key
  }, [initialKey, initialHasMore]);

  useEffect(() => {
    if (!hasMore || !cursor) return;
    const request = fetchUpcomingPage(cursor, season);
    prefetchRef.current = request;
    void request.catch(() => {
      if (prefetchRef.current === request) prefetchRef.current = null;
    });
  }, [cursor?.after, cursor?.afterId, hasMore, season]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const pending =
        prefetchRef.current ?? fetchUpcomingPage(cursor, season);
      prefetchRef.current = null;
      const page = await pending;
      const seen = new Set(games.map((g) => g.id));
      const extra = page.games.filter((g) => !seen.has(g.id));
      if (!extra.length) {
        setHasMore(false);
        return;
      }
      setGames((prev) => [...prev, ...extra]);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more games");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, games, hasMore, season]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "900px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="flex flex-col gap-4">
      <LiveScoreboardScope games={games} season={season}>
        {(liveGames) => (
          <>
            <ListBoard games={liveGames} />
            {hasMore ? <div ref={sentinelRef} aria-hidden className="h-1" /> : null}
            {loading ? (
              <p className="text-center text-[12px] text-muted-foreground">
                Loading more games…
              </p>
            ) : null}
            {error ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                className="self-center rounded-md bg-secondary px-4 py-2 text-[14px] font-semibold hover:bg-secondary/80"
              >
                Couldn’t load more - try again
              </button>
            ) : null}
            {liveGames.length ? (
              <p className="text-[12px] text-muted-foreground">
                Showing {liveGames.length} upcoming game
                {liveGames.length === 1 ? "" : "s"}
                {hasMore ? " · more appear as you scroll" : ""}
                {" · "}
                live games refresh without reloading
              </p>
            ) : null}
          </>
        )}
      </LiveScoreboardScope>
    </div>
  );
}
