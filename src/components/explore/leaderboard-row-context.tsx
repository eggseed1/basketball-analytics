"use client";

import Link from "next/link";

import {
  formatLeaderboardPercentile,
  type LeaderboardRowContext,
} from "@/analytics/leaderboard-context";
import { cn } from "@/lib/utils";

/** Shared body for desktop popover + mobile expanded row. */
export function LeaderboardContextBody({
  context,
  className,
}: {
  context: LeaderboardRowContext;
  className?: string;
}) {
  return (
    <div className={cn("text-left", className)}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Player context · {context.season}
      </p>
      <p className="mt-1 text-[15px] font-semibold tracking-tight">
        {context.primary.label}
      </p>
      <p className="text-[20px] font-bold tabular-nums leading-tight">
        {formatLeaderboardPercentile(context.primary.percentile)}
      </p>
      <p className="text-[12px] text-muted-foreground">
        {context.primary.display} · percentile among players on this leaderboard
      </p>

      {context.related.length ? (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-2">
          {context.related.map((line) => (
            <li
              key={line.id}
              className="flex items-baseline justify-between gap-3 text-[12px]"
            >
              <span className="text-muted-foreground">{line.label}</span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatLeaderboardPercentile(line.percentile)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2">
        <Link
          href={context.playerHref}
          className="text-[12px] font-semibold underline-offset-2 hover:underline"
        >
          View player →
        </Link>
        {context.primary.learnHref ? (
          <Link
            href={context.primary.learnHref}
            className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
          >
            What is this?
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Compact accessible Level-2 context for a leaderboard row.
 * Keyboard + tap friendly — not hover-only.
 * Desktop: floating panel. Mobile: sibling expanded row renders the same body.
 */
export function LeaderboardRowContextPanel({
  context,
  open,
  onToggle,
  className,
}: {
  context: LeaderboardRowContext;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const panelId = `lb-ctx-${context.playerId}`;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
          "text-[11px] font-bold text-muted-foreground",
          "hover:bg-secondary hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-secondary text-foreground"
        )}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Analytical context for ${context.playerName}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
      >
        i
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={`${context.playerName} context`}
          className="absolute left-0 top-full z-30 mt-1 hidden w-72 rounded-md border border-border bg-card px-3 py-3 shadow-sm sm:block"
        >
          <LeaderboardContextBody context={context} />
        </div>
      ) : null}
    </div>
  );
}
