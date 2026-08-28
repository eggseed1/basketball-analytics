/**
 * Peak Impact — season-true impact peaks (companion to Career Resume CPI).
 *
 * Preference (never mix scales into one ranking):
 * 1. DARKO DPM when season-true rows exist (bundled overlay ~1996–97+)
 * 2. Else RAPTOR when season-true rows exist (through 2021-22)
 * 3. Else BPM when present on the board
 *
 * RAPTOR is never used as a stand-in for modern seasons after 2021-22.
 */

import { isCareerQualifyingSeason } from "@/analytics/career-resume";
import type { PlayerSeason } from "@/data/types";
import { formatNumber } from "@/lib/format";

export type PeakImpactMetricId = "darko" | "raptor" | "bpm";

export type PeakImpactSeason = {
  season: string;
  teamId: string;
  teamName: string;
  metricId: PeakImpactMetricId;
  metricLabel: string;
  value: number;
  display: string;
  seasonHref: string;
};

export type PeakImpactResult = {
  /** Primary peak using preference order (DARKO → RAPTOR → BPM). */
  primary: PeakImpactSeason | null;
  byMetric: Partial<Record<PeakImpactMetricId, PeakImpactSeason>>;
  note: string;
};

const METRIC_LABEL: Record<PeakImpactMetricId, string> = {
  darko: "DARKO DPM",
  raptor: "RAPTOR",
  bpm: "BPM",
};

function pickValue(
  row: PlayerSeason,
  metricId: PeakImpactMetricId
): number | null {
  if (metricId === "darko") {
    return row.darkoDpm != null && Number.isFinite(row.darkoDpm)
      ? row.darkoDpm
      : null;
  }
  if (metricId === "raptor") {
    return row.raptor != null && Number.isFinite(row.raptor) ? row.raptor : null;
  }
  return row.bpm != null && Number.isFinite(row.bpm) ? row.bpm : null;
}

function toPeak(
  row: PlayerSeason,
  playerId: string,
  metricId: PeakImpactMetricId,
  value: number
): PeakImpactSeason {
  return {
    season: row.season,
    teamId: row.teamId,
    teamName: row.teamName,
    metricId,
    metricLabel: METRIC_LABEL[metricId],
    value,
    display: formatNumber(value, 2),
    seasonHref: `/players/${encodeURIComponent(playerId)}?season=${encodeURIComponent(row.season)}`,
  };
}

function peakForMetric(
  rows: PlayerSeason[],
  playerId: string,
  metricId: PeakImpactMetricId
): PeakImpactSeason | null {
  let best: PeakImpactSeason | null = null;
  for (const row of rows) {
    const value = pickValue(row, metricId);
    if (value == null) continue;
    if (!best || value > best.value) {
      best = toPeak(row, playerId, metricId, value);
    }
  }
  return best;
}

/**
 * Best impact peak among qualifying career seasons, with honest metric choice.
 */
export function computePeakImpact(options: {
  playerId: string;
  career: PlayerSeason[];
}): PeakImpactResult {
  const { playerId, career } = options;
  const qualifying = career.filter((row) => isCareerQualifyingSeason(row));

  const byMetric: PeakImpactResult["byMetric"] = {};
  const darko = peakForMetric(qualifying, playerId, "darko");
  const raptor = peakForMetric(qualifying, playerId, "raptor");
  const bpm = peakForMetric(qualifying, playerId, "bpm");
  if (darko) byMetric.darko = darko;
  if (raptor) byMetric.raptor = raptor;
  if (bpm) byMetric.bpm = bpm;

  const primary = darko ?? raptor ?? bpm ?? null;

  let note =
    "Peak Impact uses season-true overlays only — CPI Career Resume stays the production peak.";
  if (primary?.metricId === "darko") {
    note =
      "Peak Impact from DARKO (season-keyed overlay). RAPTOR peaks are listed separately when present (through 2021-22).";
  } else if (primary?.metricId === "raptor") {
    note =
      "Peak Impact from RAPTOR (through 2021-22). No season-true DARKO on these qualifying rows.";
  } else if (primary?.metricId === "bpm") {
    note =
      "Peak Impact from BPM — no season-true DARKO/RAPTOR on these qualifying rows.";
  } else {
    note =
      "No season-true DARKO, RAPTOR, or BPM on qualifying seasons for Peak Impact.";
  }

  return { primary, byMetric, note };
}
