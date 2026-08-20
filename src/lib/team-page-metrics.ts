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
  const below = pool.filter((v) => v < value).length;
  const percentile = invert ? 100 - (below / n) * 100 : (below / n) * 100;
  const avg = pool.reduce((a, b) => a + b, 0) / n;
  return { rank: better + 1, percentile, avg };
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

export function buildTeamRankedMetrics(options: {
  team: TeamSeasonStats;
  league: TeamSeasonStats[];
  prior: TeamSeasonStats | null;
  standing: StandingRow | null;
  traits: TeamTrait[];
}): RankedMetric[] {
  const { team, league, prior, standing, traits } = options;
  const n = league.length;
  const source = "Season board · ESPN by-team totals";
  const notOnBoard =
    "Not on the season board. Missing, not zero - no ORtg/DRtg/Pace/SRS feed here.";

  const fromTrait = (id: string, group: RankedMetric["group"]): RankedMetric => {
    const trait = traits.find((t) => t.id === id);
    if (!trait || !finite(trait.context.value)) {
      return missing(id, id, group, "Unavailable for this team-season.");
    }
    const invert = id === "tov" || id === "opp";
    const pool = league
      .map((row) => {
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
        return undefined;
      })
      .filter((v): v is number => finite(v));
    const ranked = rankPool(trait.context.value, pool, invert);
    let previousFormatted: string | null = null;
    if (prior) {
      const prevTrait = traits.find((t) => t.id === id);
      if (prevTrait && finite(trait.context.vsPrior)) {
        const sign = trait.context.vsPrior > 0 ? "+" : "";
        previousFormatted = `${sign}${
          id === "ts" ||
          id === "efg" ||
          id === "fg3" ||
          id === "3par" ||
          id === "orb"
            ? formatPct(trait.context.vsPrior)
            : formatNumber(trait.context.vsPrior, 1)
        } vs prior`;
      }
    }
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

  const record: RankedMetric = standing
    ? {
        key: "record",
        label: "Record",
        formattedValue: `${standing.wins}-${standing.losses}`,
        value: standing.winPct,
        rank: standing.rank,
        rankDenominator: n || 15,
        percentile: n ? ((n - standing.rank) / n) * 100 : null,
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
                ? `${formatPct(ftrValue - (ftRate(prior) as number))} vs prior`
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
    fromTrait("tov", "defense"),
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
  return `${formatOrdinal(metric.rank)} of ${metric.rankDenominator}${pct}`;
}
