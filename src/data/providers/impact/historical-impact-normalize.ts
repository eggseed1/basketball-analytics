import {
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import type {
  HistoricalImpactMetricId,
  HistoricalImpactSourceId,
} from "@/data/types/historical-impact";

const CANONICAL_SEASON_RE = /^(\d{4})-(\d{2})$/;

/** True when season is valid canonical YYYY-YY with matching end year. */
export function isCanonicalImpactSeason(season: string): boolean {
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
export function normalizeImpactSeason(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isCanonicalImpactSeason(trimmed)) return trimmed;
  // Accept start year only (e.g. "2024") via season-range helper path.
  if (/^\d{4}$/.test(trimmed)) {
    const y = Number(trimmed);
    if (y < 1946 || y > 2100) return null;
    const end = String((y + 1) % 100).padStart(2, "0");
    const season = `${y}-${end}`;
    return isCanonicalImpactSeason(season) ? season : null;
  }
  return null;
}

export function isFiniteImpactValue(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

export function isSupportedImpactMetric(
  metric: string
): metric is HistoricalImpactMetricId {
  return (
    metric === "darko_dpm" ||
    metric === "darko_off" ||
    metric === "darko_def" ||
    metric === "raptor" ||
    metric === "oraptor" ||
    metric === "draptor" ||
    metric === "wins_added"
  );
}

export function isSupportedImpactSource(
  source: string
): source is HistoricalImpactSourceId {
  return source === "darko" || source === "raptor";
}

/** Stable dedupe key for one player-season-metric-source observation. */
export function impactObservationKey(input: {
  playerId: string | null;
  nbaPlayerId?: string;
  playerName: string;
  season: string;
  metric: HistoricalImpactMetricId;
  source: HistoricalImpactSourceId;
}): string {
  const idPart =
    input.playerId ??
    (input.nbaPlayerId ? `nba:${input.nbaPlayerId}` : `name:${input.playerName}`);
  return `${input.source}|${input.metric}|${input.season}|${idPart}`;
}
