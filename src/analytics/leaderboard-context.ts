import { buildStatContext } from "@/analytics/context";
import { explainMetric } from "@/analytics/explanations";
import type { StatContext } from "@/analytics/types";
import type { PlayerSeason } from "@/data/types";
import { formatOrdinal } from "@/lib/format";
import type { PlayerSeasonSortKey } from "@/lib/player-season-sort";
import { METRIC_PICKERS } from "@/lib/player-stat-comps";

export type LeaderboardContextLine = {
  id: string;
  label: string;
  /** 0–100 among the current filtered board. */
  percentile: number;
  display: string;
  primary?: boolean;
  learnHref?: string;
  context: StatContext;
};

export type LeaderboardRowContext = {
  playerId: string;
  playerName: string;
  season: string;
  primary: LeaderboardContextLine;
  related: LeaderboardContextLine[];
  playerHref: string;
};

type Dim = {
  id: string;
  label: string;
  metricId: keyof typeof METRIC_PICKERS;
  invert?: boolean;
  explainId?: string;
};

/** Dimensions shown in the compact context panel, ordered by relevance to sort. */
function dimensionsForSort(sortKey: PlayerSeasonSortKey): Dim[] {
  switch (sortKey) {
    case "darkoDpm":
      return [
        { id: "overall", label: "Overall", metricId: "darko", explainId: "darko" },
        { id: "offense", label: "Offense", metricId: "darko-off", explainId: "darko" },
        { id: "defense", label: "Defense", metricId: "darko-def", explainId: "darko" },
        { id: "shooting", label: "Shooting", metricId: "ts", explainId: "trueShooting" },
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
      ];
    case "lebron":
      return [
        { id: "overall", label: "Overall", metricId: "lebron", explainId: "lebron" },
        { id: "offense", label: "Offense", metricId: "olebron", explainId: "lebron" },
        { id: "defense", label: "Defense", metricId: "dlebron", explainId: "lebron" },
        { id: "shooting", label: "Shooting", metricId: "ts", explainId: "trueShooting" },
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
      ];
    case "trueShootingPct":
      return [
        { id: "ts", label: "True shooting", metricId: "ts", explainId: "trueShooting" },
        { id: "efg", label: "Effective FG%", metricId: "efg" },
        { id: "fg3", label: "3P%", metricId: "fg3" },
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
        { id: "scoring", label: "Scoring", metricId: "pts" },
      ];
    case "effectiveFieldGoalPct":
      return [
        { id: "efg", label: "Effective FG%", metricId: "efg" },
        { id: "ts", label: "True shooting", metricId: "ts", explainId: "trueShooting" },
        { id: "fg", label: "FG%", metricId: "fg" },
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
      ];
    case "usagePct":
      return [
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
        { id: "ts", label: "True shooting", metricId: "ts", explainId: "trueShooting" },
        { id: "scoring", label: "Scoring", metricId: "pts" },
        { id: "offense", label: "Offensive rating", metricId: "ortg" },
        { id: "overall", label: "Overall", metricId: "darko", explainId: "darko" },
      ];
    case "offensiveRating":
      return [
        { id: "offense", label: "Offensive rating", metricId: "ortg" },
        { id: "ts", label: "True shooting", metricId: "ts", explainId: "trueShooting" },
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
        { id: "net", label: "Net rating", metricId: "net" },
      ];
    case "defensiveRating":
      return [
        { id: "defense", label: "Defensive rating", metricId: "drtg", invert: true },
        { id: "stocks", label: "Steals", metricId: "stl" },
        { id: "blocks", label: "Blocks", metricId: "blk" },
        { id: "overall", label: "Overall", metricId: "darko", explainId: "darko" },
      ];
    case "netRating":
      return [
        { id: "net", label: "Net rating", metricId: "net" },
        { id: "offense", label: "Offensive rating", metricId: "ortg" },
        { id: "defense", label: "Defensive rating", metricId: "drtg", invert: true },
        { id: "overall", label: "Overall", metricId: "darko", explainId: "darko" },
      ];
    case "ppg":
      return [
        { id: "scoring", label: "Scoring", metricId: "pts" },
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
        { id: "ts", label: "True shooting", metricId: "ts", explainId: "trueShooting" },
        { id: "offense", label: "Offensive rating", metricId: "ortg" },
      ];
    case "apg":
      return [
        { id: "playmaking", label: "Assists", metricId: "ast" },
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
        { id: "offense", label: "Offensive rating", metricId: "ortg" },
        { id: "ts", label: "True shooting", metricId: "ts", explainId: "trueShooting" },
      ];
    case "rpg":
      return [
        { id: "rebounding", label: "Rebounds", metricId: "reb" },
        { id: "minutes", label: "Minutes", metricId: "min" },
        { id: "overall", label: "Overall", metricId: "darko", explainId: "darko" },
      ];
    case "fieldGoalPct":
    case "threePointPct":
    case "freeThrowPct":
      return [
        {
          id: "primary",
          label:
            sortKey === "fieldGoalPct"
              ? "FG%"
              : sortKey === "threePointPct"
                ? "3P%"
                : "FT%",
          metricId:
            sortKey === "fieldGoalPct"
              ? "fg"
              : sortKey === "threePointPct"
                ? "fg3"
                : "ft",
        },
        { id: "ts", label: "True shooting", metricId: "ts", explainId: "trueShooting" },
        { id: "efg", label: "Effective FG%", metricId: "efg" },
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
      ];
    default:
      return [
        { id: "overall", label: "Overall", metricId: "darko", explainId: "darko" },
        { id: "shooting", label: "Shooting", metricId: "ts", explainId: "trueShooting" },
        { id: "usage", label: "Usage", metricId: "usg", explainId: "usage" },
        { id: "offense", label: "Offensive rating", metricId: "ortg" },
        { id: "defense", label: "Defensive rating", metricId: "drtg", invert: true },
      ];
  }
}

