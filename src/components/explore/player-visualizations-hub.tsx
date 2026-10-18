"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { type } from "@/lib/design-system";
import {
  PLAYER_RACE_METRICS,
  PLAYER_RACE_MIN_MINUTES_OPTIONS,
  PLAYER_RACE_TOP_N_OPTIONS,
  PLAYER_RACE_DEFAULT_FIELD_SIZE,
  VIZ_SCATTER_DEFAULT_FIELD_SIZE,
  parsePlayerRaceFieldSize,
  parsePlayerRaceMetric,
  parsePlayerRaceMinMinutes,
  parseVizScatterMinMinutes,
  playerRaceFieldSizeParam,
  playerRaceMetricCanBeNegative,
  type PlayerRaceFieldSize,
  type PlayerRaceMetric,
  type PlayerRaceRankEnd,
} from "@/lib/player-race-tracker";
import { leagueScatterDefaultRankEnd } from "@/lib/league-player-scatter";
import { parseVizRankEnd } from "@/lib/viz-field-filter";
import {
  parseVizTeamKey,
  parseVizTeamKeys,
  vizTeamParam,
  VIZ_TEAM_OPTIONS,
  VIZ_TEAM_HIGHLIGHT_MAX,
} from "@/lib/viz-team-highlight";
import { TeamLogo } from "@/components/brand/team-logo";
import { FilterBar, FilterSelect } from "@/components/explore/filter-bar";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import { Calendar } from "lucide-react";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import { cn } from "@/lib/utils";

export type VizView =
  | "race"
  | "usage"
  | "diet"
  | "creation"
  | "volume"
  | "impact"
  | "ft"
  | "glass"
  | "defense"
  | "bpm"
  | "surplus"
  | "payoff";

/** Signed views where the default field shows both ends. */
function defaultsToBothEnds(view: VizView): boolean {
  return view === "race" || view === "impact" || view === "bpm" || view === "surplus";
}

const VIEWS: Array<{ id: VizView; label: string }> = [
  { id: "race", label: "Race tracker" },
  { id: "usage", label: "Usage vs efficiency" },
  { id: "impact", label: "Usage vs impact" },
  { id: "bpm", label: "Usage vs BPM" },
  { id: "diet", label: "Shot diet" },
  { id: "creation", label: "Creation" },
  { id: "ft", label: "FT pressure" },
  { id: "glass", label: "Glass work" },
  { id: "defense", label: "Stocks" },
  { id: "volume", label: "Scoring volume" },
  { id: "surplus", label: "Contract surplus" },
  { id: "payoff", label: "Salary played off" },
];

function parsePinIds(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ].slice(0, 12);
}

function isScatterView(view: VizView): boolean {
  return view !== "race";
}

function seasonYear(season: string) {
  try {
    return String(espnYearFromCanonicalSeason(season));
  } catch {
    return season.slice(0, 4);
  }
}

function fieldSizeLabel(value: string, rankEnd: PlayerRaceRankEnd) {
  if (value === "all") return "All players";
  if (rankEnd === "low") return `Bottom ${value}`;
  if (rankEnd === "both") return `Both ends · ${value}`;
  return `Top ${value}`;
}

