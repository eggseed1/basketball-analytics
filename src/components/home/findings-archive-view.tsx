"use client";

import { useMemo, useState } from "react";

import { FilterBar, FilterSelect } from "@/components/explore/filter-bar";
import { TeamSelect, currentTeamChoices } from "@/components/teams/team-select";
import { InsightCard, orderByHeight } from "@/components/home/findings-section";
import { ChoiceTrack, searchFieldClassName } from "@/components/ui/choice-chip";
import { findingsDateHeading } from "@/lib/findings-archive";
import { subtleGlassStyle } from "@/lib/design-system";
import type { RecentInsight } from "@/lib/recent-insights";

export type FindingsNight = {
  date: string;
  preseason: boolean;
  season: string;
  insights: RecentInsight[];
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  const d = new Date(`${key}-01T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return key;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function insightTeams(insight: RecentInsight): string[] {
  const teams = new Set<string>();
  if (insight.line?.teamAbbr) teams.add(insight.line.teamAbbr);
  if (insight.line?.opponentAbbr) teams.add(insight.line.opponentAbbr);
  if (insight.game?.away.abbr) teams.add(insight.game.away.abbr);
  if (insight.game?.home.abbr) teams.add(insight.game.home.abbr);
  return [...teams];
}

function matchesQuery(insight: RecentInsight, query: string): boolean {
  if (!query) return true;
  const haystack = [
    insight.headline,
    insight.description,
    insight.context,
    insight.line?.playerName,
    ...insightTeams(insight),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/** Saved nights, three cards across, newest first. Filter by team, text, or month. */
export function FindingsArchiveView({ days }: { days: FindingsNight[] }) {
  const [team, setTeam] = useState("all");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");

  const months = useMemo(() => {
    const keys = [...new Set(days.map((day) => monthKey(day.date)))];
    return keys.map((key) => ({ value: key, label: monthLabel(key) }));
  }, [days]);

  const teams = useMemo(() => {
    const abbrs = new Set<string>();
    for (const day of days) {
      for (const insight of day.insights) {
        for (const abbr of insightTeams(insight)) abbrs.add(abbr);
      }
    }
    return [...abbrs].sort((a, b) => a.localeCompare(b));
  }, [days]);

  const needle = query.trim().toLowerCase();
  const visible = days
    .filter((day) => month === "all" || monthKey(day.date) === month)
    .map((day) => ({
      ...day,
      insights: day.insights.filter(
        (insight) =>
          (team === "all" ||
            insightTeams(insight).some((abbr) => abbr.toLowerCase() === team.toLowerCase())) &&
            matchesQuery(insight, needle)
      ),
    }))
    .filter((day) => day.insights.length > 0);

  return (
    <>
      <FilterBar label="Filter insights">
        <div className="flex flex-wrap items-center gap-2">
          <TeamSelect
            id="findings-team"
            value={team}
            onChange={setTeam}
            teams={currentTeamChoices().filter((choice) =>
              teams.some((abbr) => abbr.toLowerCase() === choice.abbreviation.toLowerCase())
            )}
            empty={{ value: "all", label: "All teams" }}
          />
          <ChoiceTrack className="min-w-[10rem] flex-1 sm:max-w-xs">
            <label className="sr-only" htmlFor="findings-search">
              Search insights
            </label>
            <input
              id="findings-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search player or team"
              className={searchFieldClassName}
            />
          </ChoiceTrack>
          <FilterSelect
            id="findings-month"
            label="Month"
            value={month}
            onChange={setMonth}
            options={[{ value: "all", label: "All months" }, ...months]}
          />
        </div>
      </FilterBar>
      {visible.length ? (
        visible.map((day) => (
          <section key={day.date} id={`night-${day.date}`} className="flex scroll-mt-28 flex-col gap-3">
            <h2 className="type-title sticky top-28 z-10 flex flex-wrap items-baseline gap-x-2 py-2">
              {findingsDateHeading(day.date)}
              {day.preseason ? (
                <span className="whitespace-nowrap type-body-sm font-normal text-muted-foreground">
                  {day.season} preseason
                </span>
              ) : null}
            </h2>
            <div className="sports-card sports-card-subtle p-4" style={subtleGlassStyle}>
              <div data-motion-list className="grid min-w-0 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {orderByHeight(day.insights, 3).map((finding) => (
                  <InsightCard key={finding.id} insight={finding} asOf={null} />
                ))}
              </div>
            </div>
          </section>
        ))
      ) : (
        <p className="type-body-sm text-muted-foreground">No insights match this filter.</p>
      )}
    </>
  );
}
