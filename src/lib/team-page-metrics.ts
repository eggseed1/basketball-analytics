/**
 * Team-page ranked metrics from the season board.
 * Does not invent ORtg / DRtg / Pace / SRS when the board has no feed.
 */

import type { TeamTrait } from "@/analytics";
import type { TeamSeasonStats } from "@/data/types";
import type { StandingRow } from "@/data/types/standings";
import { formatNumber, formatOrdinal, formatPct } from "@/lib/format";

export type RankedMetric = {
  key: string;
  label: string;
  formattedValue: string;
  value: number | null;
  rank: number | null;
  rankDenominator: number | null;
  /** Appended to the rank line, e.g. "in the West". */
  rankScope?: string;
  percentile: number | null;
  leagueAverage: number | null;
  differenceFromAverage: number | null;
  previousFormatted: string | null;
  direction: "higher" | "lower";
  sample: number | null;
  source: string;
  missingReason: string | null;
  group: "scorecard" | "offense" | "defense" | "factors";
};

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

function rankPool(
  value: number,
  pool: number[],
  invert: boolean
): { rank: number; percentile: number; avg: number } {
  const n = pool.length || 1;
  const better = invert
    ? pool.filter((v) => v < value).length
    : pool.filter((v) => v > value).length;
  const worse = invert
    ? pool.filter((v) => v > value).length
    : pool.filter((v) => v < value).length;
  // Best team = 100, worst = 0, whichever direction is "better".
  const percentile = n > 1 ? (worse / (n - 1)) * 100 : 50;
  const avg = pool.reduce((a, b) => a + b, 0) / n;
  return { rank: better + 1, percentile, avg };
}

const RATE_KEYS = new Set(["ts", "efg", "fg3", "3par", "orb", "ftr"]);

/** Signed delta: percentage points for rate stats, plain numbers otherwise. */
export function formatMetricDelta(key: string, delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const abs = Math.abs(delta);
  if (RATE_KEYS.has(key)) return `${sign}${(abs * 100).toFixed(1)} pts`;
  return `${sign}${formatNumber(abs, key === "asttov" ? 2 : 1)}`;
}

function missing(
  key: string,
  label: string,
  group: RankedMetric["group"],
  reason: string
): RankedMetric {
  return {
    key,
    label,
    formattedValue: "-",
    value: null,
    rank: null,
    rankDenominator: null,
    percentile: null,
    leagueAverage: null,
    differenceFromAverage: null,
    previousFormatted: null,
    direction: "higher",
    sample: null,
    source: "season board",
    missingReason: reason,
    group,
  };
}

export function ftRate(row: TeamSeasonStats): number | null {
  if (row.fieldGoalsAttempted <= 0) return null;
  return row.freeThrowsAttempted / row.fieldGoalsAttempted;
}

/** One team's value for a board metric key, as pooled for league ranks. */
export function leaguePoolValue(id: string, row: TeamSeasonStats): number | undefined {
  if (id === "diff") return row.avgDiff;
  if (id === "ts") return row.trueShootingPct;
  if (id === "efg") return row.effectiveFieldGoalPct;
  if (id === "fg3") return row.threePointPct;
  if (id === "3par")
    return row.fieldGoalsAttempted > 0
      ? row.threePointersAttempted / row.fieldGoalsAttempted
      : undefined;
  if (id === "orb") return row.offensiveReboundPct;
  if (id === "asttov") return row.assistToTurnover;
  if (id === "tov") return row.topg;
  if (id === "opp") return row.oppPpg;
  if (id === "stl") return row.spg;
  if (id === "blk") return row.bpg;
  if (id === "ftr") return ftRate(row) ?? undefined;
  return undefined;
}

/** League rank of `row` for a board metric in `league`, or null when either side is missing. */
export function leagueRankOf(
  id: string,
  row: TeamSeasonStats | null,
  league: TeamSeasonStats[]
): { rank: number; of: number } | null {
  if (!row) return null;
  const value = leaguePoolValue(id, row);
  if (!finite(value)) return null;
  const pool = league.map((r) => leaguePoolValue(id, r)).filter((v): v is number => finite(v));
  if (pool.length < 2) return null;
  return { rank: rankPool(value, pool, id === "tov" || id === "opp").rank, of: pool.length };
}

