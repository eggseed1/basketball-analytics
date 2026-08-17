import type { Position } from "@/data/types";
import { perGame } from "@/data/providers/nba/compute-advanced";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import type { DashboardPlayer } from "@/lib/dashboard-player";

export type DashboardMetricKey =
  | "usagePct"
  | "trueShootingPct"
  | "per"
  | "pointsPerGame"
  | "assistPct"
  | "vorp";

export interface MetricDef {
  key: DashboardMetricKey;
  label: string;
  shortLabel: string;
  /** Extract raw numeric value. */
  value: (row: DashboardPlayer) => number;
  /** Format for axis / tooltip. */
  format: (value: number) => string;
  /** Prefer fraction axes as 0–100 display. */
  asPercent?: boolean;
}

export const DASHBOARD_METRICS: Record<DashboardMetricKey, MetricDef> = {
  usagePct: {
    key: "usagePct",
    label: "Usage %",
    shortLabel: "USG%",
    value: (r) => r.usagePct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    asPercent: true,
  },
  trueShootingPct: {
    key: "trueShootingPct",
    label: "True shooting %",
    shortLabel: "TS%",
    value: (r) => r.trueShootingPct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    asPercent: true,
  },
  per: {
    key: "per",
    label: "Player efficiency rating",
    shortLabel: "PER",
    value: (r) => r.per,
    format: (v) => v.toFixed(1),
  },
  pointsPerGame: {
    key: "pointsPerGame",
    label: "Points per game",
    shortLabel: "PTS",
    value: (r) => perGame(r.points, r.gamesPlayed),
    format: (v) => v.toFixed(1),
  },
  assistPct: {
    key: "assistPct",
    label: "Assist %",
    shortLabel: "AST%",
    value: (r) => r.assistPct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    asPercent: true,
  },
  vorp: {
    key: "vorp",
    label: "Value over replacement",
    shortLabel: "VORP",
    value: (r) => r.vorp,
    format: (v) => v.toFixed(1),
  },
};

export interface HistogramBin {
  id: string;
  label: string;
  /** Inclusive start, exclusive end (last bin inclusive end). */
  start: number;
  end: number;
  count: number;
}

export function buildHistogram(
  rows: DashboardPlayer[],
  metric: MetricDef,
  binCount = 10
): HistogramBin[] {
  if (rows.length === 0) return [];
  const values = rows.map(metric.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) return [];

  const min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    max = min + (metric.asPercent ? 0.01 : 1);
  }
  const width = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => {
    const start = min + i * width;
    const end = i === binCount - 1 ? max + Number.EPSILON : min + (i + 1) * width;
    const displayStart = metric.asPercent ? start * 100 : start;
    const displayEnd = metric.asPercent ? end * 100 : end;
    return {
      id: `${metric.key}:${i}`,
      label: `${displayStart.toFixed(0)}–${displayEnd.toFixed(0)}`,
      start,
      end,
      count: 0,
    };
  });

  for (const value of values) {
    let idx = Math.floor((value - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  }
  return bins;
}

export function rowInHistogramBins(
  row: DashboardPlayer,
  metric: MetricDef,
  selectedBinIds: Set<string>,
  bins: HistogramBin[]
): boolean {
  if (selectedBinIds.size === 0) return true;
  const value = metric.value(row);
  const hit = bins.find((b) => value >= b.start && value < b.end);
  return hit ? selectedBinIds.has(hit.id) : false;
}

export interface CategoryBar {
  id: string;
  label: string;
  value: number;
  count: number;
}

export function buildPositionBars(rows: DashboardPlayer[]): CategoryBar[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const key = row.position ?? "UNK";
    const cur = map.get(key) ?? { sum: 0, count: 0 };
    cur.sum += perGame(row.points, row.gamesPlayed);
    cur.count += 1;
    map.set(key, cur);
  }
  const order: Array<Position | "UNK"> = ["PG", "SG", "SF", "PF", "C", "UNK"];
  return order
    .filter((k) => map.has(k))
    .map((k) => {
      const cur = map.get(k)!;
      return {
        id: k,
        label: k,
        value: cur.count ? cur.sum / cur.count : 0,
        count: cur.count,
      };
    });
}

export function buildTeamBars(
  rows: DashboardPlayer[],
  limit = 12
): CategoryBar[] {
  const map = new Map<string, { sum: number; count: number; label: string }>();
  for (const row of rows) {
    const key = nbaTeamAbbr(row.teamId, row.teamAbbreviation);
    const cur = map.get(key) ?? {
      sum: 0,
      count: 0,
      label: key,
    };
    cur.sum += row.netRating;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([id, cur]) => ({
      id,
      label: cur.label,
      value: cur.count ? cur.sum / cur.count : 0,
      count: cur.count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function buildTopScorerBars(
  rows: DashboardPlayer[],
  limit = 12
): CategoryBar[] {
  return [...rows]
    .map((r) => ({
      id: r.playerId,
      label: r.playerName.split(" ").slice(-1)[0] ?? r.playerName,
      value: perGame(r.points, r.gamesPlayed),
      count: r.gamesPlayed,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export interface DashboardSelection {
  positions: string[];
  teams: string[];
  usgBins: string[];
  tsBins: string[];
  perBins: string[];
}

export function emptySelection(): DashboardSelection {
  return {
    positions: [],
    teams: [],
    usgBins: [],
    tsBins: [],
    perBins: [],
  };
}

export function applyDashboardSelection(
  rows: DashboardPlayer[],
  selection: DashboardSelection,
  bins: {
    usg: HistogramBin[];
    ts: HistogramBin[];
    per: HistogramBin[];
  }
): DashboardPlayer[] {
  const positions = new Set(selection.positions);
  const teams = new Set(selection.teams);
  const usgBins = new Set(selection.usgBins);
  const tsBins = new Set(selection.tsBins);
  const perBins = new Set(selection.perBins);

  return rows.filter((row) => {
    if (positions.size > 0 && !positions.has(row.position ?? "UNK")) {
      return false;
    }
    const teamKey = nbaTeamAbbr(row.teamId, row.teamAbbreviation);
    if (teams.size > 0 && !teams.has(teamKey)) return false;
    if (
      !rowInHistogramBins(
        row,
        DASHBOARD_METRICS.usagePct,
        usgBins,
        bins.usg
      )
    ) {
      return false;
    }
    if (
      !rowInHistogramBins(
        row,
        DASHBOARD_METRICS.trueShootingPct,
        tsBins,
        bins.ts
      )
    ) {
      return false;
    }
    if (
      !rowInHistogramBins(row, DASHBOARD_METRICS.per, perBins, bins.per)
    ) {
      return false;
    }
    return true;
  });
}

export function selectionActive(selection: DashboardSelection): boolean {
  return (
    selection.positions.length +
      selection.teams.length +
      selection.usgBins.length +
      selection.tsBins.length +
      selection.perBins.length >
    0
  );
}

export function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
