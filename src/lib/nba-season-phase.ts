/**
 * NBA calendar phase for product refresh cadence (UTC heuristics).
 *
 * League / roster year flips Jul 1. Tip-off is mid-October; Finals end by late June.
 * Daily player-visualization rebuilds run in regular + playoffs only.
 */

export type NbaSeasonPhase = "offseason" | "regular" | "playoffs";

export type NbaSeasonPhaseInfo = {
  phase: NbaSeasonPhase;
  /** Canonical season for the current league year (Jul→Jun), e.g. 2025-26. */
  season: string;
  /** Start year of `season`. */
  startYear: number;
  /** True when race / scatter / game-log daily refresh should run. */
  shouldRefreshPlayerViz: boolean;
};

export function currentNbaStartYear(now = new Date()): number {
  return now.getUTCMonth() >= 6
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
}

export function canonicalSeasonFromStartYear(startYear: number): string {
  const endTwo = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endTwo}`;
}

/**
 * Opening tip window starts mid-October; playoffs mid-April through June.
 * Exact tip dates move yearly — this is intentionally a soft gate so the
 * first weeks of the season still refresh once games are underway.
 */
export function nbaSeasonPhase(now = new Date()): NbaSeasonPhase {
  const month = now.getUTCMonth(); // 0 = Jan
  const day = now.getUTCDate();

  // Jul–Sep, and Oct 1–14: offseason for daily viz refresh.
  if (month >= 6 && month <= 8) return "offseason";
  if (month === 9 && day < 15) return "offseason";

  // Oct 15 – Apr 14: regular season.
  if (month === 9 || month === 10 || month === 11) return "regular";
  if (month >= 0 && month <= 2) return "regular";
  if (month === 3 && day < 15) return "regular";

  // Apr 15 – Jun 30: playoffs / Finals.
  if (month === 3 || month === 4 || month === 5) return "playoffs";

  return "offseason";
}

export function nbaSeasonPhaseInfo(now = new Date()): NbaSeasonPhaseInfo {
  const startYear = currentNbaStartYear(now);
  const phase = nbaSeasonPhase(now);
  return {
    phase,
    startYear,
    season: canonicalSeasonFromStartYear(startYear),
    shouldRefreshPlayerViz: phase === "regular" || phase === "playoffs",
  };
}

/**
 * Early-season players won't hit the historical 15-GP bake floor.
 * Ramp the minimum as the schedule progresses.
 */
export function dailyGameLogMinGp(now = new Date()): number {
  const info = nbaSeasonPhaseInfo(now);
  if (info.phase === "offseason") return 15;
  if (info.phase === "playoffs") return 1;

  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  // Opening month(s): keep everyone with a log.
  if (month === 9 || month === 10) return 1;
  if (month === 11 && day < 15) return 3;
  if (month === 11 || month === 0) return 5;
  if (month === 1) return 10;
  return 15;
}
