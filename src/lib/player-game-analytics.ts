/**
 * Pure helpers for game-log analytics visuals (P18C.1.3).
 */

import { efgPct, fgPct, tsPct } from "@/lib/player-page-contract";
import type { CompactPlayerGameLogRow } from "@/data/history/player-game-log";
import type { SplitAggregate } from "@/data/history/player-game-log";

export type GameTrendMetric = "points" | "rebounds" | "assists" | "minutesNum" | "tsPct" | "threePm";

export type GameTrendPoint = {
  gameId: string;
  date: string;
  opponentAbbr: string;
  value: number;
  seasonAvg: number;
};

export function gameTs(g: CompactPlayerGameLogRow): number | null {
  return tsPct(g.points, g.fga, g.fta);
}

export function metricValue(
  g: CompactPlayerGameLogRow,
  metric: GameTrendMetric
): number | null {
  if (metric === "tsPct") return gameTs(g);
  const v = g[metric];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function buildGameTrend(
  gamesChronological: CompactPlayerGameLogRow[],
  metric: GameTrendMetric
): GameTrendPoint[] {
  const vals = gamesChronological
    .map((g) => metricValue(g, metric))
    .filter((v): v is number => v != null);
  const seasonAvg =
    vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return gamesChronological
    .map((g) => {
      const value = metricValue(g, metric);
      if (value == null) return null;
      return {
        gameId: g.gameId,
        date: g.date,
        opponentAbbr: g.opponentAbbr,
        value,
        seasonAvg,
      };
    })
    .filter((x): x is GameTrendPoint => x != null);
}

export function buildRollingSeries(
  gamesChronological: CompactPlayerGameLogRow[],
  metric: GameTrendMetric,
  window: number
): Array<{ date: string; gameId: string; value: number }> {
  const out: Array<{ date: string; gameId: string; value: number }> = [];
  for (let i = 0; i < gamesChronological.length; i++) {
    const slice = gamesChronological.slice(Math.max(0, i + 1 - window), i + 1);
    const vals = slice
      .map((g) => metricValue(g, metric))
      .filter((v): v is number => v != null);
    if (!vals.length) continue;
    const g = gamesChronological[i]!;
    out.push({
      date: g.date,
      gameId: g.gameId,
      value: vals.reduce((a, b) => a + b, 0) / vals.length,
    });
  }
  return out;
}

export type DistributionSummary = {
  metric: GameTrendMetric;
  values: number[];
  mean: number;
  median: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  bins: Array<{ label: string; count: number; mid: number }>;
};

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base]!;
  const b = sorted[Math.min(sorted.length - 1, base + 1)]!;
  return a + rest * (b - a);
}

export function buildGameDistribution(
  games: CompactPlayerGameLogRow[],
  metric: GameTrendMetric,
  binCount = 10
): DistributionSummary {
  const values = games
    .map((g) => metricValue(g, metric))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  if (!values.length) {
    return {
      metric,
      values: [],
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      bins: [],
    };
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = values[0]!;
  const max = values[values.length - 1]!;
  const bins: DistributionSummary["bins"] = [];
  const span = max - min || 1;
  for (let i = 0; i < binCount; i++) {
    const lo = min + (span * i) / binCount;
    const hi = min + (span * (i + 1)) / binCount;
    const count = values.filter((v) =>
      i === binCount - 1 ? v >= lo && v <= hi : v >= lo && v < hi
    ).length;
    bins.push({
      label: `${lo.toFixed(metric === "tsPct" ? 2 : 0)}–${hi.toFixed(
        metric === "tsPct" ? 2 : 0
      )}`,
      count,
      mid: (lo + hi) / 2,
    });
  }
  return {
    metric,
    values,
    mean,
    median: quantile(values, 0.5),
    min,
    max,
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
    bins,
  };
}

export type RecentVsSeason = {
  last5: { points: number; rebounds: number; assists: number; tsPct: number | null };
  season: { points: number; rebounds: number; assists: number; tsPct: number | null };
  delta: { points: number; rebounds: number; assists: number; tsPct: number | null };
};

function avgLine(games: CompactPlayerGameLogRow[]) {
  const n = Math.max(1, games.length);
  const pts = games.reduce((a, g) => a + g.points, 0) / n;
  const reb = games.reduce((a, g) => a + g.rebounds, 0) / n;
  const ast = games.reduce((a, g) => a + g.assists, 0) / n;
  const t = games.reduce(
    (acc, g) => {
      acc.pts += g.points;
      acc.fga += g.fga;
      acc.fta += g.fta;
      return acc;
    },
    { pts: 0, fga: 0, fta: 0 }
  );
  return {
    points: pts,
    rebounds: reb,
    assists: ast,
    tsPct: tsPct(t.pts, t.fga, t.fta),
  };
}

export function buildRecentVsSeason(
  gamesChronologicalNewestFirst: CompactPlayerGameLogRow[]
): RecentVsSeason {
  const last5 = avgLine(gamesChronologicalNewestFirst.slice(0, 5));
  const season = avgLine(gamesChronologicalNewestFirst);
  return {
    last5,
    season,
    delta: {
      points: last5.points - season.points,
      rebounds: last5.rebounds - season.rebounds,
      assists: last5.assists - season.assists,
      tsPct:
        last5.tsPct != null && season.tsPct != null
          ? last5.tsPct - season.tsPct
          : null,
    },
  };
}

export type SplitRates = SplitAggregate & {
  ptsPerG: number;
  rebPerG: number;
  astPerG: number;
  tovPerG: number;
  minPerG: number;
  fgPct: number | null;
  threePct: number | null;
  ftPct: number | null;
  efg: number | null;
  ts: number | null;
};

export function withSplitRates(s: SplitAggregate): SplitRates {
  const g = Math.max(1, s.games);
  return {
    ...s,
    ptsPerG: s.points / g,
    rebPerG: s.rebounds / g,
    astPerG: s.assists / g,
    tovPerG: s.turnovers / g,
    minPerG: s.minutes / g,
    fgPct: fgPct(s.fgm, s.fga),
    threePct: fgPct(s.threePm, s.threePa),
    ftPct: fgPct(s.ftm, s.fta),
    efg: efgPct(s.fgm, s.fga, s.threePm),
    ts: tsPct(s.points, s.fga, s.fta),
  };
}

export type SplitDelta = {
  label: string;
  games: number;
  minutes: number;
  deltas: Record<string, number | null>;
};

export function buildSplitDeltas(
  splits: SplitAggregate[],
  baseline: SplitAggregate
): SplitDelta[] {
  const base = withSplitRates(baseline);
  return splits.map((s) => {
    const r = withSplitRates(s);
    return {
      label: s.label,
      games: s.games,
      minutes: s.minutes,
      deltas: {
        PTS: r.ptsPerG - base.ptsPerG,
        REB: r.rebPerG - base.rebPerG,
        AST: r.astPerG - base.astPerG,
        "FG%":
          r.fgPct != null && base.fgPct != null ? r.fgPct - base.fgPct : null,
        "3P%":
          r.threePct != null && base.threePct != null
            ? r.threePct - base.threePct
            : null,
        "TS%": r.ts != null && base.ts != null ? r.ts - base.ts : null,
        TOV: r.tovPerG - base.tovPerG,
      },
    };
  });
}

export function chronologicalOldestFirst(
  games: CompactPlayerGameLogRow[]
): CompactPlayerGameLogRow[] {
  return [...games].sort((a, b) =>
    a.date === b.date
      ? a.gameId.localeCompare(b.gameId)
      : a.date.localeCompare(b.date)
  );
}
