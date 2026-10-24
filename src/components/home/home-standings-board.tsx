"use client";

import { useState } from "react";

import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import type { HomeStandingSlim } from "@/lib/home-standings-slim";
import { useTranslations } from "next-intl";

export function HomeStandingsBoard({
  season,
  east,
  west,
  race = false,
}: {
  season: string;
  east: HomeStandingSlim[];
  west: HomeStandingSlim[];
  /** Playoff race framing: seed cut lines and a play-in note. */
  race?: boolean;
}) {
  const t = useTranslations("Home");
  const [conference, setConference] = useState<"east" | "west">("west");
  const rows = conference === "west" ? west : east;

  return (
    <section className="sports-card flex flex-col gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 className="type-heading">
            {race ? t("playoffRace", { season }) : t("standings", { season })}
          </h2>
          {race ? (
            <p className="type-caption mt-1 text-muted-foreground">{t("playInCutNote")}</p>
          ) : null}
        </div>
        <ChoiceTrack className="w-fit">
          {(
            [
              ["east", "east"],
              ["west", "west"],
            ] as const
          ).map(([id, key]) => (
            <ChoiceChip
              key={id}
              active={conference === id}
              onClick={() => setConference(id)}
            >
              {t(key)}
            </ChoiceChip>
          ))}
        </ChoiceTrack>
      </div>
      <StandingsConferenceTable
        title={conference === "west" ? t("west") : t("east")}
        rows={rows}
        compact
        seedLines={race}
        bare
      />
    </section>
  );
}
