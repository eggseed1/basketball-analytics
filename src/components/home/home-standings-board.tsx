"use client";

import { useState } from "react";

import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
import type { StandingRow } from "@/data/types";
import { cn } from "@/lib/utils";

export function HomeStandingsBoard({
  season,
  east,
  west,
  race = false,
}: {
  season: string;
  east: StandingRow[];
  west: StandingRow[];
  /** Playoff race framing: seed cut lines and a play-in note. */
  race?: boolean;
}) {
  const [conference, setConference] = useState<"east" | "west">("west");
  const rows = conference === "west" ? west : east;

  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <h2 className="type-heading">{race ? `${season} playoff race` : `${season} Standings`}</h2>
            {race ? (
              <p className="type-body-sm mt-1 text-muted-foreground">
                Seeds 1 to 6 make the playoffs. Seeds 7 to 10 go to the play-in.
              </p>
            ) : null}
          </div>
          <div className="flex gap-1">
            {(
              [
                ["east", "East"],
                ["west", "West"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setConference(id)}
                className={cn(
                  "glass-pill rounded-md px-2.5 py-1 type-caption font-semibold transition-colors",
                  conference === id
                    ? "glass-pill-active"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <StandingsConferenceTable
        title={conference === "west" ? "West" : "East"}
        rows={rows}
        compact
        seedLines={race}
      />
    </section>
  );
}
