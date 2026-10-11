"use client";

import { useState, type ReactNode } from "react";

import { useDelayedStatus, useHydrated, useScoreDelaySeconds } from "@/components/sports/use-score-delay";
import { isLiveLikeStatus } from "@/lib/game-status";
import { scoreDelayLabel } from "@/lib/score-delay";

/**
 * Covers the box score, plays and charts while the delayed header is still
 * live. CSS keeps the cover up before hydration when a delay is saved.
 */
export function SpoilerShield({
  gameId,
  risky,
  children,
}: {
  gameId: string;
  /** Live or recently ended when the server rendered the page. */
  risky: boolean;
  children: ReactNode;
}) {
  const delay = useScoreDelaySeconds();
  const hydrated = useHydrated();
  const published = useDelayedStatus(gameId);
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const live = published ? isLiveLikeStatus(published) : risky;
  const on = delay > 0 && live && revealedFor !== gameId;

  return (
    <div
      data-spoiler-shield=""
      data-shield-risky={risky ? "" : undefined}
      data-shield-ready={hydrated ? "" : undefined}
      data-shield-on={on ? "" : undefined}
    >
      <div data-shield-cover className="sports-card flex-col items-start gap-2 p-4 sm:p-5">
        <p className="text-[17px] font-bold tracking-tight">Box score and plays are hidden</p>
        <p className="text-[14px] text-muted-foreground">
          Your score delay is {delay ? scoreDelayLabel(delay) : "on"}. These sections come back when the
          delayed score reaches the final.
        </p>
        <button
          type="button"
          onClick={() => setRevealedFor(gameId)}
          className="mt-1 rounded-md border border-border px-3 py-1.5 text-[14px] font-semibold transition hover:bg-muted"
        >
          Show anyway
        </button>
      </div>
      <div data-shield-body>{children}</div>
    </div>
  );
}
