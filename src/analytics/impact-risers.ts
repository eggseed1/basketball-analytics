/**
 * YoY impact movers from season-keyed boards (Stat Detective lite).
 * Never invents deltas across mismatched metrics or missing seasons.
 */

import { normalizePlayerName } from "@/lib/player-name";
import { formatNumber } from "@/lib/format";

export type ImpactBoardRow = {
  playerId: string;
  nbaPlayerId?: string;
  playerName: string;
  impact: number;
};

export type ImpactMover = {
  playerId: string;
  playerName: string;
  fromSeason: string;
  toSeason: string;
  fromValue: number;
  toValue: number;
  delta: number;
};

export type ImpactMoversResult = {
  risers: ImpactMover[];
  fallers: ImpactMover[];
  metricLabel: string;
  note: string;
};

function rowKey(row: ImpactBoardRow): string {
  const id = String(row.nbaPlayerId || row.playerId || "").trim();
  if (id) return `id:${id}`;
  return `name:${normalizePlayerName(row.playerName)}`;
}

/**
 * Rank same-metric YoY deltas. Rows without a prior match are skipped.
 */
export function computeImpactMovers(options: {
  prior: ImpactBoardRow[];
  current: ImpactBoardRow[];
  fromSeason: string;
  toSeason: string;
  metricLabel?: string;
  /** Absolute delta floor so noise stays off the home rail. */
  minAbsDelta?: number;
  limit?: number;
}): ImpactMoversResult {
  const {
    prior,
    current,
    fromSeason,
    toSeason,
    metricLabel = "DARKO DPM",
    minAbsDelta = 0.8,
    limit = 5,
  } = options;

  const priorByKey = new Map<string, ImpactBoardRow>();
  for (const row of prior) {
    if (!Number.isFinite(row.impact)) continue;
    const key = rowKey(row);
    const existing = priorByKey.get(key);
    if (!existing || row.impact > existing.impact) priorByKey.set(key, row);
  }

  const movers: ImpactMover[] = [];
  for (const row of current) {
    if (!Number.isFinite(row.impact)) continue;
    const prev = priorByKey.get(rowKey(row));
    if (!prev) continue;
    const delta = row.impact - prev.impact;
    if (Math.abs(delta) < minAbsDelta) continue;
    movers.push({
      playerId: row.nbaPlayerId || row.playerId,
      playerName: row.playerName,
      fromSeason,
      toSeason,
      fromValue: prev.impact,
      toValue: row.impact,
      delta,
    });
  }

  const risers = [...movers]
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
  const fallers = [...movers]
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);

  return {
    risers,
    fallers,
    metricLabel,
    note: `Same-metric YoY on ${metricLabel} only (${fromSeason} → ${toSeason}). Missing prior seasons are skipped — never cross-metric.`,
  };
}

export function formatImpactDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatNumber(delta, 2)}`;
}
