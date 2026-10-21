"use client";

import { useMemo, useState, type ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import {
  CareerTeamTrendChartLazy as CareerTeamTrendChart,
  TalentYearChartLazy as TalentYearChart,
} from "@/components/charts/recharts-lazy";
import { buildTalentSeries } from "@/lib/player-talent-trend";
import type { CareerSeriesPoint } from "@/components/players/career-team-trend-chart";
import type { CompactPlayerGameLogRow } from "@/data/history/player-game-log";
import { efgPct, tsPct } from "@/lib/player-page-contract";
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
  raptor: number | null;
  oRaptor: number | null;
  dRaptor: number | null;
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
  | "profile"
  | "shooting"
  | "defense"
  | "hustle"
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
  { id: "darko", label: "DARKO", category: "impact", digits: 2, primary: true },
  { id: "war1", label: "WAR1", category: "impact", digits: 1, primary: true },
  { id: "ppg", label: "PTS", category: "profile", primary: true },
  { id: "apg", label: "AST", category: "profile", primary: true },
  { id: "rpg", label: "TRB", category: "profile", primary: true },
  { id: "ts", label: "TS%", category: "shooting", asPct: true, primary: true },
  { id: "usg", label: "USG%", category: "advanced", asPct: true, primary: true },
  { id: "mpg", label: "MP", category: "profile", digits: 1 },
  { id: "orpg", label: "ORB", category: "profile", digits: 1 },
  { id: "drpg", label: "DRB", category: "profile", digits: 1 },
  { id: "spg", label: "STL", category: "defense", digits: 1 },
  { id: "bpg", label: "BLK", category: "defense", digits: 1 },
  { id: "tov", label: "TOV", category: "profile", digits: 1 },
  { id: "pf", label: "PF", category: "profile", digits: 1 },
  { id: "atr", label: "AST/TO", category: "advanced", digits: 2 },
  { id: "fgPct", label: "FG%", category: "shooting", asPct: true },
  { id: "twoPct", label: "2P%", category: "shooting", asPct: true },
  { id: "threePct", label: "3P%", category: "shooting", asPct: true },
  { id: "ftPct", label: "FT%", category: "shooting", asPct: true },
  { id: "efg", label: "eFG%", category: "shooting", asPct: true },
  { id: "threePar", label: "3PAr", category: "advanced", asPct: true },
  { id: "ftr", label: "FTr", category: "advanced", digits: 3 },
  { id: "ortg", label: "ORtg", category: "advanced", digits: 1 },
  { id: "drtg", label: "DRtg", category: "defense", digits: 1 },
  { id: "net", label: "NET", category: "advanced", digits: 1 },
  { id: "per", label: "PER", category: "advanced", digits: 1 },
  { id: "bpm", label: "BPM", category: "advanced", digits: 1 },
  { id: "vorp", label: "VORP", category: "advanced", digits: 1 },
  { id: "ws", label: "WS", category: "advanced", digits: 1 },
  { id: "cpi", label: "CPI", category: "impact", digits: 1 },
  { id: "darkoOff", label: "DARKO-O", category: "impact", digits: 2 },
  { id: "darkoDef", label: "DARKO-D", category: "impact", digits: 2 },
  { id: "raptor", label: "RAPTOR", category: "impact", digits: 2 },
  { id: "oRaptor", label: "O-RAPTOR", category: "impact", digits: 2 },
  { id: "dRaptor", label: "D-RAPTOR", category: "impact", digits: 2 },
  { id: "winsAdded", label: "WAR", category: "impact", digits: 2 },
  { id: "drbl100", label: "DRBL", category: "impact", digits: 1 },
  { id: "drblO", label: "DRBL-O", category: "impact", digits: 1 },
  { id: "drblD", label: "DRBL-D", category: "impact", digits: 1 },
];

const TABLE_CATEGORIES: Array<{ id: TableCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "profile", label: "Profile" },
  { id: "shooting", label: "Shooting" },
  { id: "defense", label: "Defense" },
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

/** The chart tracks overall level across a career, so lead with impact. DARKO spans 1996-97+, WAR1 2020-21+. */
const DEFAULT_METRIC_ORDER: MetricId[] = ["darko", "war1", "ppg"];

