"use client";

import Link from "next/link";

import {
  formatBoxScorePercentile,
  primaryBoxScoreLine,
  type BoxScorePlayerContext,
  type BoxScoreStatLine,
} from "@/analytics/box-score-context";
import { cn } from "@/lib/utils";

function LineDetail({ line }: { line: BoxScoreStatLine }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-border/60 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold">{line.label}</span>
        <span className="text-[13px] font-bold tabular-nums">
          {line.gameDisplay}
        </span>
      </div>
      {line.seasonAvgDisplay ? (
        <p className="text-[11px] text-muted-foreground">
          Season avg {line.seasonAvgDisplay}
          {line.vsSeasonDisplay ? (
            <span className="font-semibold text-foreground">
              {" "}
              · {line.vsSeasonDisplay}
            </span>
          ) : null}
        </p>
      ) : null}
      {line.playerGamePercentile != null ? (
        <p className="text-[11px] text-muted-foreground">
          {formatBoxScorePercentile(line.playerGamePercentile)} of this
          player&apos;s games
          {line.playerGameSampleSize != null
            ? ` (${line.playerGameSampleSize} games)`
            : ""}
        </p>
      ) : null}
      {line.inGameRank != null && line.inGamePoolSize != null ? (
        <p className="text-[11px] text-muted-foreground">
          #{line.inGameRank} of {line.inGamePoolSize} in this game
          {line.inGamePercentile != null
            ? ` · ${formatBoxScorePercentile(line.inGamePercentile)} among players who played`
            : ""}
        </p>
      ) : null}
    </li>
  );
}

export function BoxScoreContextBody({
  context,
  className,
}: {
  context: BoxScorePlayerContext;
  className?: string;
}) {
  const primary = primaryBoxScoreLine(context);
  return (
    <div className={cn("text-left", className)}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Box-score context · {context.season}
      </p>
      <p className="mt-1 text-[14px] font-semibold tracking-tight">
        {context.playerName}
      </p>
      {primary ? (
        <>
          <p className="text-[20px] font-bold tabular-nums leading-tight">
            {primary.gameDisplay} {primary.label.toLowerCase()}
          </p>
          {primary.vsSeasonDisplay ? (
            <p className="text-[12px] text-muted-foreground">
              {primary.vsSeasonDisplay} vs season average
              {primary.seasonAvgDisplay ? ` (${primary.seasonAvgDisplay})` : ""}
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              {context.limitedReason ??
                "Season average unavailable for this player."}
            </p>
          )}
        </>
      ) : null}

      <ul className="mt-2 flex flex-col">
        {context.lines.map((line) => (
          <LineDetail key={line.id} line={line} />
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap gap-3 border-t border-border pt-2">
        <Link
          href={context.playerHref}
          className="text-[12px] font-semibold underline-offset-2 hover:underline"
        >
          View player →
        </Link>
        <span className="text-[11px] text-muted-foreground">
          Game percentile = among players who played · Season avg = board
          totals ÷ GP
        </span>
      </div>
    </div>
  );
}

/**
 * Compact accessible Level-2 context for a box-score row.
 * Keyboard + tap friendly — not hover-only.
 */
export function BoxScoreStatContextPanel({
  context,
  open,
  onToggle,
  className,
}: {
  context: BoxScorePlayerContext;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const panelId = `box-ctx-${context.playerId}`;
  const primary = primaryBoxScoreLine(context);
  const hasSeasonDelta = primary?.vsSeasonDisplay != null;

  return (
    <div className={cn("relative inline-flex", className)}>
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
        aria-label={`Analytical context for ${context.playerName}${
          hasSeasonDelta && primary?.vsSeasonDisplay
            ? ` (${primary.vsSeasonDisplay} vs season)`
            : ""
        }`}
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
          aria-label={`${context.playerName} box-score context`}
          className="absolute left-0 top-full z-30 mt-1 hidden w-72 rounded-md border border-border bg-card px-3 py-3 shadow-sm sm:block"
        >
          <BoxScoreContextBody context={context} />
        </div>
      ) : null}
    </div>
  );
}
