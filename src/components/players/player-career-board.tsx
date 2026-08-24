"use client";

import { useMemo, useState, type ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { CareerTeamTrendChartLazy as CareerTeamTrendChart } from "@/components/charts/recharts-lazy";
import type { CareerSeriesPoint } from "@/components/players/career-team-trend-chart";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  pf: number | null;
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
  darko: number | null;
  darkoOff: number | null;
  darkoDef: number | null;
  lebron: number | null;
  oLebron: number | null;
  dLebron: number | null;
  winsAdded: number | null;
  war1: number | null;
  drbl100: number | null;
  drblO: number | null;
  drblD: number | null;
};

type MetricId = keyof Omit<
  CareerBoardRow,
  "season" | "teamId" | "teamAbbr" | "gamesPlayed"
>;

type TableCategory =
  | "counting"
  | "shooting"
  | "rates"
  | "advanced"
  | "impact";

type MetricDef = {
  id: MetricId;
  label: string;
  category: TableCategory;
  asPct?: boolean;
  digits?: number;
  /** Featured as a primary chart chip. */
  primary?: boolean;
};

const METRICS: MetricDef[] = [
  { id: "ppg", label: "PTS", category: "counting", primary: true },
  { id: "apg", label: "AST", category: "counting", primary: true },
  { id: "rpg", label: "TRB", category: "counting", primary: true },
  { id: "ts", label: "TS%", category: "shooting", asPct: true, primary: true },
  { id: "usg", label: "USG%", category: "rates", asPct: true, primary: true },
  { id: "mpg", label: "MP", category: "counting", digits: 1 },
  { id: "orpg", label: "ORB", category: "counting", digits: 1 },
  { id: "drpg", label: "DRB", category: "counting", digits: 1 },
  { id: "spg", label: "STL", category: "counting", digits: 1 },
  { id: "bpg", label: "BLK", category: "counting", digits: 1 },
  { id: "tov", label: "TOV", category: "counting", digits: 1 },
  { id: "pf", label: "PF", category: "counting", digits: 1 },
  { id: "atr", label: "AST/TO", category: "rates", digits: 2 },
  { id: "fgPct", label: "FG%", category: "shooting", asPct: true },
  { id: "twoPct", label: "2P%", category: "shooting", asPct: true },
  { id: "threePct", label: "3P%", category: "shooting", asPct: true },
  { id: "ftPct", label: "FT%", category: "shooting", asPct: true },
  { id: "efg", label: "eFG%", category: "shooting", asPct: true },
  { id: "threePar", label: "3PAr", category: "rates", asPct: true },
  { id: "ftr", label: "FTr", category: "rates", digits: 3 },
  { id: "ortg", label: "ORtg", category: "advanced", digits: 1 },
  { id: "drtg", label: "DRtg", category: "advanced", digits: 1 },
  { id: "net", label: "NET", category: "advanced", digits: 1 },
  { id: "per", label: "PER", category: "advanced", digits: 1 },
  { id: "bpm", label: "BPM", category: "advanced", digits: 1 },
  { id: "vorp", label: "VORP", category: "advanced", digits: 1 },
  { id: "ws", label: "WS", category: "advanced", digits: 1 },
  { id: "cpi", label: "CPI", category: "impact", digits: 1 },
  { id: "darko", label: "DARKO", category: "impact", digits: 2 },
  { id: "darkoOff", label: "DARKO-O", category: "impact", digits: 2 },
  { id: "darkoDef", label: "DARKO-D", category: "impact", digits: 2 },
  { id: "lebron", label: "LEBRON", category: "impact", digits: 2 },
  { id: "oLebron", label: "O-LEBRON", category: "impact", digits: 2 },
  { id: "dLebron", label: "D-LEBRON", category: "impact", digits: 2 },
  { id: "winsAdded", label: "Wins added", category: "impact", digits: 2 },
  { id: "war1", label: "WAR1", category: "impact", digits: 1 },
  { id: "drbl100", label: "DRBL", category: "impact", digits: 1 },
  { id: "drblO", label: "DRBL-O", category: "impact", digits: 1 },
  { id: "drblD", label: "DRBL-D", category: "impact", digits: 1 },
];

const TABLE_CATEGORIES: Array<{ id: TableCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "counting", label: "Counting" },
  { id: "shooting", label: "Shooting" },
  { id: "rates", label: "Rates" },
  { id: "advanced", label: "Advanced" },
  { id: "impact", label: "Impact" },
];

const PRIMARY = METRICS.filter((m) => m.primary);
const MORE = METRICS.filter((m) => !m.primary);

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  return `${m[1].slice(2)}-${m[2]}`;
}

function metricValue(row: CareerBoardRow, id: MetricId): number | null {
  const raw = row[id];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw;
}

