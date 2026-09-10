/**
 * Shared season-phase helpers for Node scripts (kept in sync with
 * `src/lib/nba-season-phase.ts`).
 */

export function currentNbaStartYear(now = new Date()) {
  return now.getUTCMonth() >= 6
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
}

export function canonicalSeasonFromStartYear(startYear) {
  const endTwo = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endTwo}`;
}

export function nbaSeasonPhase(now = new Date()) {
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  if (month >= 6 && month <= 8) return "offseason";
  if (month === 9 && day < 15) return "offseason";

  if (month === 9 || month === 10 || month === 11) return "regular";
  if (month >= 0 && month <= 2) return "regular";
  if (month === 3 && day < 15) return "regular";

  if (month === 3 || month === 4 || month === 5) return "playoffs";

  return "offseason";
}

export function nbaSeasonPhaseInfo(now = new Date()) {
  const startYear = currentNbaStartYear(now);
  const phase = nbaSeasonPhase(now);
  return {
    phase,
    startYear,
    season: canonicalSeasonFromStartYear(startYear),
    shouldRefreshPlayerViz: phase === "regular" || phase === "playoffs",
  };
}

export function dailyGameLogMinGp(now = new Date()) {
  const info = nbaSeasonPhaseInfo(now);
  if (info.phase === "offseason") return 15;
  if (info.phase === "playoffs") return 1;

  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  if (month === 9 || month === 10) return 1;
  if (month === 11 && day < 15) return 3;
  if (month === 11 || month === 0) return 5;
  if (month === 1) return 10;
  return 15;
}
