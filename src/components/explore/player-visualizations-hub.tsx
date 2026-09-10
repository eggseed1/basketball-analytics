"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { type } from "@/lib/design-system";
import {
  PLAYER_RACE_METRIC_GROUPS,
  PLAYER_RACE_METRICS,
  PLAYER_RACE_MIN_MINUTES_OPTIONS,
  PLAYER_RACE_TOP_N_OPTIONS,
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
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/brand/team-logo";

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
  | "bpm";

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
];

type SearchHit = {
  id: string;
  name: string;
  team: string;
};

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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
        active
          ? "glass-pill-active"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function selectClassName(extra?: string) {
  return cn(
    type.bodySm,
    "w-full rounded-md border border-border/70 frost-surface px-2.5 py-1.5 font-semibold sm:w-auto sm:px-3",
    extra
  );
}

export function PlayerVisualizationsHubChrome({
  view,
  season,
  seasonOptions,
}: {
  view: VizView;
  season: string;
  seasonOptions: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pinQuery, setPinQuery] = useState("");
  const [pinHits, setPinHits] = useState<SearchHit[]>([]);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinLabels, setPinLabels] = useState<Record<string, string>>({});

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
      return "all";
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

  useEffect(() => {
    const q = pinQuery.trim();
    if (q.length < 2) {
      setPinHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = globalThis.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q,
          season,
          scope: "season",
        });
        const res = await fetch(`/api/players/search?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { results?: SearchHit[] };
        setPinHits((json.results ?? []).slice(0, 8));
        setPinOpen(true);
      } catch {
        /* aborted / network */
      }
    }, 180);
    return () => {
      controller.abort();
      globalThis.clearTimeout(timer);
    };
  }, [pinQuery, season]);

  const pinPlayer = (hit: SearchHit) => {
    const next = [...new Set([...pinIds, hit.id])].slice(0, 12);
    setPinLabels((prev) => ({ ...prev, [hit.id]: hit.name }));
    setPinQuery("");
    setPinHits([]);
    setPinOpen(false);
    replaceParams({ pin: next.join(",") });
  };

  const unpinPlayer = (playerId: string) => {
    const next = pinIds.filter((id) => id !== playerId);
    setPinLabels((prev) => {
      const copy = { ...prev };
      delete copy[playerId];
      return copy;
    });
    replaceParams({ pin: next.length ? next.join(",") : null });
  };

  const setRankEnd = (end: PlayerRaceRankEnd) => {
    if (end === "both") {
      // Default for signed boards — omit from URL when that is the default.
      const signedDefault =
        view === "race" || view === "impact" || view === "bpm";
      replaceParams({ end: signedDefault ? null : "both" });
      return;
    }
    if (end === "high") {
      const signedDefault =
        view === "race" || view === "impact" || view === "bpm";
      replaceParams({ end: signedDefault ? "high" : null });
      return;
    }
    replaceParams({ end: "low" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Visualization"
      >
        {VIEWS.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() =>
                replaceParams({
                  view: item.id === "race" ? null : item.id,
                  // Metric is race-only; keep top / end / minmp / pin / season.
                  ...(isScatterView(item.id) ? { metric: null } : {}),
                })
              }
              className={cn(
                type.caption,
                "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
                active
                  ? "glass-pill-active"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {seasonOptions.length > 1 ? (
            <>
              <label
                className={cn(type.caption, "sr-only")}
                htmlFor="viz-shared-season"
              >
                Season
              </label>
              <select
                id="viz-shared-season"
                value={
                  seasonOptions.includes(season) ? season : seasonOptions[0]
                }
                onChange={(event) =>
                  replaceParams({ season: event.target.value })
                }
                className={selectClassName("col-span-1")}
              >
                {seasonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} season
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {view === "race" ? (
            <>
              <label
                className={cn(type.caption, "sr-only")}
                htmlFor="viz-race-metric"
              >
                Metric
              </label>
              <select
                id="viz-race-metric"
                value={metric}
                onChange={(event) => {
                  const next = event.target.value as PlayerRaceMetric;
                  const patch: Record<string, string | null> = {
                    metric: next,
                  };
                  if (!playerRaceMetricCanBeNegative(next)) {
                    patch.end = null;
                  }
                  replaceParams(patch);
                }}
                className={selectClassName(
                  "col-span-2 sm:col-auto sm:min-w-[11rem]"
                )}
                aria-label="Race metric"
              >
                {PLAYER_RACE_METRIC_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {PLAYER_RACE_METRICS.filter((row) => row.group === group).map(
                      (option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} ({option.shortLabel})
                        </option>
                      )
                    )}
                  </optgroup>
                ))}
              </select>
            </>
          ) : null}

          <label
            className={cn(type.caption, "sr-only")}
            htmlFor="viz-shared-top"
          >
            Field size
          </label>
          <select
            id="viz-shared-top"
            value={fieldSelectValue}
            onChange={(event) => {
              const value = event.target.value;
              replaceParams({
                top:
                  value === "all"
                    ? "all"
                    : playerRaceFieldSizeParam(Number(value)),
              });
            }}
            className={selectClassName()}
            aria-label="Number of players in the field"
          >
            <option value="all">All players</option>
            {PLAYER_RACE_TOP_N_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {rankEnd === "low"
                  ? `Bottom ${n}`
                  : rankEnd === "both"
                    ? `Both ends · ${n}`
                    : `Top ${n}`}
              </option>
            ))}
            {fieldSize !== "all" &&
            !PLAYER_RACE_TOP_N_OPTIONS.includes(
              fieldSize as (typeof PLAYER_RACE_TOP_N_OPTIONS)[number]
            ) ? (
              <option value={fieldSize}>
                {rankEnd === "low"
                  ? `Bottom ${fieldSize}`
                  : rankEnd === "both"
                    ? `Both ends · ${fieldSize}`
                    : `Top ${fieldSize}`}
              </option>
            ) : null}
          </select>

          {showRankEnd ? (
            <div
              className="col-span-2 flex items-center gap-1 rounded-md border border-border/70 frost-surface p-0.5 sm:col-auto"
              role="group"
              aria-label="Ranking end"
            >
              <Chip
                active={rankEnd === "high"}
                onClick={() => setRankEnd("high")}
              >
                Highest
              </Chip>
              <Chip
                active={rankEnd === "both"}
                onClick={() => setRankEnd("both")}
              >
                Both
              </Chip>
              <Chip
                active={rankEnd === "low"}
                onClick={() => setRankEnd("low")}
              >
                Lowest
              </Chip>
            </div>
          ) : null}

          <label
            className={cn(type.caption, "sr-only")}
            htmlFor="viz-shared-minmp"
          >
            Minimum minutes
          </label>
          <select
            id="viz-shared-minmp"
            value={String(minMinutes)}
            onChange={(event) => {
              const n = Number(event.target.value);
              replaceParams({ minmp: String(Math.max(0, n)) });
            }}
            className={selectClassName()}
            aria-label="Minimum minutes played"
          >
            {PLAYER_RACE_MIN_MINUTES_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Any minutes" : `≥ ${n.toLocaleString()} MP`}
              </option>
            ))}
            {!PLAYER_RACE_MIN_MINUTES_OPTIONS.includes(
              minMinutes as (typeof PLAYER_RACE_MIN_MINUTES_OPTIONS)[number]
            ) ? (
              <option value={minMinutes}>
                ≥ {minMinutes.toLocaleString()} MP
              </option>
            ) : null}
          </select>

          <label
            className={cn(type.caption, "sr-only")}
            htmlFor="viz-shared-team"
          >
            Highlight team
          </label>
          <select
            id="viz-shared-team"
            value=""
            onChange={(event) => {
              const next = parseVizTeamKey(event.target.value);
              if (!next) return;
              if (teamKeys.includes(next)) return;
              if (teamKeys.length >= VIZ_TEAM_HIGHLIGHT_MAX) return;
              replaceParams({ team: vizTeamParam([...teamKeys, next]) });
            }}
            className={selectClassName("col-span-2 sm:col-auto sm:min-w-[12rem]")}
            aria-label="Add team roster highlight"
          >
            <option value="">
              {teamKeys.length
                ? `Add team (${teamKeys.length}/${VIZ_TEAM_HIGHLIGHT_MAX})…`
                : "Highlight a team…"}
            </option>
            {VIZ_TEAM_OPTIONS.filter(
              (option) => !teamKeys.includes(option.value)
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="relative col-span-2 min-w-0 w-full sm:min-w-[12rem] sm:max-w-xs sm:flex-1">
            <label
              className={cn(type.caption, "sr-only")}
              htmlFor="viz-shared-pin"
            >
              Pin a player
            </label>
            <input
              id="viz-shared-pin"
              value={pinQuery}
              onChange={(event) => setPinQuery(event.target.value)}
              onFocus={() => setPinOpen(true)}
              onBlur={() => {
                globalThis.setTimeout(() => setPinOpen(false), 150);
              }}
              placeholder="Pin a player…"
              className={cn(
                type.bodySm,
                "w-full rounded-md border border-border/70 frost-surface px-3 py-1.5 font-semibold"
              )}
              autoComplete="off"
            />
            {pinOpen && pinHits.length ? (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border/70 bg-background shadow-lg">
                {pinHits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className={cn(
                        type.caption,
                        "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary/70"
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pinPlayer(hit)}
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {hit.name}
                      </span>
                      <span className="text-muted-foreground">{hit.team}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
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
      </div>
    </div>
  );
}
