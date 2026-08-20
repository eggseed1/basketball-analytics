"use client";

import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { useRef } from "react";

import {
  formatLeaderboardPercentile,
  type LeaderboardRowContext,
} from "@/analytics/leaderboard-context";
import { cn } from "@/lib/utils";

/** Shared with PlayerIdentity floating policy (PreviewCard) — same Floating UI knobs. */
export const LEADERBOARD_CONTEXT_COLLISION = {
  preferredSide: "bottom" as const,
  align: "start" as const,
  sideOffset: 6,
  collisionPadding: 16,
  positionMethod: "fixed" as const,
  sticky: false as const,
  collisionAvoidance: {
    side: "flip" as const,
    align: "shift" as const,
    fallbackAxisSide: "end" as const,
  },
};

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
          prefetch={false}
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
 * Desktop (sm+): portaled Popover with viewport collision (same Floating UI family as PlayerIdentity).
 * Mobile: trigger only — sibling expanded row in the table renders LeaderboardContextBody.
 */
export function LeaderboardRowContextPanel({
  context,
  open,
  onOpenChange,
  className,
}: {
  context: LeaderboardRowContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  const panelId = `lb-ctx-${context.playerId}`;
  const closingForHiddenRef = useRef(false);

  return (
    <Popover.Root
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
    >
      <div className={cn("inline-flex shrink-0", className)}>
        <Popover.Trigger
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
            // Keep toggle on the button; don't bubble into row/link handlers.
            e.stopPropagation();
          }}
        >
          i
        </Popover.Trigger>
      </div>

      <Popover.Portal>
        <Popover.Positioner
          side={LEADERBOARD_CONTEXT_COLLISION.preferredSide}
          align={LEADERBOARD_CONTEXT_COLLISION.align}
          sideOffset={LEADERBOARD_CONTEXT_COLLISION.sideOffset}
          positionMethod={LEADERBOARD_CONTEXT_COLLISION.positionMethod}
          collisionBoundary="clipping-ancestors"
          collisionPadding={16}
          collisionAvoidance={LEADERBOARD_CONTEXT_COLLISION.collisionAvoidance}
          sticky={LEADERBOARD_CONTEXT_COLLISION.sticky}
          className={(state) => {
            if (state.anchorHidden && open && !closingForHiddenRef.current) {
              closingForHiddenRef.current = true;
              queueMicrotask(() => {
                onOpenChange(false);
                closingForHiddenRef.current = false;
              });
            }
            // Desktop floating only — mobile keeps the inline expanded row.
            return "z-50 hidden outline-none sm:block";
          }}
        >
          <Popover.Popup
            id={panelId}
            role="region"
            aria-label={`${context.playerName} context`}
            className={cn(
              "w-72 max-w-[min(18rem,calc(100vw-1rem))] origin-(--transform-origin) rounded-lg border border-border bg-card px-3 py-3 text-card-foreground shadow-md outline-none",
              "motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0 motion-safe:data-open:zoom-in-95",
              "motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95",
              "motion-safe:data-[side=bottom]:slide-in-from-top-1 motion-safe:data-[side=top]:slide-in-from-bottom-1"
            )}
          >
            <LeaderboardContextBody context={context} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
