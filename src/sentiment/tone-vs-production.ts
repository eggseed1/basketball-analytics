/**
 * Where talk about a player and last season's production disagree. Tone and
 * DRBL/100 are each ranked as a percentile among the same qualified players;
 * the gap is tone percentile minus production percentile. Pure.
 */

import type { TrackedPlayerSentimentRow } from "@/sentiment/curated-types";

export type ToneGapRow = {
  playerId: string;
  displayName: string;
  teamKey?: string;
  score: number;
  mentionVolume: number;
  drbl100: number;
  tonePct: number;
  productionPct: number;
  gap: number;
};

export type ToneGapSide = {
  qualified: number;
  minVolume: number;
  season: string;
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

export function toneVsProduction(
  rows: TrackedPlayerSentimentRow[],
  side: "fan" | "media",
  options: { minVolume: number; minPlayers?: number; minGap?: number; limit?: number }
): ToneGapSide | null {
  const { minVolume, minPlayers = 20, minGap = 25, limit = 6 } = options;
  const qualified = rows.flatMap((row) => {
    const lane = row[side];
    if (!lane?.origin || lane.origin === "curated" || !row.performance) return [];
    if (lane.mentionVolume < minVolume) return [];
    return [{ row, lane, performance: row.performance }];
  });
  if (qualified.length < minPlayers) return null;

  const tone = percentiles(qualified.map((q) => q.lane.score));
  const production = percentiles(qualified.map((q) => q.performance.drbl100));
  const scored: ToneGapRow[] = qualified.map((q, i) => ({
    playerId: q.row.playerId,
    displayName: q.row.displayName,
    ...(q.row.teamKey ? { teamKey: q.row.teamKey } : {}),
    score: q.lane.score,
    mentionVolume: q.lane.mentionVolume,
    drbl100: q.performance.drbl100,
    tonePct: Math.round(tone[i]),
    productionPct: Math.round(production[i]),
    gap: Math.round(tone[i] - production[i]),
  }));

  const byGap = [...scored].sort((a, b) => b.gap - a.gap || a.displayName.localeCompare(b.displayName));
  return {
    qualified: scored.length,
    minVolume,
    season: qualified[0].performance.season,
    talkedUp: byGap.filter((row) => row.gap >= minGap).slice(0, limit),
    overlooked: byGap
      .filter((row) => row.gap <= -minGap)
      .reverse()
      .slice(0, limit),
  };
}