export function buildTeamRankedMetrics(options: {
  team: TeamSeasonStats;
  league: TeamSeasonStats[];
  prior: TeamSeasonStats | null;
  standing: StandingRow | null;
  traits: TeamTrait[];
}): RankedMetric[] {
  const { team, league, prior, standing, traits } = options;
  const n = league.length;
  const source = "Season board · by-team totals";
  const notOnBoard =
    "Not on the season board. Missing, not zero. No ORtg/DRtg/Pace/SRS feed here.";

  const fromTrait = (id: string, group: RankedMetric["group"]): RankedMetric => {
    const trait = traits.find((t) => t.id === id);
    if (!trait || !finite(trait.context.value)) {
      return missing(id, id, group, "Unavailable for this team-season.");
    }
    const invert = id === "tov" || id === "opp";
    const pool = league
      .map((row) => leaguePoolValue(id, row))
      .filter((v): v is number => finite(v));
    const ranked = rankPool(trait.context.value, pool, invert);
    const previousFormatted =
      prior && finite(trait.context.vsPrior)
        ? `${formatMetricDelta(id, trait.context.vsPrior)} vs last season`
        : null;
    return {
      key: id,
      label: trait.label,
      formattedValue: trait.display,
      value: trait.context.value,
      rank: ranked.rank,
      rankDenominator: n,
      percentile: ranked.percentile,
      leagueAverage: ranked.avg,
      differenceFromAverage: trait.context.value - ranked.avg,
      previousFormatted,
      direction: invert ? "lower" : "higher",
      sample: team.gamesPlayed,
      source,
      missingReason: null,
      group,
    };
  };

  const conferenceSize = league.filter(
    (row) => row.conference === team.conference
  ).length;
  const record: RankedMetric = standing
    ? {
        key: "record",
        label: "Record",
        formattedValue: `${standing.wins}-${standing.losses}`,
        value: standing.winPct,
        // standing.rank is the conference seed, not a league rank.
        rank: standing.rank,
        rankDenominator: conferenceSize || 15,
        rankScope: `in the ${standing.conference}`,
        percentile:
          conferenceSize > 1
            ? ((conferenceSize - standing.rank) / (conferenceSize - 1)) * 100
            : null,
        leagueAverage: null,
        differenceFromAverage: null,
        previousFormatted: standing.lastTen
          ? `L10 ${standing.lastTen}`
          : null,
        direction: "higher",
        sample: standing.wins + standing.losses,
        source: "Live standings",
        missingReason: null,
        group: "scorecard",
      }
    : missing(
        "record",
        "Record",
        "scorecard",
        "Live standings are current-season only."
      );

  const ftrValue = ftRate(team);
  const ftrPool = league.map(ftRate).filter((v): v is number => finite(v));
  const ftr: RankedMetric =
    ftrValue != null && ftrPool.length
      ? (() => {
          const ranked = rankPool(ftrValue, ftrPool, false);
          return {
            key: "ftr",
            label: "Free-throw rate",
            formattedValue: formatPct(ftrValue),
            value: ftrValue,
            rank: ranked.rank,
            rankDenominator: n,
            percentile: ranked.percentile,
            leagueAverage: ranked.avg,
            differenceFromAverage: ftrValue - ranked.avg,
            previousFormatted:
              prior && ftRate(prior) != null
                ? `${formatMetricDelta("ftr", ftrValue - (ftRate(prior) as number))} vs last season`
                : null,
            direction: "higher" as const,
            sample: team.gamesPlayed,
            source,
            missingReason: null,
            group: "factors" as const,
          };
        })()
      : missing("ftr", "Free-throw rate", "factors", "No FTA/FGA on this row.");

  return [
    record,
    fromTrait("diff", "scorecard"),
    fromTrait("ts", "scorecard"),
    fromTrait("opp", "scorecard"),
    missing("ortg", "Offensive rating", "scorecard", notOnBoard),
    missing("drtg", "Defensive rating", "scorecard", notOnBoard),
    missing("pace", "Pace", "scorecard", notOnBoard),
    missing("srs", "SRS", "scorecard", notOnBoard),
    fromTrait("efg", "offense"),
    fromTrait("fg3", "offense"),
    fromTrait("3par", "offense"),
    fromTrait("orb", "offense"),
    fromTrait("asttov", "offense"),
    // `topg` is the team's own giveaways (ball security), not turnovers forced.
    fromTrait("tov", "offense"),
    fromTrait("opp", "defense"),
    fromTrait("stl", "defense"),
    fromTrait("blk", "defense"),
    fromTrait("efg", "factors"),
    fromTrait("tov", "factors"),
    fromTrait("orb", "factors"),
    ftr,
  ];
}

export function formatRankLine(metric: RankedMetric): string {
  if (metric.missingReason) return metric.missingReason;
  if (metric.rank == null || metric.rankDenominator == null) return "";
  const pct =
    metric.percentile != null
      ? ` · ${formatOrdinal(Math.round(metric.percentile))} pct`
      : "";
  const scope = metric.rankScope ? ` ${metric.rankScope}` : "";
  return `${formatOrdinal(metric.rank)} of ${metric.rankDenominator}${scope}${pct}`;
}

/** Hover copy for a ranked tile: distance from the league average, then the year-over-year move. */
export function metricTipProps(metric: RankedMetric): Record<string, string> {
  if (metric.missingReason) return {};
  const vsAverage =
    metric.differenceFromAverage != null && Number.isFinite(metric.differenceFromAverage)
      ? `${formatMetricDelta(metric.key, metric.differenceFromAverage)} vs league average`
      : null;
  const sub = [metric.previousFormatted, metric.direction === "lower" ? "Lower is better" : null]
    .filter(Boolean)
    .join(" · ");
  const tip = vsAverage ?? (sub || null);
  if (!tip) return {};
  return vsAverage && sub ? { "data-tip": tip, "data-tip-sub": sub } : { "data-tip": tip };
}
