"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ArcadePlayer } from "@/arcade/league";
import { cdnImageUrl } from "@/lib/cdn-image";
import { espnHeadshotUrl, nbaHeadshotUrl } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function PlayerAvatar({ player, className }: { player: ArcadePlayer; className?: string }) {
  const candidates = [espnHeadshotUrl(player.espnId), nbaHeadshotUrl(player.nbaId)].filter(
    (url): url is string => Boolean(url)
  );
  const [failed, setFailed] = useState<string[]>([]);
  const src = candidates.find((url) => !failed.includes(url));
  const initials = player.name
    .split(/\s+/)
    .filter((part) => /^[A-Za-z]/.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-muted-foreground",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cdnImageUrl(src, 128)}
          alt=""
          className="size-full object-cover object-top"
          onError={() => setFailed((urls) => [...urls, src])}
        />
      ) : (
        <span className="text-[0.95em] font-semibold" aria-hidden>
          {initials}
        </span>
      )}
    </span>
  );
}

export function ArcadeLoading({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <div className="sports-card flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
      {failed ? (
        <>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            The player data did not load.
          </p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : (
        <p className={cn(type.bodySm, "text-muted-foreground")}>Loading 30 seasons of players…</p>
      )}
    </div>
  );
}

/** Best score kept in this browser. Render it only after the league loads, so hydration never sees it. */
export function useBestScore(
  key: string,
  better: "higher" | "lower" = "higher"
): [number | null, (score: number) => void] {
  const [best, setBest] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem(key);
    return stored != null && Number.isFinite(Number(stored)) ? Number(stored) : null;
  });
  return [
    best,
    (score: number) => {
      if (best != null && (better === "higher" ? score <= best : score >= best)) return;
      setBest(score);
      try {
        window.localStorage.setItem(key, String(score));
      } catch {
        // Private mode can refuse storage; the best score just won't persist.
      }
    },
  ];
}