function seriesFor(
  rows: CareerBoardRow[],
  def: MetricDef
): CareerSeriesPoint[] {
  const chronological = [...rows].sort((a, b) =>
    a.season.localeCompare(b.season)
  );
  const points: CareerSeriesPoint[] = [];
  for (const row of chronological) {
    let value = metricValue(row, def.id);
    if (value == null) continue;
    if (def.asPct) value = value * 100;
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

function formatCell(row: CareerBoardRow, def: MetricDef): string {
  const value = metricValue(row, def.id);
  if (value == null) return "-";
  if (def.asPct) return formatPct(value);
  return formatNumber(value, def.digits ?? 1);
}

function GlassChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
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
  const [tableCat, setTableCat] = useState<TableCategory | "all">("counting");
  const wash = brandAtmosphereColors(
    resolveTeamBrand(teamKey)?.primary,
    resolveTeamBrand(teamKey)?.secondary
  );
  const selected =
    METRICS.find((item) => item.id === metric) ?? METRICS[0]!;
  const points = seriesFor(rows, selected);
  const newestFirst = useMemo(
    () => [...rows].sort((a, b) => b.season.localeCompare(a.season)),
    [rows]
  );
  const tableCols = useMemo(
    () =>
      METRICS.filter(
        (m) => tableCat === "all" || m.category === tableCat
      ).slice(0, tableCat === "all" ? 14 : 12),
    [tableCat]
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
            Career trend + season grid. Click a season to open that year’s
            game log.
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
            <div className="flex flex-wrap items-center gap-1.5">
              {PRIMARY.map((item) => (
                <GlassChip
                  key={item.id}
                  active={item.id === metric}
                  onClick={() => setMetric(item.id)}
                >
                  {item.label}
                </GlassChip>
              ))}
              <Select
                value={MORE.some((m) => m.id === metric) ? metric : undefined}
                onValueChange={(v) => {
                  if (v) setMetric(v as MetricId);
                }}
              >
                <SelectTrigger
                  className={cn(
                    type.caption,
                    "glass-pill h-7 min-w-[9.5rem] rounded-md border-white/40 px-2.5 font-semibold",
                    MORE.some((m) => m.id === metric) && "glass-pill-active"
                  )}
                  aria-label="More chart metrics"
                >
                  <SelectValue placeholder="More stats…" />
                </SelectTrigger>
                <SelectContent align="start" className="max-h-72">
                  {TABLE_CATEGORIES.filter((c) => c.id !== "all").map((cat) => {
                    const items = MORE.filter((m) => m.category === cat.id);
                    if (!items.length) return null;
                    return (
                      <SelectGroup key={cat.id}>
                        <SelectLabel>{cat.label}</SelectLabel>
                        {items.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {points.length > 0 ? (
              <CareerTeamTrendChart points={points} height={200} />
            ) : (
              <p className={cn(type.caption, "text-muted-foreground")}>
                {selected.label} is not published for these seasons.
              </p>
            )}

            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Table categories">
              {TABLE_CATEGORIES.map((cat) => (
                <GlassChip
                  key={cat.id}
                  active={tableCat === cat.id}
                  onClick={() => setTableCat(cat.id)}
                >
                  {cat.label}
                </GlassChip>
              ))}
            </div>

            <div className="sports-card board-scroll-host overflow-x-auto rounded-md">
              <table className="w-full min-w-[48rem] text-left">
                <thead
                  className={cn(
                    type.caption,
                    "uppercase tracking-wide text-muted-foreground"
                  )}
                >
                  <tr>
                    <th className="board-sticky-frost sticky left-0 z-10 py-1 pr-2 font-semibold">
                      Season
                    </th>
                    <th className="px-1.5 py-1 text-right font-semibold">Tm</th>
                    <th className="px-1.5 py-1 text-right font-semibold">G</th>
                    {tableCols.map((col) => (
                      <th
                        key={col.id}
                        className="px-1.5 py-1 text-right font-semibold"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {newestFirst.map((row) => {
                    const active = row.season === season;
                    return (
                      <tr
                        key={row.season}
                        className={active ? "board-row-active" : undefined}
                      >
                        <td className="board-sticky-frost sticky left-0 z-10 py-1.5 pr-2">
                          <TextLink
                            href={playerDepthHref(playerId, {
                              season: row.season,
                              depth: "games",
                              seasonType,
                              fromHistory,
                              themeMode,
                            })}
                            scroll={false}
                            className={cn(
                              type.caption,
                              active &&
                                "font-semibold underline decoration-foreground/40"
                            )}
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
                          {row.teamAbbr || "-"}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-1.5 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {formatNumber(row.gamesPlayed)}
                        </td>
                        {tableCols.map((col) => (
                          <td
                            key={col.id}
                            className={cn(
                              type.caption,
                              "px-1.5 py-1.5 text-right tabular-nums"
                            )}
                          >
                            {formatCell(row, col)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Showing {kindLabel.toLowerCase()} · {tableCols.length} columns —
              switch category or scroll sideways for more.
            </p>
          </>
        )}
      </GlassSurface>
    </section>
  );
}
