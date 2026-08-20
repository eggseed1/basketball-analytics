"use client";

import { useMemo, useState } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import {
  CareerTeamTrendChart,
  type CareerSeriesPoint,
} from "@/components/players/career-team-trend-chart";
import { TextLink } from "@/components/ui/text-link";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand, teamChartColor } from "@/lib/nba-brand";
import {
  playerDepthHref,
  type PlayerSeasonKind,
} from "@/lib/player-destination";
import type { ThemeMode } from "@/themes/era-theme";
import { cn } from "@/lib/utils";

export type CareerBoardRow = {
  season: string;
  teamId: string;
  teamAbbr: string;
  gamesPlayed: number;
  mpg: number | null;
  ppg: number;
  apg: number;
  rpg: number;
  orpg: number | null;
  drpg: number | null;
  spg: number | null;
  bpg: number | null;
  tov: number | null;
  atr: number | null;
  fgPct: number | null;
  twoPct: number | null;
  threePct: number | null;
  ftPct: number | null;
  efg: number | null;
  ts: number | null;
  usg: number | null;
  threePar: number | null;
  ftr: number | null;
  ortg: number | null;
  drtg: number | null;
  net: number | null;
  per: number | null;
  bpm: number | null;
  vorp: number | null;
  ws: number | null;
  cpi: number;
  war1: number | null;
  drbl100: number | null;
  drblO: number | null;
  drblD: number | null;
};

type MetricId = "ppg" | "apg" | "rpg" | "ts" | "usg";

const METRICS: Array<{
  id: MetricId;
  label: string;
  asPct?: boolean;
}> = [
  { id: "ppg", label: "PTS / G" },
  { id: "apg", label: "AST / G" },
  { id: "rpg", label: "REB / G" },
  { id: "ts", label: "TS%", asPct: true },
  { id: "usg", label: "USG%", asPct: true },
];

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  return `${m[1].slice(2)}-${m[2]}`;
}

function seriesFor(
  rows: CareerBoardRow[],
  metric: MetricId
): CareerSeriesPoint[] {
  const chronological = [...rows].sort((a, b) =>
    a.season.localeCompare(b.season)
  );
  const points: CareerSeriesPoint[] = [];
  for (const row of chronological) {
    let value: number | null = null;
    if (metric === "ppg") value = row.ppg;
    if (metric === "apg") value = row.apg;
    if (metric === "rpg") value = row.rpg;
    if (metric === "ts") value = row.ts != null ? row.ts * 100 : null;
    if (metric === "usg") value = row.usg != null ? row.usg * 100 : null;
    if (value == null || !Number.isFinite(value)) continue;
    const { color, abbr } = teamChartColor(row.teamId);
    points.push({
      season: shortSeason(row.season),
      value,
      teamId: row.teamId,
      teamAbbr: row.teamAbbr || abbr,
      color,
    });
  }
  return points;
}

export function PlayerCareerBoard({
  playerId,
  season,
  seasonType,
  rows,
  compareSeason: _compareSeason,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  rows: CareerBoardRow[];
  compareSeason: string;
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
}) {
  const [metric, setMetric] = useState<MetricId>("ppg");
  const wash = brandAtmosphereColors(
    resolveTeamBrand(teamKey)?.primary,
    resolveTeamBrand(teamKey)?.secondary
  );
  const selected = METRICS.find((item) => item.id === metric) ?? METRICS[0];
  const points = seriesFor(rows, selected.id);
  const newestFirst = useMemo(
    () => [...rows].sort((a, b) => b.season.localeCompare(a.season)),
    [rows]
  );

  const kindLabel =
    seasonType === "playoffs" ? "Playoffs" : "Regular season";

  return (
    <section id="career" className="scroll-mt-16 flex flex-col gap-4" aria-label="Career">
      <GlassSurface
        effect="css"
        accentColor={wash?.colorA}
        accentColorB={wash?.colorB}
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div>
          <h2 className={type.heading}>Season stats</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            {kindLabel} totals as per-game rates. Click a season to open that
            year’s game log.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {seasonType === "playoffs"
              ? "No playoff seasons in this career."
              : "No career seasons available."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === metric}
                  onClick={() => setMetric(item.id)}
                  className={cn(
                    type.caption,
                    "rounded-md px-2.5 py-1 font-semibold",
                    item.id === metric
                      ? "bg-foreground text-background"
                      : "bg-white/55 text-foreground hover:bg-white/80"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {points.length > 0 ? (
              <CareerTeamTrendChart points={points} height={200} />
            ) : (
              <p className={cn(type.caption, "text-muted-foreground")}>
                {selected.label} is not published for these seasons.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left">
                <thead
                  className={cn(
                    type.caption,
                    "uppercase tracking-wide text-muted-foreground"
                  )}
                >
                  <tr>
                    <th className="py-1 pr-2 font-semibold">Season</th>
                    <th className="px-1.5 py-1 text-right font-semibold">GP</th>
                    <th className="px-1.5 py-1 text-right font-semibold">
                      PPG
                    </th>
                    <th className="px-1.5 py-1 text-right font-semibold">
                      APG
                    </th>
                    <th className="px-1.5 py-1 text-right font-semibold">
                      RPG
                    </th>
                    <th className="px-1.5 py-1 text-right font-semibold">
                      TS%
                    </th>
                    <th className="py-1 pl-1.5 text-right font-semibold">
                      USG
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {newestFirst.map((row) => {
                    const active = row.season === season;
                    return (
                      <tr
                        key={row.season}
                        className={active ? "bg-foreground/5" : undefined}
                      >
                        <td className="py-1.5 pr-2">
                          <TextLink
                            href={playerDepthHref(playerId, {
                              season: row.season,
                              depth: "games",
                              seasonType,
                              fromHistory,
                              themeMode,
                            })}
                            scroll={false}
                            className={type.caption}
                          >
                            {row.season}
                          </TextLink>
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-1.5 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {formatNumber(row.gamesPlayed)}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-1.5 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {formatNumber(row.ppg, 1)}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-1.5 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {formatNumber(row.apg, 1)}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-1.5 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {formatNumber(row.rpg, 1)}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-1.5 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {row.ts != null ? formatPct(row.ts) : "-"}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "py-1.5 pl-1.5 text-right tabular-nums"
                          )}
                        >
                          {row.usg != null ? formatPct(row.usg) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassSurface>
    </section>
  );
}
