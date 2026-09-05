"use client";

import Link from "next/link";
import { useState } from "react";

import type { PlayerEvolutionResult } from "@/analytics";
import { TeamWashCard } from "@/components/brand/team-wash-card";
import { cn } from "@/lib/utils";

/**
 * Progressive "What changed?" surface for player YoY evolution.
 */
export function PlayerEvolutionPanel({
  evolution,
  compareHref,
  teamKey,
}: {
  evolution: PlayerEvolutionResult;
  playerId?: string;
  compareHref?: string;
  teamKey?: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? evolution.changes : evolution.topChanges;
  const finding = evolution.finding;

  return (
    <TeamWashCard teamKey={teamKey} className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">What changed?</h2>
          <p className="text-[14px] text-muted-foreground">
            {evolution.priorSeason} → {evolution.currentSeason}
          </p>
        </div>
        {compareHref ? (
          <Link
            href={compareHref}
            className="text-[14px] font-semibold underline-offset-4 hover:underline"
          >
            Compare seasons →
          </Link>
        ) : null}
      </div>

      {finding ? (
        <div className="rounded-md frost-surface px-3 py-3">
          <p className="text-[16px] font-semibold tracking-tight">
            {finding.title}
          </p>
        </div>
      ) : null}

      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((change) => (
            <li
              key={change.id}
              className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-semibold">{change.label}</p>
                <p className="text-[12px] text-muted-foreground">
                  {change.fromDisplay} → {change.toDisplay}
                </p>
              </div>
              <p
                className={cn(
                  "shrink-0 text-[14px] font-bold tabular-nums",
                  change.direction === "up" && "text-delta-up",
                  change.direction === "down" && "text-delta-down"
                )}
              >
                {change.deltaDisplay}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted-foreground">
          No meaningful season-to-season deltas cleared the noise filter yet.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {evolution.changes.length > evolution.topChanges.length ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-md frost-surface px-3 py-1.5 text-[14px] font-semibold"
          >
            {showAll ? "Show biggest changes" : "See all changes"}
          </button>
        ) : null}
      </div>
    </TeamWashCard>
  );
}
