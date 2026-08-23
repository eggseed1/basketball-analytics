"use client";

import { useState } from "react";

import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
import { TextLink } from "@/components/ui/text-link";
import type { StandingRow } from "@/data/types";
import { cn } from "@/lib/utils";

export function HomeStandingsBoard({
  season,
  east,
  west,
  subtitle,
}: {
  season: string;
  east: StandingRow[];
  west: StandingRow[];
  subtitle?: string;
}) {
  const [conference, setConference] = useState<"east" | "west">("west");
  const rows = conference === "west" ? west : east;

  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-[21px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="type-heading">{season} Standings</h2>
          {subtitle ? (
            <p className="text-[13px] text-muted-foreground">{subtitle}</p>
          ) : null}
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
                  "glass-pill rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
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
        <TextLink
          href="/standings"
          className="type-body-sm shrink-0 pt-0.5 text-muted-foreground"
        >
          See all teams →
        </TextLink>
      </div>
      <StandingsConferenceTable
        title={conference === "west" ? "West" : "East"}
        rows={rows}
        compact
      />
    </section>
  );
}