function defaultCareerMetric(rows: CareerBoardRow[]): MetricId {
  return (
    DEFAULT_METRIC_ORDER.find((id) => rows.some((row) => metricValue(row, id) != null)) ??
    "ppg"
  );
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
      fullSeason: row.season,
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

const IMPACT_GAME_METRICS = new Set<MetricId>([
  "drbl100",
  "war1",
  "darko",
  "bpm",
  "vorp",
  "drblO",
  "drblD",
  "darkoOff",
  "darkoDef",
  "raptor",
]);

/** Hollinger game score per 36. Missing rebound splits count as 0. */
function gameBoxScore(game: CompactPlayerGameLogRow): number | null {
  if (game.minutesNum < 8) return null;
  const raw =
    game.points +
    0.4 * game.fgm -
    0.7 * game.fga -
    0.4 * (game.fta - game.ftm) +
    0.7 * (game.orb ?? 0) +
    0.3 * (game.drb ?? 0) +
    game.steals +
    0.7 * game.assists +
    0.7 * game.blocks -
    0.4 * (game.pf ?? 0) -
    game.turnovers;
  if (!Number.isFinite(raw)) return null;
  return (raw * 36) / game.minutesNum;
}

/** Same 0–100 scale as the season chips. A raw 0.65 rate would sit under a 65 line. */
function percentDots(rate: number | null): number | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  return rate * 100;
}

function gameDotValue(
  metric: MetricId,
  game: CompactPlayerGameLogRow
): number | null {
  if (game.minutesNum <= 0) return null;
  switch (metric) {
    case "ppg":
      return game.points;
    case "apg":
      return game.assists;
    case "rpg":
      return game.rebounds;
    case "mpg":
      return game.minutesNum;
    case "orpg":
      return game.orb;
    case "drpg":
      return game.drb;
    case "spg":
      return game.steals;
    case "bpg":
      return game.blocks;
    case "tov":
      return game.turnovers;
    case "pf":
      return game.pf;
    case "ts":
      return percentDots(tsPct(game.points, game.fga, game.fta));
    case "fgPct":
      return percentDots(game.fga > 0 ? game.fgm / game.fga : null);
    case "twoPct": {
      const twoPa = game.fga - game.threePa;
      const twoPm = game.fgm - game.threePm;
      return percentDots(twoPa > 0 ? twoPm / twoPa : null);
    }
    case "threePct":
      return percentDots(game.threePa > 0 ? game.threePm / game.threePa : null);
    case "ftPct":
      return percentDots(game.fta > 0 ? game.ftm / game.fta : null);
    case "efg":
      return percentDots(efgPct(game.fgm, game.fga, game.threePm));
    case "threePar":
      return percentDots(game.fga > 0 ? game.threePa / game.fga : null);
    default:
      return null;
  }
}

const thBase =
  "py-2 font-semibold text-[12px] uppercase tracking-[0.08em] text-muted-foreground";
const tdBase = "type-caption py-2 tabular-nums";

