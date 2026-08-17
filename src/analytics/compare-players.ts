import type {
  ComparisonDimension,
  PlayerComparisonResult,
} from "@/analytics/types";
import type { PlayerSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import { METRIC_PICKERS } from "@/lib/player-stat-comps";

function percentileOf(value: number, pool: number[], invert = false): number {
  if (!pool.length || !Number.isFinite(value)) return 50;
  const below = pool.filter((v) => v < value).length;
  const raw = (below / pool.length) * 100;
  return invert ? 100 - raw : raw;
}

function perGame(row: PlayerSeason, key: keyof PlayerSeason): number {
  const raw = row[key];
  const total = typeof raw === "number" ? raw : 0;
  return total / Math.max(1, row.gamesPlayed);
}

type DimSpec = {
  id: string;
  label: string;
  metricId?: keyof typeof METRIC_PICKERS;
  pick?: (row: PlayerSeason) => number | null;
  format?: (v: number) => string;
  invert?: boolean;
};

const DIMENSIONS: DimSpec[] = [
  { id: "overall", label: "Overall", metricId: "darko" },
  { id: "offense", label: "Offense", metricId: "ortg" },
  { id: "defense", label: "Defense", metricId: "drtg", invert: true },
  { id: "shooting", label: "Shooting", metricId: "ts" },
  { id: "playmaking", label: "Playmaking", metricId: "ast" },
  { id: "rebounding", label: "Rebounding", metricId: "reb" },
  { id: "usage", label: "Usage", metricId: "usg" },
  {
    id: "scoring",
    label: "Scoring volume",
    pick: (r) => perGame(r, "points"),
    format: (v) => `${formatNumber(v, 1)} PPG`,
  },
];

function resolvePicker(spec: DimSpec): {
  pick: (row: PlayerSeason) => number | null;
  format: (v: number) => string;
  invert: boolean;
} | null {
  if (spec.metricId) {
    const picker = METRIC_PICKERS[spec.metricId];
    if (!picker) return null;
    return {
      pick: picker.pick,
      format: picker.format,
      invert: Boolean(spec.invert),
    };
  }
  if (spec.pick && spec.format) {
    return {
      pick: spec.pick,
      format: spec.format,
      invert: Boolean(spec.invert),
    };
  }
  return null;
}

function fallbackOverall(row: PlayerSeason): number | null {
  if (row.darkoDpm != null) return row.darkoDpm;
  if (row.lebron != null) return row.lebron;
  if (row.netRating != null && Number.isFinite(row.netRating)) return row.netRating;
  if (row.trueShootingPct != null && row.trueShootingPct > 0) {
    return row.trueShootingPct;
  }
  return null;
}

/**
 * Side-by-side player comparison using season rows + peer percentiles.
 */
export function buildPlayerComparison(options: {
  a: PlayerSeason;
  b: PlayerSeason;
  peers: PlayerSeason[];
}): PlayerComparisonResult {
  const { a, b, peers } = options;
  const qualified = peers.filter(
    (p) =>
      p.gamesPlayed >= 15 && p.minutes / Math.max(1, p.gamesPlayed) >= 12
  );
  const pool = qualified.length ? qualified : peers;

  const dimensions: ComparisonDimension[] = [];

  for (const spec of DIMENSIONS) {
    let picker = resolvePicker(spec);
    if (spec.id === "overall" && picker) {
      const aVal = picker.pick(a);
      const bVal = picker.pick(b);
      if (aVal == null && bVal == null) {
        picker = {
          pick: fallbackOverall,
          format: (v) => formatNumber(v, 2),
          invert: false,
        };
      }
    }
    if (!picker) continue;

    const aRaw = picker.pick(a);
    const bRaw = picker.pick(b);
    if (aRaw == null && bRaw == null) continue;

    const values = pool
      .map((row) => picker!.pick(row))
      .filter((n): n is number => n != null && Number.isFinite(n));

    const aPct =
      aRaw != null ? percentileOf(aRaw, values, picker.invert) : undefined;
    const bPct =
      bRaw != null ? percentileOf(bRaw, values, picker.invert) : undefined;

    const aDisplay =
      aPct != null
        ? `${Math.round(aPct)}th %ile`
        : aRaw != null
          ? picker.format(aRaw)
          : "—";
    const bDisplay =
      bPct != null
        ? `${Math.round(bPct)}th %ile`
        : bRaw != null
          ? picker.format(bRaw)
          : "—";

    let delta: number | undefined;
    if (aPct != null && bPct != null) delta = aPct - bPct;
    else if (aRaw != null && bRaw != null) {
      delta = picker.invert ? bRaw - aRaw : aRaw - bRaw;
    }

    dimensions.push({
      id: spec.id,
      label: spec.label,
      aDisplay,
      bDisplay,
      aValue: aPct ?? aRaw ?? undefined,
      bValue: bPct ?? bRaw ?? undefined,
      delta,
    });
  }

  // Ensure shooting shows raw TS if percentiles missing
  if (!dimensions.some((d) => d.id === "shooting")) {
    const aTs =
      a.trueShootingPct != null && a.trueShootingPct > 0
        ? a.trueShootingPct
        : null;
    const bTs =
      b.trueShootingPct != null && b.trueShootingPct > 0
        ? b.trueShootingPct
        : null;
    if (aTs != null || bTs != null) {
      dimensions.push({
        id: "shooting",
        label: "Shooting",
        aDisplay: aTs != null ? formatPct(aTs) : "—",
        bDisplay: bTs != null ? formatPct(bTs) : "—",
        aValue: aTs ?? undefined,
        bValue: bTs ?? undefined,
        delta: aTs != null && bTs != null ? aTs - bTs : undefined,
      });
    }
  }

  const differenceSummary = buildDifferenceSummary(
    a.playerName,
    b.playerName,
    dimensions
  );

  return {
    aId: a.playerId,
    bId: b.playerId,
    aName: a.playerName,
    bName: b.playerName,
    season: a.season,
    dimensions,
    differenceSummary,
  };
}

function buildDifferenceSummary(
  aName: string,
  bName: string,
  dimensions: ComparisonDimension[]
): string[] {
  const scored = dimensions
    .filter((d) => d.delta != null && Number.isFinite(d.delta))
    .map((d) => ({ ...d, abs: Math.abs(d.delta!) }))
    .filter((d) => d.abs >= 5)
    .sort((x, y) => y.abs - x.abs);

  if (!scored.length) {
    return [
      "Available season metrics are close across the compared dimensions. Small gaps may reflect sample noise rather than a clear profile difference.",
    ];
  }

  const lines: string[] = [];
  const aEdges = scored.filter((d) => d.delta! > 0).slice(0, 2);
  const bEdges = scored.filter((d) => d.delta! < 0).slice(0, 2);

  if (aEdges.length) {
    lines.push(
      `${aName} leads on ${aEdges.map((d) => d.label.toLowerCase()).join(" and ")} (${aEdges
        .map((d) => `${d.aDisplay} vs ${d.bDisplay}`)
        .join("; ")}).`
    );
  }
  if (bEdges.length) {
    lines.push(
      `${bName} leads on ${bEdges.map((d) => d.label.toLowerCase()).join(" and ")} (${bEdges
        .map((d) => `${d.bDisplay} vs ${d.aDisplay}`)
        .join("; ")}).`
    );
  }
  lines.push(
    "Edges are percentile gaps among qualified peers this season, not a declaration of who is better overall."
  );
  return lines;
}