export function PlayerVisualizationsHubChrome({
  view,
  season,
  seasonOptions,
  pinNames,
}: {
  view: VizView;
  season: string;
  seasonOptions: string[];
  /** Names for pins that arrive in the URL, before any search runs. */
  pinNames?: Record<string, string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pinLabels = pinNames ?? {};

  const pinIds = useMemo(
    () => parsePinIds(searchParams.get("pin")),
    [searchParams]
  );
  const teamKeys = useMemo(
    () => parseVizTeamKeys(searchParams.get("team")),
    [searchParams]
  );

  const metric = parsePlayerRaceMetric(searchParams.get("metric"));
  const fieldSize: PlayerRaceFieldSize = (() => {
    const raw = searchParams.get("top");
    if (raw == null || raw === "") {
      return view === "race" || view === "surplus" || view === "payoff"
        ? PLAYER_RACE_DEFAULT_FIELD_SIZE
        : VIZ_SCATTER_DEFAULT_FIELD_SIZE;
    }
    return parsePlayerRaceFieldSize(raw);
  })();
  const rankEnd: PlayerRaceRankEnd = (() => {
    if (view === "race") {
      if (!playerRaceMetricCanBeNegative(metric)) return "high";
      return parseVizRankEnd(searchParams.get("end"), "both");
    }
    if (view === "impact" || view === "bpm") {
      return parseVizRankEnd(
        searchParams.get("end"),
        leagueScatterDefaultRankEnd(view)
      );
    }
    if (view === "surplus") return parseVizRankEnd(searchParams.get("end"), "both");
    return parseVizRankEnd(searchParams.get("end"), "high");
  })();
  const minMinutes =
    view === "race"
      ? parsePlayerRaceMinMinutes(searchParams.get("minmp"))
      : parseVizScatterMinMinutes(searchParams.get("minmp"));
  const showRankEnd =
    view === "race"
      ? playerRaceMetricCanBeNegative(metric)
      : true;
  const fieldSelectValue =
    fieldSize === "all" ? "all" : String(fieldSize);

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(
        qs
          ? `/explore/players/visualizations?${qs}`
          : "/explore/players/visualizations"
      );
    },
    [router, searchParams]
  );

  const unpinPlayer = (playerId: string) => {
    const next = pinIds.filter((id) => id !== playerId);
    replaceParams({ pin: next.length ? next.join(",") : null });
  };

  const setRankEnd = (end: PlayerRaceRankEnd) => {
    if (end === "both") {
      // Default for signed boards — omit from URL when that is the default.
      replaceParams({ end: defaultsToBothEnds(view) ? null : "both" });
      return;
    }
    if (end === "high") {
      replaceParams({ end: defaultsToBothEnds(view) ? "high" : null });
      return;
    }
    replaceParams({ end: "low" });
  };

  const fieldOptions = [
    { value: "all", label: fieldSizeLabel("all", rankEnd) },
    ...PLAYER_RACE_TOP_N_OPTIONS.map((n) => ({
      value: String(n),
      label: fieldSizeLabel(String(n), rankEnd),
    })),
    ...(fieldSize !== "all" &&
    !PLAYER_RACE_TOP_N_OPTIONS.includes(fieldSize as (typeof PLAYER_RACE_TOP_N_OPTIONS)[number])
      ? [{ value: String(fieldSize), label: fieldSizeLabel(String(fieldSize), rankEnd) }]
      : []),
  ];
  const minuteOptions = [
    ...PLAYER_RACE_MIN_MINUTES_OPTIONS.map((n) => ({
      value: String(n),
      label: n === 0 ? "Any minutes" : `≥ ${n.toLocaleString()} MP`,
    })),
    ...(!PLAYER_RACE_MIN_MINUTES_OPTIONS.includes(
      minMinutes as (typeof PLAYER_RACE_MIN_MINUTES_OPTIONS)[number]
    )
      ? [{ value: String(minMinutes), label: `≥ ${minMinutes.toLocaleString()} MP` }]
      : []),
  ];

  return (
    <FilterBar label="Visualization filters">
      <ChoiceTrack role="tablist" aria-label="Visualization" className="flex-wrap">
        {VIEWS.map((item) => (
          <ChoiceChip
            key={item.id}
            active={view === item.id}
            role="tab"
            aria-selected={view === item.id}
            onClick={() =>
              replaceParams({
                view: item.id === "race" ? null : item.id,
                ...(isScatterView(item.id) ? { metric: null } : {}),
              })
            }
          >
            {item.label}
          </ChoiceChip>
        ))}
      </ChoiceTrack>

      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          {seasonOptions.length > 1 && view !== "surplus" ? (
            <FilterSelect
              id="viz-shared-season"
              label="Season"
              value={seasonOptions.includes(season) ? season : seasonOptions[0]}
              onChange={(value) => replaceParams({ season: value })}
              icon={<Calendar className="size-3.5 text-muted-foreground" aria-hidden />}
              options={seasonOptions.map((option) => ({
                value: option,
                label: seasonYear(option),
              }))}
              className="min-w-[5.5rem]"
            />
          ) : null}

          {view === "race" ? (
            <FilterSelect
              id="viz-race-metric"
              label="Metric"
              value={metric}
              onChange={(value) => {
                const next = value as PlayerRaceMetric;
                const patch: Record<string, string | null> = { metric: next };
                if (!playerRaceMetricCanBeNegative(next)) patch.end = null;
                replaceParams(patch);
              }}
              options={PLAYER_RACE_METRICS.map((option) => ({
                value: option.id,
                label: `${option.label} (${option.shortLabel})`,
                group: option.group,
              }))}
              className="min-w-[8rem]"
            />
          ) : null}

          <FilterSelect
            id="viz-shared-top"
            label="Field size"
            value={fieldSelectValue}
            onChange={(value) =>
              replaceParams({
                top: value === "all" ? "all" : playerRaceFieldSizeParam(Number(value)),
              })
            }
            options={fieldOptions}
          />

          {showRankEnd ? (
            <ChoiceTrack role="group" aria-label="Ranking end">
              <ChoiceChip active={rankEnd === "high"} onClick={() => setRankEnd("high")}>
                Highest
              </ChoiceChip>
              <ChoiceChip active={rankEnd === "both"} onClick={() => setRankEnd("both")}>
                Both
              </ChoiceChip>
              <ChoiceChip active={rankEnd === "low"} onClick={() => setRankEnd("low")}>
                Lowest
              </ChoiceChip>
            </ChoiceTrack>
          ) : null}

          {view !== "surplus" && view !== "payoff" ? (
            <FilterSelect
              id="viz-shared-minmp"
              label="Minimum minutes"
              value={String(minMinutes)}
              onChange={(value) => replaceParams({ minmp: String(Math.max(0, Number(value))) })}
              options={minuteOptions}
            />
          ) : null}

          <FilterSelect
            key={teamKeys.join(",")}
            id="viz-shared-team"
            label="Highlight team"
            value=""
            placeholder={
              teamKeys.length
                ? `Add team (${teamKeys.length}/${VIZ_TEAM_HIGHLIGHT_MAX})`
                : "Highlight a team"
            }
            onChange={(value) => {
              const next = parseVizTeamKey(value);
              if (!next || teamKeys.includes(next) || teamKeys.length >= VIZ_TEAM_HIGHLIGHT_MAX) return;
              replaceParams({ team: vizTeamParam([...teamKeys, next]) });
            }}
            options={VIZ_TEAM_OPTIONS.filter((option) => !teamKeys.includes(option.value)).map(
              (option) => ({ value: option.value, label: option.label })
            )}
            className="min-w-[9rem]"
          />
        </div>

        {teamKeys.length || pinIds.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {teamKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  replaceParams({
                    team: vizTeamParam(teamKeys.filter((row) => row !== key)),
                  })
                }
                className={cn(
                  type.caption,
                  "glass-pill glass-pill-active inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold"
                )}
                aria-label={`Clear ${key} team highlight`}
                title="Clear team highlight"
              >
                <TeamLogo teamKey={key} size="xs" />
                {key} roster
                <span className="ml-0.5 opacity-70" aria-hidden>
                  ×
                </span>
              </button>
            ))}
            {pinIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => unpinPlayer(id)}
                className={cn(
                  type.caption,
                  "glass-pill glass-pill-active rounded-md px-2.5 py-1 font-semibold"
                )}
                aria-label={`Unpin ${pinLabels[id] ?? id}`}
                title="Unpin"
              >
                {pinLabels[id] ?? "Pinned"}
                <span className="ml-1 opacity-70" aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : null}
    </FilterBar>
  );
}
