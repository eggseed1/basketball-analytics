"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
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

const pillClass = (active: boolean) =>
  cn(
    type.caption,
    "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
    active ? "glass-pill-active" : "text-muted-foreground hover:text-foreground"
  );

const selectClass = cn(
  type.bodySm,
  "w-full rounded-md border border-border/70 frost-surface px-2.5 py-1.5 font-semibold sm:w-auto sm:px-3"
);

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
    <div className={cn("flex flex-col gap-3", isPending && "opacity-70")} data-pending={isPending ? "true" : "false"}>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Visualization">
        {TEAM_VIZ_VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => replaceParams({ view: item.id === TEAM_VIZ_DEFAULT_VIEW ? null : item.id })}
            className={pillClass(view === item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {seasonOptions.length > 1 && !teamVizIgnoresSeason(view) ? (
          <>
            <label className="sr-only" htmlFor="team-viz-season">
              Season
            </label>
            <select
              id="team-viz-season"
              value={seasonOptions.includes(season) ? season : seasonOptions[0]}
              onChange={(event) => replaceParams({ season: event.target.value })}
              className={selectClass}
            >
              {seasonOptions.map((option) => (
                <option key={option} value={option}>
                  {option} season
                </option>
              ))}
            </select>
          </>
        ) : null}

        <div
          className="flex items-center gap-1 rounded-md border border-border/70 frost-surface p-0.5"
          role="group"
          aria-label="Conference"
        >
          {([null, "East", "West"] as const).map((conf) => (
            <button
              key={conf ?? "all"}
              type="button"
              aria-pressed={conference === conf}
              onClick={() => replaceParams({ conf: conf ? conf.toLowerCase() : null })}
              className={pillClass(conference === conf)}
            >
              {conf ?? "All"}
            </button>
          ))}
        </div>

        {view !== "race" ? (
          <>
            <label className="sr-only" htmlFor="team-viz-team">
              Highlight a team
            </label>
            <select
              id="team-viz-team"
              value=""
              onChange={(event) => {
                const key = parseVizTeamKey(event.target.value);
                if (key) toggleTeam(key);
              }}
              disabled={teamKeys.length >= VIZ_TEAM_HIGHLIGHT_MAX}
              className={cn(selectClass, "col-span-2 sm:col-auto sm:min-w-[12rem]")}
            >
              <option value="">
                {teamKeys.length
                  ? `Highlight (${teamKeys.length}/${VIZ_TEAM_HIGHLIGHT_MAX})…`
                  : "Highlight a team…"}
              </option>
              {VIZ_TEAM_OPTIONS.filter((option) => !teamKeys.includes(option.value)).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
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
    </div>
  );
}