function percentileOf(value: number, pool: number[], invert = false): number {
  if (!pool.length || !Number.isFinite(value)) return 50;
  const below = pool.filter((v) => v < value).length;
  const raw = (below / pool.length) * 100;
  return invert ? 100 - raw : raw;
}

export type LeaderboardContextIndex = {
  sortKey: PlayerSeasonSortKey;
  sampleSize: number;
  /** metricId → sorted numeric pool for percentile calc */
  pools: Map<string, number[]>;
  dimensions: Dim[];
};

/**
 * Build percentile pools once for the current filtered board.
 * Call from the table — O(players × dimensions), no extra network.
 */
export function buildLeaderboardContextIndex(
  players: PlayerSeason[],
  sortKey: PlayerSeasonSortKey
): LeaderboardContextIndex {
  const dimensions = dimensionsForSort(sortKey);
  const pools = new Map<string, number[]>();

  for (const dim of dimensions) {
    const picker = METRIC_PICKERS[dim.metricId];
    if (!picker) continue;
    const values: number[] = [];
    for (const row of players) {
      const v = picker.pick(row);
      if (v != null && Number.isFinite(v)) values.push(v);
    }
    pools.set(dim.metricId, values);
  }

  return {
    sortKey,
    sampleSize: players.length,
    pools,
    dimensions,
  };
}

/**
 * Compact Level-2 context for one leaderboard row.
 * Uses only the precomputed board pools — no per-row fetches.
 */
export function buildLeaderboardRowContext(
  player: PlayerSeason,
  index: LeaderboardContextIndex
): LeaderboardRowContext | null {
  const lines: LeaderboardContextLine[] = [];

  for (const dim of index.dimensions) {
    const picker = METRIC_PICKERS[dim.metricId];
    if (!picker) continue;
    const value = picker.pick(player);
    if (value == null || !Number.isFinite(value)) continue;
    const pool = index.pools.get(dim.metricId) ?? [];
    if (pool.length < 5) continue;
    const percentile = percentileOf(value, pool, dim.invert);
    const display = picker.format(value);
    const explanation = dim.explainId ? explainMetric(dim.explainId) : null;
    lines.push({
      id: dim.id,
      label: dim.label,
      percentile,
      display,
      primary: lines.length === 0,
      learnHref: explanation?.learnHref,
      context: buildStatContext({
        display,
        value,
        percentile,
        population: "qualified_season",
        populationLabel: "players on this board",
        sampleSize: pool.length,
        timeframe: player.season,
        learnHref: explanation?.learnHref,
        sourceLabel: dim.label,
      }),
    });
  }

  if (!lines.length) return null;
  const [primary, ...related] = lines;

  return {
    playerId: player.playerId,
    playerName: player.playerName,
    season: player.season,
    primary: primary!,
    related,
    playerHref: `/players/${player.playerId}?season=${encodeURIComponent(player.season)}`,
  };
}

export function formatLeaderboardPercentile(p: number): string {
  return `${formatOrdinal(Math.round(p))} pct`;
}
