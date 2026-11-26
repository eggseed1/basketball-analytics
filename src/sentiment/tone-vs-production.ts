/**
 * Where talk about a player and production disagree. Tone and production are
 * each ranked as a percentile among the same qualified players; the gap is tone
 * percentile minus production percentile. Production is this season's BPM when
 * enough players have a real sample, and last season's DRBL/100 otherwise. Pure.
 */

import type { TrackedPlayerSentimentRow } from "@/sentiment/curated-types";
import { qualifiesForForm } from "@/sentiment/season-form";

export type ToneGapMetric = "bpm" | "drbl100";

export const TONE_GAP_METRIC_LABEL: Record<ToneGapMetric, string> = {
  bpm: "BPM",
  drbl100: "DRBL/100",
};

/** 1st, 2nd, 3rd, 11th, 21st. */
export function formatOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export type ToneGapRow = {
  playerId: string;
  displayName: string;
  teamKey?: string;
  score: number;
  mentionVolume: number;
  /** Raw production value in the side's metric. */
  production: number;
  tonePct: number;
  productionPct: number;
  gap: number;
};

export type ToneGapSide = {
  qualified: number;
  minVolume: number;
  season: string;
  metric: ToneGapMetric;
  metricLabel: string;
  talkedUp: ToneGapRow[];
  overlooked: ToneGapRow[];
};

/** Percentile 0–100 for each value; ties share their average rank. */
function percentiles(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const rank = (i + j) / 2;
    for (let k = i; k <= j; k += 1) {
      out[order[k].index] = order.length > 1 ? (rank / (order.length - 1)) * 100 : 50;
    }
    i = j + 1;
  }
  return out;
}

type Qualified = {
  row: TrackedPlayerSentimentRow;
  lane: NonNullable<TrackedPlayerSentimentRow["fan"]>;
  production: number;
  season: string;
};

function qualify(
  rows: TrackedPlayerSentimentRow[],
  side: "fan" | "media",
  minVolume: number,
  metric: ToneGapMetric
): Qualified[] {
  return rows.flatMap((row) => {
    const lane = row[side];
    if (!lane?.origin || lane.origin === "curated") return [];
    if (lane.mentionVolume < minVolume) return [];
    if (metric === "bpm") {
      return qualifiesForForm(row.form)
        ? [{ row, lane, production: row.form.bpm, season: row.form.season }]
        : [];
    }
    return row.performance
      ? [{ row, lane, production: row.performance.drbl100, season: row.performance.season }]
      : [];
  });
}

export function toneVsProduction(
  rows: TrackedPlayerSentimentRow[],
  side: "fan" | "media",
  options: {
    minVolume: number;
    minPlayers?: number;
    minGap?: number;
    limit?: number;
    /** "auto" uses this season's BPM when enough players qualify. */
    metric?: ToneGapMetric | "auto";
  }
): ToneGapSide | null {
  const { minVolume, minPlayers = 20, minGap = 25, limit = 6, metric = "auto" } = options;
  const order: ToneGapMetric[] = metric === "auto" ? ["bpm", "drbl100"] : [metric];
  let chosen: ToneGapMetric | null = null;
  let qualified: Qualified[] = [];
  for (const candidate of order) {
    const pool = qualify(rows, side, minVolume, candidate);
    if (pool.length >= minPlayers) {
      chosen = candidate;
      qualified = pool;
      break;
    }
  }
  if (!chosen) return null;

  const tone = percentiles(qualified.map((q) => q.lane.score));
  const production = percentiles(qualified.map((q) => q.production));
  const scored: ToneGapRow[] = qualified.map((q, i) => ({
    playerId: q.row.playerId,
    displayName: q.row.displayName,
    ...(q.row.teamKey ? { teamKey: q.row.teamKey } : {}),
    score: q.lane.score,
    mentionVolume: q.lane.mentionVolume,
    production: q.production,
    tonePct: Math.round(tone[i]),
    productionPct: Math.round(production[i]),
    gap: Math.round(tone[i] - production[i]),
  }));

  const byGap = [...scored].sort((a, b) => b.gap - a.gap || a.displayName.localeCompare(b.displayName));
  return {
    qualified: scored.length,
    minVolume,
    season: qualified[0].season,
    metric: chosen,
    metricLabel: TONE_GAP_METRIC_LABEL[chosen],
    talkedUp: byGap.filter((row) => row.gap >= minGap).slice(0, limit),
    overlooked: byGap
      .filter((row) => row.gap <= -minGap)
      .reverse()
      .slice(0, limit),
  };
}
