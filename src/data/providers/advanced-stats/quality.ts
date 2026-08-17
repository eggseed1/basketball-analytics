/**
 * Data-quality checks for BDL season_averages advanced probe rows.
 * Problematic rows are reported — never silently dropped.
 */

import type { BdlSeasonAverageRow } from "@/data/providers/balldontlie/client";

export type SeasonAverageQualityIssue = {
  code:
    | "duplicate_player_season"
    | "duplicate_id"
    | "multi_row_player"
    | "missing_season"
    | "missing_player_id"
    | "invalid_numeric"
    | "impossible_percentage"
    | "null_rating";
  message: string;
  bdlPlayerId?: string;
  season?: number | string;
  field?: string;
};

export type SeasonAverageQualityReport = {
  rowCount: number;
  uniquePlayerIds: number;
  playerSeasonKeys: number;
  multiRowPlayerCount: number;
  issues: SeasonAverageQualityIssue[];
};

function playerIdOf(row: BdlSeasonAverageRow): string | null {
  if (row.player?.id != null) return String(row.player.id);
  if (row.player_id != null) return String(row.player_id);
  return null;
}

function isPctField(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("percentage") ||
    k.endsWith("_pct") ||
    k.includes("pct")
  );
}

function isRatingField(key: string): boolean {
  const k = key.toLowerCase();
  return k.includes("rating") || k === "ortg" || k === "drtg" || k === "net";
}

/**
 * Inspect raw season-average rows for quality issues (report-only).
 */
export function inspectSeasonAverageRows(
  rows: BdlSeasonAverageRow[]
): SeasonAverageQualityReport {
  const issues: SeasonAverageQualityIssue[] = [];
  const byPlayerSeason = new Map<string, number>();
  const byPlayer = new Map<string, number>();
  const playerIds = new Set<string>();

  for (const row of rows) {
    const pid = playerIdOf(row);
    if (!pid) {
      issues.push({
        code: "missing_player_id",
        message: "Row missing player.id / player_id.",
        season: row.season,
      });
    } else {
      playerIds.add(pid);
      byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + 1);
    }

    if (row.season == null || !Number.isFinite(Number(row.season))) {
      issues.push({
        code: "missing_season",
        message: "Row missing or non-numeric season.",
        bdlPlayerId: pid ?? undefined,
      });
    }

    const seasonKey = `${pid ?? "unknown"}|${row.season}|${row.season_type ?? ""}|${row.team?.id ?? ""}`;
    byPlayerSeason.set(seasonKey, (byPlayerSeason.get(seasonKey) ?? 0) + 1);

    const stats = row.stats ?? {};
    for (const [field, raw] of Object.entries(stats)) {
      if (raw == null) {
        if (isRatingField(field)) {
          issues.push({
            code: "null_rating",
            message: `Null rating field ${field}.`,
            bdlPlayerId: pid ?? undefined,
            season: row.season,
            field,
          });
        }
        continue;
      }
      if (typeof raw === "number") {
        if (!Number.isFinite(raw)) {
          issues.push({
            code: "invalid_numeric",
            message: `Non-finite numeric for ${field}.`,
            bdlPlayerId: pid ?? undefined,
            season: row.season,
            field,
          });
        } else if (isPctField(field) && (raw < 0 || raw > 1.5)) {
          // Allow slight headroom above 1.0 for provider quirks; flag absurd values.
          issues.push({
            code: "impossible_percentage",
            message: `Implausible percentage ${field}=${raw}.`,
            bdlPlayerId: pid ?? undefined,
            season: row.season,
            field,
          });
        }
      }
    }
  }

  for (const [key, count] of byPlayerSeason) {
    if (count > 1) {
      issues.push({
        code: "duplicate_player_season",
        message: `Duplicate player-season key ${key} appeared ${count} times.`,
      });
    }
  }

  let multiRowPlayerCount = 0;
  for (const [pid, count] of byPlayer) {
    if (count > 1) {
      multiRowPlayerCount += 1;
      issues.push({
        code: "multi_row_player",
        message: `Player ${pid} has ${count} rows in this probe (possible multi-team split). Do not aggregate.`,
        bdlPlayerId: pid,
      });
    }
  }

  return {
    rowCount: rows.length,
    uniquePlayerIds: playerIds.size,
    playerSeasonKeys: byPlayerSeason.size,
    multiRowPlayerCount,
    issues,
  };
}
