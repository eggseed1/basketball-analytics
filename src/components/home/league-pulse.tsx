"use client";

import Link from "next/link";
import { useState } from "react";

import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
import type { StandingRow } from "@/data/types";

/** Compact East/West pulse for the player-first homepage. */
export function LeaguePulse({
  east,
  west,
}: {
  east: StandingRow[];
  west: StandingRow[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (!east.length && !west.length) return null;

  const eastRows = expanded ? east : east.slice(0, 8);
  const westRows = expanded ? west : west.slice(0, 8);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">League</h2>
          <p className="text-[14px] text-muted-foreground">
            Conference race at a glance - expand here or open the full boards.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-semibold"
          >
            {expanded ? "Show top 8" : "Expand all"}
          </button>
          <Link
            href="/standings"
            className="rounded-md bg-foreground px-3 py-1.5 text-[14px] font-semibold text-background"
          >
            Full standings
          </Link>
          <Link
            href="/explore/teams"
            className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-semibold"
          >
            Team advanced
          </Link>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <StandingsConferenceTable
          title={expanded ? "Eastern Conference" : "East · top 8"}
          rows={eastRows}
          compact={!expanded}
        />
        <StandingsConferenceTable
          title={expanded ? "Western Conference" : "West · top 8"}
          rows={westRows}
          compact={!expanded}
        />
      </div>
    </section>
  );
}
