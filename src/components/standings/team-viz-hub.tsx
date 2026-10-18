"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { FilterBar, FilterSelect } from "@/components/explore/filter-bar";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import { Calendar } from "lucide-react";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import { type } from "@/lib/design-system";
import { STANDINGS_VISUALIZATIONS_PATH } from "@/lib/standings-routes";
import {
  parseTeamVizConference,
  TEAM_VIZ_DEFAULT_VIEW,
  TEAM_VIZ_VIEWS,
  teamVizIgnoresSeason,
  type TeamVizView,
} from "@/lib/team-viz";
import { cn } from "@/lib/utils";
import {
  parseVizTeamKey,
  parseVizTeamKeys,
  VIZ_TEAM_HIGHLIGHT_MAX,
  VIZ_TEAM_OPTIONS,
  vizTeamParam,
} from "@/lib/viz-team-highlight";

function seasonYear(season: string) {
  try {
    return String(espnYearFromCanonicalSeason(season));
  } catch {
    return season.slice(0, 4);
  }
}

export function useTeamVizParams() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${STANDINGS_VISUALIZATIONS_PATH}?${qs}` : STANDINGS_VISUALIZATIONS_PATH, {
          scroll: false,
        });
      });
    },
    [router, searchParams]
  );

  const teamKeys = parseVizTeamKeys(searchParams.get("team"));
  const toggleTeam = useCallback(
    (key: string) => {
      const keys = parseVizTeamKeys(searchParams.get("team"));
      if (keys.includes(key)) {
        replaceParams({ team: vizTeamParam(keys.filter((k) => k !== key)) || null });
      } else if (keys.length < VIZ_TEAM_HIGHLIGHT_MAX) {
        replaceParams({ team: vizTeamParam([...keys, key]) });
      }
    },
    [replaceParams, searchParams]
  );

  return {
    replaceParams,
    isPending,
    teamKeys,
    toggleTeam,
    conference: parseTeamVizConference(searchParams.get("conf")),
  };
}

export function TeamVizHub({
  view,
  season,
  seasonOptions,
}: {
  view: TeamVizView;
  season: string;
  seasonOptions: string[];
}) {
  const { replaceParams, isPending, teamKeys, toggleTeam, conference } = useTeamVizParams();

  return (
    <FilterBar label="Team visualization filters" pending={isPending}>
      <ChoiceTrack role="tablist" aria-label="Visualization" className="flex-wrap">
        {TEAM_VIZ_VIEWS.map((item) => (
          <ChoiceChip
            key={item.id}
            active={view === item.id}
            role="tab"
            aria-selected={view === item.id}
            onClick={() => replaceParams({ view: item.id === TEAM_VIZ_DEFAULT_VIEW ? null : item.id })}
          >
            {item.label}
          </ChoiceChip>
        ))}
      </ChoiceTrack>

      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        {seasonOptions.length > 1 && !teamVizIgnoresSeason(view) ? (
          <FilterSelect
            id="team-viz-season"
            label="Season"
            value={seasonOptions.includes(season) ? season : seasonOptions[0]}
            onChange={(value) => replaceParams({ season: value })}
            icon={<Calendar className="size-3.5 text-muted-foreground" aria-hidden />}
            options={seasonOptions.map((option) => ({ value: option, label: seasonYear(option) }))}
            className="min-w-[5.5rem]"
          />
        ) : null}

        <ChoiceTrack role="group" aria-label="Conference">
          {([null, "East", "West"] as const).map((conf) => (
            <ChoiceChip
              key={conf ?? "all"}
              active={conference === conf}
              onClick={() => replaceParams({ conf: conf ? conf.toLowerCase() : null })}
            >
              {conf ?? "All"}
            </ChoiceChip>
          ))}
        </ChoiceTrack>

        {view !== "race" ? (
          <FilterSelect
            key={teamKeys.join(",")}
            id="team-viz-team"
            label="Highlight a team"
            value=""
            placeholder={
              teamKeys.length
                ? `Highlight (${teamKeys.length}/${VIZ_TEAM_HIGHLIGHT_MAX})`
                : "Highlight a team"
            }
            onChange={(value) => {
              const key = parseVizTeamKey(value);
              if (key) toggleTeam(key);
            }}
            options={VIZ_TEAM_OPTIONS.filter((option) => !teamKeys.includes(option.value)).map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            className="min-w-[9rem]"
          />
        ) : null}
      </div>

      {view !== "race" && teamKeys.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {teamKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleTeam(key)}
              className={cn(
                type.caption,
                "glass-pill glass-pill-active inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold"
              )}
              aria-label={`Clear ${key} highlight`}
            >
              <TeamLogo teamKey={key} size="xs" />
              {key}
              <span className="ml-0.5 opacity-70" aria-hidden>
                ×
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </FilterBar>
  );
}