export function PlayerCareerBoard({
  playerId,
  season,
  seasonType,
  rows,
  compareSeason: _compareSeason,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
  gameLogs = [],
  chart = "seasons",
  hideTitle = false,
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  rows: CareerBoardRow[];
  compareSeason: string;
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
  gameLogs?: CompactPlayerGameLogRow[];
  /** Games is the career-page dot chart. Overview keeps the season line. */
  chart?: "seasons" | "games";
  /** Overview pairs this with Statistics under one Career stats heading. */
  hideTitle?: boolean;
}) {
  const [metric, setMetric] = useState<MetricId>(() => defaultCareerMetric(rows));
  const primary = useMemo(
    () =>
      PRIMARY.filter(
        (m) => m.category !== "impact" || rows.some((row) => metricValue(row, m.id) != null)
      ),
    [rows]
  );
  const [tableCat, setTableCat] = useState<TableCategory | "all">("profile");
  const wash = brandAtmosphereColors(
    resolveTeamBrand(teamKey)?.primary,
    resolveTeamBrand(teamKey)?.secondary
  );
  const selected =
    METRICS.find((item) => item.id === metric) ?? METRICS[0]!;
  const points = seriesFor(rows, selected);
  const talentKind = IMPACT_GAME_METRICS.has(selected.id) ? "impact" : "box";
  const talent = useMemo(() => {
    if (chart !== "games") return null;
    const bySeason = new Map<string, CompactPlayerGameLogRow[]>();
    for (const game of gameLogs) {
      const list = bySeason.get(game.season) ?? [];
      list.push(game);
      bySeason.set(game.season, list);
    }
    const seasons = [...points]
      .sort((a, b) => (a.fullSeason ?? "").localeCompare(b.fullSeason ?? ""))
      .flatMap((point) => {
        if (!point.fullSeason) return [];
        const games = bySeason.get(point.fullSeason) ?? [];
        return [
          {
            season: point.fullSeason,
            value: point.value,
            games: games.map((game) => ({
              date: game.date,
              minutes: game.minutesNum,
              box: gameDotValue(selected.id, game),
              boxScore: gameBoxScore(game),
            })),
          },
        ];
      });
    return buildTalentSeries({ kind: talentKind, seasons });
  }, [chart, gameLogs, points, selected.id, talentKind]);
  const newestFirst = useMemo(
    () => [...rows].sort((a, b) => b.season.localeCompare(a.season)),
    [rows]
  );
  const tableCols = useMemo(() => {
    const catMetrics = METRICS.filter(
      (m) => tableCat === "all" || m.category === tableCat
    );
    // Drop columns with no finite values (e.g. RAPTOR stub corpus → all "-").
    const withData = catMetrics.filter((m) =>
      rows.some((row) => metricValue(row, m.id) != null)
    );
    const pool = withData.length > 0 ? withData : catMetrics;
    return pool.slice(0, tableCat === "all" ? 14 : 12);
  }, [tableCat, rows]);

  const kindLabel =
    seasonType === "playoffs" ? "Playoffs" : "Regular season";

  const body = (
    <>
      {rows.length === 0 ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {seasonType === "playoffs"
            ? "No playoff seasons in this career."
            : "No career seasons available."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {primary.map((item) => (
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

          <GlassSurface
            variant="subtle"
            effect="css"
            accentColor={wash?.colorA}
            accentColorB={wash?.colorB}
            className={cn(
              "flex flex-col p-4 sm:p-5",
              hideTitle ? "gap-2" : "gap-3"
            )}
          >
            {talent ? (
              <>
                <TalentYearChart
                  dots={talent.dots}
                  line={talent.line}
                  kind={talentKind}
                  height={hideTitle ? 220 : 260}
                />
                {!hideTitle ? (
                  <p className={cn(type.caption, "text-muted-foreground")}>
                    {talentKind === "impact"
                      ? `Small dots are games. Large dots are each season's published ${selected.label}, and the line runs through them. Plus-minus is blank in these logs.`
                      : "Small dots are games. Large dots are the season average, and the line runs through them."}
                  </p>
                ) : null}
              </>
            ) : points.length > 0 ? (
              <CareerTeamTrendChart
                points={points}
                height={hideTitle ? 220 : 200}
                drawKey={selected.id}
              />
            ) : (
              <p className={cn(type.caption, "text-muted-foreground")}>
                {selected.label} is not published for these seasons.
              </p>
            )}
          </GlassSurface>
        </>
      )}
    </>
  );

  if (hideTitle) {
    return <div className="flex flex-col gap-3">{body}</div>;
  }

  return (
    <section
      id="career"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Career stats"
    >
      <h2 className={type.heading}>Career stats</h2>
      {body}

      {/* Season table on Overview (line chart) and Career (game-dot chart). */}
      {rows.length > 0 ? (
        <div className="flex flex-col gap-3">
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

          <div className="sports-card sports-card-subtle overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-border/40 bg-secondary/50">
                <tr>
                  <th
                    className={cn(
                      thBase,
                      "sticky left-0 z-10 bg-secondary/50 pl-4 pr-3 text-left"
                    )}
                  >
                    Season
                  </th>
                  <th className={cn(thBase, "px-2 text-right")}>Tm</th>
                  <th className={cn(thBase, "px-2 text-right")}>G</th>
                  {tableCols.map((col, index) => (
                    <th
                      key={col.id}
                      className={cn(
                        thBase,
                        "px-2 text-right",
                        index === tableCols.length - 1 && "pr-4"
                      )}
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
                      className={cn(
                        "group border-b border-border/40 last:border-0",
                        active ? "bg-secondary/60" : "hover:bg-secondary/40"
                      )}
                    >
                      <td
                        className={cn(
                          tdBase,
                          "sticky left-0 z-10 bg-card pl-4 pr-3 text-left group-hover:bg-secondary",
                          active && "bg-secondary"
                        )}
                      >
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
                            "whitespace-nowrap",
                            active && "font-semibold"
                          )}
                        >
                          {row.season}
                        </TextLink>
                      </td>
                      <td className={cn(tdBase, "px-2 text-right")}>
                        {row.teamAbbr || "-"}
                      </td>
                      <td className={cn(tdBase, "px-2 text-right")}>
                        {formatNumber(row.gamesPlayed)}
                      </td>
                      {tableCols.map((col, index) => (
                        <td
                          key={col.id}
                          className={cn(
                            tdBase,
                            "px-2 text-right",
                            index === tableCols.length - 1 && "pr-4"
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
            Showing {kindLabel.toLowerCase()} · {tableCols.length} columns.
            Switch category or scroll sideways for more.
          </p>
        </div>
      ) : null}
    </section>
  );
}
