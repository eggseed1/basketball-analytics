import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";

const SEASON_RE = /^\d{4}-\d{2}$/;

/** Before tip-off the board shows last season so every section has rows. */
export async function defaultStandingsSeason(seasons: readonly string[]): Promise<string> {
  const current = canonicalSeasonFromStartYear(currentNbaStartYear());
  if (await isPreseasonRosterSeason(current)) {
    const prior = shiftCanonicalSeason(current, -1);
    if (seasons.includes(prior)) return prior;
  }
  return seasons[0] ?? current;
}

export async function resolveStandingsSeason(
  seasons: readonly string[],
  param: string | string[] | undefined
): Promise<string> {
  const raw = Array.isArray(param) ? param[0] : param;
  return raw && SEASON_RE.test(raw) ? raw : await defaultStandingsSeason(seasons);
}
