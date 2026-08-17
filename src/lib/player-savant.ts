import type { PlayerPercentile, PercentileSide } from "@/data/queries";
import type { PlayerSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import { perGame } from "@/data/providers/nba/compute-advanced";
import { isDarkoSeasonAvailable } from "@/data/providers/nba/darko-scraper";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";

export interface SavantMetric {
  key: string;
  label: string;
  /** Displayed value, or null ??"?? */
  display: string | null;
  /** Raw numeric for career ranking / animation; null when unavailable. */
  value: number | null;
  /** When false, lower raw values rank higher (e.g. DRtg). Default true. */
  higherBetter: boolean;
  percentile: number | null;
  quality: number | null;
  side: PercentileSide;
}

export interface SavantSection {
  id: string;
  title: string;
  metrics: SavantMetric[];
}

export interface SavantFrame {
  season: string;
  sections: SavantSection[];
}

function pctLookup(
  percentiles: PlayerPercentile[],
  key: string
): PlayerPercentile | undefined {
  return percentiles.find((p) => p.key === key);
}

function metric(
  percentiles: PlayerPercentile[],
  key: string,
  label: string,
  display: string | null,
  value: number | null,
  side: PercentileSide,
  options: { missing?: boolean; higherBetter?: boolean } = {}
): SavantMetric {
  const higherBetter = options.higherBetter ?? true;
  if (options.missing || value == null) {
    return {
      key,
      label,
      display: null,
      value: null,
      higherBetter,
      percentile: null,
      quality: null,
      side,
    };
  }
  const hit = pctLookup(percentiles, key);
  return {
    key,
    label,
    display,
    value,
    higherBetter,
    percentile: hit?.percentile ?? null,
    quality: hit?.quality ?? null,
    side,
  };
}

/**
 * Baseball Savant?뱒tyle sections for an NBA player-season:
 * Value (impact) ??Offense ??Defense.
 */
export function buildSavantSections(
  row: PlayerSeason,
  percentiles: PlayerPercentile[] = []
): SavantSection[] {
  const darkoMissing = !isDarkoSeasonAvailable(row.season);
  const pts36 =
    row.minutes > 0 ? row.points / (row.minutes / 36) : 0;
  const ast36 =
    row.minutes > 0 ? row.assists / (row.minutes / 36) : 0;
  const reb36 =
    row.minutes > 0 ? row.rebounds / (row.minutes / 36) : 0;
  const stl36 =
    row.minutes > 0 ? row.steals / (row.minutes / 36) : 0;
  const blk36 =
    row.minutes > 0 ? row.blocks / (row.minutes / 36) : 0;
  const ptsG = perGame(row.points, row.gamesPlayed);

  return [
    {
      id: "value",
      title: "Value",
      metrics: [
        metric(
          percentiles,
          "oDpm",
          "Offensive DPM",
          darkoMissing ? null : formatSigned(row.oDpm, 1),
          darkoMissing ? null : row.oDpm,
          "offense",
          { missing: darkoMissing }
        ),
        metric(
          percentiles,
          "dDpm",
          "Defensive DPM",
          darkoMissing ? null : formatSigned(row.dDpm, 1),
          darkoMissing ? null : row.dDpm,
          "defense",
          { missing: darkoMissing }
        ),
        metric(
          percentiles,
          "dpm",
          "Overall DPM",
          darkoMissing ? null : formatSigned(row.dpm, 1),
          darkoMissing ? null : row.dpm,
          "overall",
          { missing: darkoMissing }
        ),
        metric(
          percentiles,
          "drbl100",
          "DRBL/100",
          hasValidDrblEstimate(row) ? formatSigned(row.drbl100, 1) : null,
          hasValidDrblEstimate(row) ? row.drbl100 : null,
          "overall",
          { missing: !hasValidDrblEstimate(row) }
        ),
        metric(
          percentiles,
          "r1Points",
          "R1 Points",
          row.r1Points != null ? formatSigned(row.r1Points, 1) : null,
          row.r1Points,
          "overall",
          { missing: row.r1Points == null }
        ),
        metric(
          percentiles,
          "r1WinEquivalents",
          "R1 Win Eq.",
          row.r1WinEquivalents != null
            ? formatSigned(row.r1WinEquivalents, 2)
            : null,
          row.r1WinEquivalents,
          "overall",
          { missing: row.r1WinEquivalents == null }
        ),
        metric(
          percentiles,
          "drblP",
          "DRBL-P",
          hasValidDrblEstimate(row) ? formatSigned(row.drblP, 1) : null,
          hasValidDrblEstimate(row) ? row.drblP : null,
          "overall",
          { missing: !hasValidDrblEstimate(row) }
        ),
        metric(
          percentiles,
          "drblLn",
          "DRBL-LN",
          hasValidDrblEstimate(row) ? formatSigned(row.drblLn, 1) : null,
          hasValidDrblEstimate(row) ? row.drblLn : null,
          "overall",
          { missing: !hasValidDrblEstimate(row) }
        ),
        metric(
          percentiles,
          "drblB",
          "DRBL-B",
          hasValidDrblEstimate(row) ? formatSigned(row.drblB, 1) : null,
          hasValidDrblEstimate(row) ? row.drblB : null,
          "overall",
          { missing: !hasValidDrblEstimate(row) }
        ),
        metric(
          percentiles,
          "drblO",
          "DRBL-O",
          hasValidDrblEstimate(row) ? formatSigned(row.drblO, 1) : null,
          hasValidDrblEstimate(row) ? row.drblO : null,
          "offense",
          { missing: !hasValidDrblEstimate(row) }
        ),
        metric(
          percentiles,
          "drblD",
          "DRBL-D",
          hasValidDrblEstimate(row) ? formatSigned(row.drblD, 1) : null,
          hasValidDrblEstimate(row) ? row.drblD : null,
          "defense",
          { missing: !hasValidDrblEstimate(row) }
        ),
        metric(
          percentiles,
          "vorp",
          "VORP",
          formatNumber(row.vorp, 1),
          row.vorp,
          "overall"
        ),
        metric(
          percentiles,
          "bpm",
          "BPM",
          formatSigned(row.bpm, 1),
          row.bpm,
          "overall"
        ),
      ],
    },
    {
      id: "offense",
      title: "Offense",
      metrics: [
        metric(
          percentiles,
          "trueShootingPct",
          "TS%",
          formatPct(row.trueShootingPct ?? 0),
          row.trueShootingPct ?? null,
          "offense"
        ),
        metric(
          percentiles,
          "effectiveFieldGoalPct",
          "eFG%",
          formatPct(row.effectiveFieldGoalPct ?? 0),
          row.effectiveFieldGoalPct ?? null,
          "offense"
        ),
        metric(
          percentiles,
          "threePointPct",
          "3P%",
          formatPct(row.threePointPct),
          row.threePointPct,
          "offense"
        ),
        metric(
          percentiles,
          "usagePct",
          "USG%",
          formatPct(row.usagePct ?? 0),
          row.usagePct ?? null,
          "offense"
        ),
        metric(
          percentiles,
          "assistPct",
          "AST%",
          formatPct(row.assistPct),
          row.assistPct,
          "offense"
        ),
        metric(
          percentiles,
          "offensiveRating",
          "ORtg",
          (row.offensiveRating ?? 0) > 0
            ? formatNumber(row.offensiveRating ?? 0, 1)
            : null,
          (row.offensiveRating ?? 0) > 0 ? (row.offensiveRating ?? null) : null,
          "offense",
          { missing: (row.offensiveRating ?? 0) <= 0 }
        ),
        metric(
          percentiles,
          "obpm",
          "OBPM",
          formatSigned(row.obpm, 1),
          row.obpm,
          "offense"
        ),
        metric(
          percentiles,
          "pointsPer36",
          "PTS/36",
          formatNumber(pts36, 1),
          pts36,
          "offense"
        ),
        metric(
          percentiles,
          "assistRate",
          "AST/36",
          formatNumber(ast36, 1),
          ast36,
          "offense"
        ),
        metric(
          percentiles,
          "pointsPerGame",
          "PTS/G",
          formatNumber(ptsG, 1),
          ptsG,
          "offense"
        ),
      ],
    },
    {
      id: "defense",
      title: "Defense",
      metrics: [
        metric(
          percentiles,
          "defensiveRating",
          "DRtg",
          (row.defensiveRating ?? 0) > 0
            ? formatNumber(row.defensiveRating ?? 0, 1)
            : null,
          (row.defensiveRating ?? 0) > 0 ? (row.defensiveRating ?? null) : null,
          "defense",
          { missing: (row.defensiveRating ?? 0) <= 0, higherBetter: false }
        ),
        metric(
          percentiles,
          "dbpm",
          "DBPM",
          formatSigned(row.dbpm, 1),
          row.dbpm,
          "defense"
        ),
        metric(
          percentiles,
          "dws",
          "DWS",
          formatNumber(row.dws, 1),
          row.dws,
          "defense"
        ),
        metric(
          percentiles,
          "stealRate",
          "STL/36",
          formatNumber(stl36, 1),
          stl36,
          "defense"
        ),
        metric(
          percentiles,
          "blockRate",
          "BLK/36",
          formatNumber(blk36, 1),
          blk36,
          "defense"
        ),
        metric(
          percentiles,
          "reboundRate",
          "REB/36",
          formatNumber(reb36, 1),
          reb36,
          "defense"
        ),
      ],
    },
  ];
}

function formatSigned(value: number, digits: number): string {
  const body = formatNumber(Math.abs(value), digits);
  if (value > 0) return `+${body}`;
  if (value < 0) return `-${body}`;
  return body;
}

/**
 * Build one Savant frame per career season, then stamp career-relative
 * percentiles so play mode can move markers as the player grows/declines.
 */
export function buildSavantCareerFrames(
  seasons: PlayerSeason[]
): SavantFrame[] {
  const chronological = [...seasons]
    .filter((row) => row.gamesPlayed > 0)
    .sort((a, b) => a.season.localeCompare(b.season));

  const frames: SavantFrame[] = chronological.map((row) => ({
    season: row.season,
    sections: buildSavantSections(row, []),
  }));

  return attachCareerPercentiles(frames);
}

function attachCareerPercentiles(frames: SavantFrame[]): SavantFrame[] {
  if (frames.length === 0) return frames;

  const keys = new Map<string, { higherBetter: boolean }>();
  for (const metric of frames[0]?.sections.flatMap((s) => s.metrics) ?? []) {
    keys.set(metric.key + "::" + metric.label, {
      higherBetter: metric.higherBetter,
    });
  }

  const ranks = new Map<string, Map<string, number>>();

  for (const [composite, meta] of keys) {
    const [key, label] = composite.split("::");
    const samples: Array<{ season: string; value: number }> = [];
    for (const frame of frames) {
      const hit = frame.sections
        .flatMap((s) => s.metrics)
        .find((m) => m.key === key && m.label === label);
      if (hit?.value == null || hit.display == null) continue;
      // Skip all-zero impact placeholders and model default zeros
      if (
        [
          "dpm",
          "oDpm",
          "dDpm",
          "vorp",
          "bpm",
          "obpm",
          "dbpm",
          "dws",
          "usagePct",
          "assistPct",
          "r1Points",
          "r1WinEquivalents",
          "drbl100",
          "drblP",
          "drblLn",
          "drblB",
          "drblO",
          "drblD",
        ].includes(key) &&
        hit.value === 0
      ) {
        continue;
      }
      samples.push({ season: frame.season, value: hit.value });
    }
    if (samples.length === 0) continue;

    const sorted = [...samples].sort((a, b) => a.value - b.value);
    const bySeason = new Map<string, number>();
    for (const sample of samples) {
      let below = 0;
      for (const other of sorted) {
        if (other.value < sample.value) below += 1;
        else if (other.value === sample.value) below += 0.5;
      }
      let pct = (below / sorted.length) * 100;
      if (!meta.higherBetter) pct = 100 - pct;
      bySeason.set(
        sample.season,
        Math.max(1, Math.min(100, Math.round(pct)))
      );
    }
    ranks.set(composite, bySeason);
  }

  return frames.map((frame) => ({
    season: frame.season,
    sections: frame.sections.map((section) => ({
      ...section,
      metrics: section.metrics.map((m) => {
        const composite = `${m.key}::${m.label}`;
        const pct = ranks.get(composite)?.get(frame.season) ?? null;
        if (pct == null) {
          return { ...m, percentile: null, quality: null };
        }
        return {
          ...m,
          percentile: pct,
          quality: pct / 100,
        };
      }),
    })),
  }));
}

export interface CareerTimelineMetric {
  key: string;
  label: string;
  /** Raw numeric value for charting. */
  value: (row: PlayerSeason) => number;
  format: (value: number) => string;
  /** Y-axis domain hint. */
  kind: "rate" | "count" | "plusMinus";
}

/** Metrics available for career growth timeline. */
export const CAREER_TIMELINE_METRICS: CareerTimelineMetric[] = [
  {
    key: "dpm",
    label: "DPM",
    value: (r) => r.dpm,
    format: (v) => formatSigned(v, 1),
    kind: "plusMinus",
  },
  {
    key: "r1Points",
    label: "R1 Points",
    value: (r) => r.r1Points ?? 0,
    format: (v) => formatSigned(v, 1),
    kind: "plusMinus",
  },
  {
    key: "r1WinEquivalents",
    label: "R1 Win Eq.",
    value: (r) => r.r1WinEquivalents ?? 0,
    format: (v) => formatSigned(v, 2),
    kind: "plusMinus",
  },
  {
    key: "drbl100",
    label: "DRBL/100",
    value: (r) => r.drbl100,
    format: (v) => formatSigned(v, 1),
    kind: "plusMinus",
  },
  {
    key: "drblP",
    label: "DRBL-P",
    value: (r) => r.drblP,
    format: (v) => formatSigned(v, 1),
    kind: "plusMinus",
  },
  {
    key: "drblLn",
    label: "DRBL-LN",
    value: (r) => r.drblLn,
    format: (v) => formatSigned(v, 1),
    kind: "plusMinus",
  },
  {
    key: "drblB",
    label: "DRBL-B",
    value: (r) => r.drblB,
    format: (v) => formatSigned(v, 1),
    kind: "plusMinus",
  },
  {
    key: "oDpm",
    label: "O-DPM",
    value: (r) => r.oDpm,
    format: (v) => formatSigned(v, 1),
    kind: "plusMinus",
  },
  {
    key: "dDpm",
    label: "D-DPM",
    value: (r) => r.dDpm,
    format: (v) => formatSigned(v, 1),
    kind: "plusMinus",
  },
  {
    key: "trueShootingPct",
    label: "TS%",
    value: (r) => (r.trueShootingPct ?? 0) * 100,
    format: (v) => `${v.toFixed(1)}%`,
    kind: "rate",
  },
  {
    key: "usagePct",
    label: "USG%",
    value: (r) => (r.usagePct ?? 0) * 100,
    format: (v) => `${v.toFixed(1)}%`,
    kind: "rate",
  },
  {
    key: "pointsPerGame",
    label: "PTS/G",
    value: (r) => perGame(r.points, r.gamesPlayed),
    format: (v) => formatNumber(v, 1),
    kind: "count",
  },
  {
    key: "assistsPerGame",
    label: "AST/G",
    value: (r) => perGame(r.assists, r.gamesPlayed),
    format: (v) => formatNumber(v, 1),
    kind: "count",
  },
  {
    key: "reboundsPerGame",
    label: "REB/G",
    value: (r) => perGame(r.rebounds, r.gamesPlayed),
    format: (v) => formatNumber(v, 1),
    kind: "count",
  },
  {
    key: "threePointPct",
    label: "3P%",
    value: (r) => r.threePointPct * 100,
    format: (v) => `${v.toFixed(1)}%`,
    kind: "rate",
  },
  {
    key: "effectiveFieldGoalPct",
    label: "eFG%",
    value: (r) => (r.effectiveFieldGoalPct ?? 0) * 100,
    format: (v) => `${v.toFixed(1)}%`,
    kind: "rate",
  },
  {
    key: "minutesPerGame",
    label: "MIN/G",
    value: (r) => perGame(r.minutes, r.gamesPlayed),
    format: (v) => formatNumber(v, 1),
    kind: "count",
  },
  {
    key: "per",
    label: "PER",
    value: (r) => r.per,
    format: (v) => formatNumber(v, 1),
    kind: "count",
  },
  {
    key: "vorp",
    label: "VORP",
    value: (r) => r.vorp,
    format: (v) => formatNumber(v, 1),
    kind: "count",
  },
  {
    key: "bpm",
    label: "BPM",
    value: (r) => r.bpm,
    format: (v) => formatSigned(v, 1),
    kind: "plusMinus",
  },
];
