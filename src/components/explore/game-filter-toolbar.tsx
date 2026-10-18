"use client";

import { useMemo, useState } from "react";

import { useQueryNav } from "@/components/continuity/query-nav";
import { FilterBar, FilterSelect } from "@/components/explore/filter-bar";
import { ChoiceTrack, searchFieldClassName } from "@/components/ui/choice-chip";
import { Calendar } from "lucide-react";
import type { Team } from "@/data/types";

export interface GameFilterToolbarProps {
  seasons: string[];
  teams: Team[];
  defaultSeason: string;
}

export function GameFilterToolbar({
  seasons,
  teams,
  defaultSeason,
}: GameFilterToolbarProps) {
  const { pending, replaceParams, searchParams } = useQueryNav();

  const season = searchParams.get("season") ?? defaultSeason;
  const team = searchParams.get("team") ?? "ALL";
  const startDate = searchParams.get("startDate") ?? "";
  const endDate = searchParams.get("endDate") ?? "";

  const [startDraft, setStartDraft] = useState(startDate);
  const [endDraft, setEndDraft] = useState(endDate);
  const [dateSource, setDateSource] = useState(`${startDate}|${endDate}`);

  if (`${startDate}|${endDate}` !== dateSource) {
    setDateSource(`${startDate}|${endDate}`);
    setStartDraft(startDate);
    setEndDraft(endDate);
  }

  function updateParams(patch: Record<string, string | null>) {
    const normalized: Record<string, string | null> = { ...patch };
    for (const [key, value] of Object.entries(normalized)) {
      if (value === "ALL") normalized[key] = null;
    }
    if (!("season" in normalized) && !searchParams.get("season")) {
      normalized.season = defaultSeason;
    } else if (normalized.season === null) {
      normalized.season = defaultSeason;
    }
    replaceParams(normalized);
  }

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [teams]
  );

  return (
    <FilterBar label="Game filters" pending={pending}>
      <form
        className="flex w-full min-w-0 flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          updateParams({
            startDate: startDraft || null,
            endDate: endDraft || null,
          });
        }}
      >
        <FilterSelect
          id="game-filter-season"
          label="Season"
          value={season}
          onChange={(value) => updateParams({ season: value })}
          icon={<Calendar className="size-3.5 text-muted-foreground" aria-hidden />}
          options={seasons.map((s) => ({ value: s, label: s }))}
          className="min-w-[5.5rem]"
        />
        <FilterSelect
          id="game-filter-team"
          label="Team"
          value={team}
          onChange={(value) => updateParams({ team: value })}
          options={[
            { value: "ALL", label: "All teams" },
            ...sortedTeams.map((t) => ({ value: t.id, label: t.fullName })),
          ]}
          className="min-w-[8rem]"
        />
        <ChoiceTrack>
          <label className="sr-only" htmlFor="game-filter-start">
            Start date
          </label>
          <input
            id="game-filter-start"
            type="date"
            value={startDraft}
            onChange={(e) => setStartDraft(e.target.value)}
            onBlur={() => updateParams({ startDate: startDraft || null })}
            className={searchFieldClassName}
          />
        </ChoiceTrack>
        <ChoiceTrack>
          <label className="sr-only" htmlFor="game-filter-end">
            End date
          </label>
          <input
            id="game-filter-end"
            type="date"
            value={endDraft}
            onChange={(e) => setEndDraft(e.target.value)}
            onBlur={() => updateParams({ endDate: endDraft || null })}
            className={searchFieldClassName}
          />
        </ChoiceTrack>
        <p className="sr-only" aria-live="polite">
          {pending ? "Updating game results…" : "Game results updated."}
        </p>
      </form>
    </FilterBar>
  );
}
