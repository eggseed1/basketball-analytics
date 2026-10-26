/**
 * Client-safe ASK builder season bounds — no runtime JSON / node:fs.
 * Execute path should prefer {@link metricSeasonAvailability} in coverage.ts.
 */

import type { AskMetricId } from "./types";
import {
  isDrblSeason,
  listCanonicalR1Seasons,
  listDrblSeasons,
} from "@/data/drbl/season-registry";

/**
 * Sync builder preview — published season bounds without loading overlay JSON.
 */
export function metricSeasonAvailabilitySync(
  metricId: AskMetricId,
  season: string
): { ok: true } | { ok: false; message: string } {
  if (metricId === "darko") {
    if (season < "1996-97") {
      return {
        ok: false,
        message: `Verified season-true DARKO data is not available for ${season}. ASK DRBL admits DARKO for baked overlay seasons (1996-97 onward).`,
      };
    }
    return { ok: true };
  }
  if (metricId === "raptor") {
    if (season > "2021-22") {
      return {
        ok: false,
        message: `Verified season-true RAPTOR data is not available for ${season}. RAPTOR coverage ends after 2021-22.`,
      };
    }
    return { ok: true };
  }
  const drblIds: AskMetricId[] = [
    "drbl100",
    "drbl_o",
    "drbl_d",
    "drbl_p",
    "drbl_ln",
    "drbl_b",
  ];
  if (drblIds.includes(metricId)) {
    if (!isDrblSeason(season)) {
      return {
        ok: false,
        message: `DRBL metrics are not published for ${season}. Supported DRBL seasons: ${listDrblSeasons().join(", ")}.`,
      };
    }
    return { ok: true };
  }
  if (metricId === "r1_points" || metricId === "r1_win_eq") {
    if (!listCanonicalR1Seasons().includes(season)) {
      return {
        ok: false,
        message: `R1 value metrics are not published for ${season}. Canonical R1 seasons: ${listCanonicalR1Seasons().join(", ")}.`,
      };
    }
    return { ok: true };
  }
  return { ok: true };
}
