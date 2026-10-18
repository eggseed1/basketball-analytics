"use client";

import { useState } from "react";

import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import type { StandingRow } from "@/data/types";

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
    <section className="sports-card flex flex-col gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 className="type-heading">{race ? `${season} playoff race` : `${season} Standings`}</h2>
          {race ? (
            <p className="type-caption mt-1 text-muted-foreground">
              Seeds 1 to 6 make the playoffs. Seeds 7 to 10 go to the play-in.
            </p>
          ) : null}
        </div>
        <ChoiceTrack className="w-fit">
          {(
            [
              ["east", "East"],
              ["west", "West"],
            ] as const
          ).map(([id, label]) => (
            <ChoiceChip
              key={id}
              active={conference === id}
              onClick={() => setConference(id)}
            >
              {label}
            </ChoiceChip>
          ))}
        </ChoiceTrack>
      </div>
      <StandingsConferenceTable
        title={conference === "west" ? "West" : "East"}
        rows={rows}
        compact
        seedLines={race}
        bare
      />
    </section>
  );
}
