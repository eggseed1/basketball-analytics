import type {
  ComparisonDimension,
  PlayerComparisonResult,
} from "@/analytics/types";
import type { PlayerSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
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

type DimGroup = NonNullable<ComparisonDimension["group"]>;

type DimSpec = {
  id: string;
  label: string;
  metricId?: keyof typeof METRIC_PICKERS;
  pick?: (row: PlayerSeason) => number | null;
  format?: (v: number) => string;
  invert?: boolean;
  group?: DimGroup;
};

const DIMENSIONS: DimSpec[] = [
  { id: "overall", label: "Overall (DRBL/100)", metricId: "drbl100", group: "rate_ability" },
  { id: "drbl_o", label: "DRBL-O", metricId: "drblO", group: "rate_ability" },
  { id: "drbl_d", label: "DRBL-D", metricId: "drblD", group: "rate_ability" },
  { id: "r1_points", label: "R1 Points", metricId: "r1Points", group: "realized_value" },
  {
    id: "r1_win_eq",
    label: "R1 Win Equivalents",
    metricId: "r1WinEq",
    group: "realized_value",
  },
  { id: "darko", label: "DARKO DPM", metricId: "darko", group: "external" },
  { id: "offense", label: "Offense", metricId: "ortg", group: "box" },
  { id: "defense", label: "Defense", metricId: "drtg", invert: true, group: "box" },
  { id: "shooting", label: "Shooting", metricId: "ts", group: "box" },
  { id: "playmaking", label: "Playmaking", metricId: "ast", group: "box" },
  { id: "rebounding", label: "Rebounding", metricId: "reb", group: "box" },
  { id: "usage", label: "Usage", metricId: "usg", group: "box" },
  {
    id: "scoring",
    label: "Scoring volume",
    pick: (r) => perGame(r, "points"),
    format: (v) => `${formatNumber(v, 1)} PPG`,
    group: "box",
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
  if (hasValidDrblEstimate(row)) return row.drbl100;
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
    let label = spec.label;
    let note: string | undefined;

    if (spec.id === "overall" && picker) {
      const aDrbl = METRIC_PICKERS.drbl100.pick(a);
      const bDrbl = METRIC_PICKERS.drbl100.pick(b);
      if (aDrbl != null && bDrbl != null) {
        // Same-season comparable DRBL — keep picker.
        label = "Overall (DRBL/100)";
      } else if (aDrbl != null || bDrbl != null) {
        // Asymmetric DRBL — unavailable for overall (never cross-metric).
        dimensions.push({
          id: "overall",
          label: "Overall (DRBL/100)",
          aDisplay: aDrbl != null ? formatNumber(aDrbl, 2) : "Unavailable",
          bDisplay: bDrbl != null ? formatNumber(bDrbl, 2) : "Unavailable",
          aValue: aDrbl ?? undefined,
          bValue: bDrbl ?? undefined,
          group: "rate_ability",
          note: "Overall DRBL edge requires valid estimates on both sides — never cross-compared to DARKO.",
        });
        continue;
      } else {
        const aDarko = a.darkoDpm;
        const bDarko = b.darkoDpm;
        if (aDarko != null && bDarko != null) {
          picker = {
            pick: (r) => r.darkoDpm ?? null,
            format: (v) => formatNumber(v, 2),
            invert: false,
          };
          label = "Overall (DARKO)";
          note = "DRBL unavailable for both — using season-true DARKO as external overall.";
        } else if (aValMissingBoth(a, b)) {
          picker = {
            pick: fallbackOverall,
            format: (v) => formatNumber(v, 2),
            invert: false,
          };
          label = "Overall";
          note = "Fallback overall among available season-true metrics.";
        } else {
          continue;
        }
      }
    }
    if (!picker) continue;

    const aRaw = picker.pick(a);
    const bRaw = picker.pick(b);
    if (aRaw == null && bRaw == null) continue;

    // Same-metric both-sides for rate/value groups — show Unavailable not 0.
    if (
      (spec.group === "rate_ability" || spec.group === "realized_value") &&
      (aRaw == null || bRaw == null)
    ) {
      dimensions.push({
        id: spec.id,
        label,
        aDisplay: aRaw != null ? picker.format(aRaw) : "Unavailable",
        bDisplay: bRaw != null ? picker.format(bRaw) : "Unavailable",
        aValue: aRaw ?? undefined,
        bValue: bRaw ?? undefined,
        group: spec.group,
        note:
          note ??
          "Metric unavailable for at least one side this season (not shown as 0).",
      });
      continue;
    }

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
      label,
      aDisplay,
      bDisplay,
      aValue: aPct ?? aRaw ?? undefined,
      bValue: bPct ?? bRaw ?? undefined,
      delta,
      group: spec.group,
      note,
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
        group: "box",
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

function aValMissingBoth(a: PlayerSeason, b: PlayerSeason): boolean {
  return fallbackOverall(a) != null || fallbackOverall(b) != null;
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
