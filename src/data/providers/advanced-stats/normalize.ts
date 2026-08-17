import {
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import type {
  AdvancedSeasonMetricId,
  AdvancedSeasonObservation,
  AdvancedSeasonSourceId,
} from "@/data/types/advanced-season-stats";

const CANONICAL_SEASON_RE = /^(\d{4})-(\d{2})$/;

export function isCanonicalAdvancedSeason(season: string): boolean {
  const m = CANONICAL_SEASON_RE.exec(season.trim());
  if (!m) return false;
  try {
    startYearFromCanonicalSeason(season.trim());
    return true;
  } catch {
    return false;
  }
}

/** Normalize provider season strings into YYYY-YY or null if invalid. */
export function normalizeAdvancedSeason(raw: string | number): string | null {
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (isCanonicalAdvancedSeason(trimmed)) return trimmed;
  if (/^\d{4}$/.test(trimmed)) {
    const y = Number(trimmed);
    if (y < 1946 || y > 2100) return null;
    const end = String((y + 1) % 100).padStart(2, "0");
    const season = `${y}-${end}`;
    return isCanonicalAdvancedSeason(season) ? season : null;
  }
  return null;
}

export function isFiniteAdvancedValue(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

export function isSupportedAdvancedMetric(
  metric: string
): metric is AdvancedSeasonMetricId {
  return (
    metric === "ortg" ||
    metric === "drtg" ||
    metric === "net" ||
    metric === "usg_pct" ||
    metric === "ts_pct" ||
    metric === "efg_pct"
  );
}

export function isSupportedAdvancedSource(
  source: string
): source is AdvancedSeasonSourceId {
  return (
    source === "espn_approx" ||
    source === "bdl_game_advanced" ||
    source === "bdl_season_averages_advanced" ||
    source === "nba_stats_placeholder" ||
    source === "local_sample"
  );
}

/** Stable dedupe key for one player-season-metric-source observation. */
export function advancedObservationKey(
  input: Pick<
    AdvancedSeasonObservation,
    | "playerId"
    | "nbaPlayerId"
    | "bdlPlayerId"
    | "playerName"
    | "season"
    | "metric"
    | "source"
  >
): string {
  const idPart =
    input.playerId ??
    (input.nbaPlayerId
      ? `nba:${input.nbaPlayerId}`
      : input.bdlPlayerId
        ? `bdl:${input.bdlPlayerId}`
        : `name:${input.playerName}`);
  return `${input.source}|${input.metric}|${input.season}|${idPart}`;
}

export function provenanceIsComplete(
  obs: AdvancedSeasonObservation
): boolean {
  const p = obs.provenance;
  return Boolean(
    obs.source &&
      obs.sourceVersion &&
      obs.methodologyVersion &&
      p?.dataset &&
      p?.importedAt &&
      (obs.playerId || obs.nbaPlayerId || obs.bdlPlayerId)
  );
}
