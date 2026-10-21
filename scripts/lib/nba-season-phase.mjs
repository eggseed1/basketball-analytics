/**
 * Shared season-phase helpers for Node scripts (kept in sync with
 * `src/lib/nba-season-phase.ts`).
 *
 * Regular-season refresh starts on the bundled schedule opener when known,
 * not a fixed mid-October calendar day.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GAME_SNAPSHOT = path.join(ROOT, "src/data/runtime/game-snapshot.json");

export function currentNbaStartYear(now = new Date()) {
  return now.getUTCMonth() >= 6
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
}

export function canonicalSeasonFromStartYear(startYear) {
  const endTwo = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endTwo}`;
}

/** YYYY-MM-DD in America/New_York for "has tip arrived" comparisons. */
export function nbaTodayIso(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * First regular-season tip on the bundled game snapshot, or null.
 * Soft fall back when the snapshot is missing or has no RS games yet.
 */
export function firstRegularSeasonTipDate(season) {
  try {
    if (!existsSync(GAME_SNAPSHOT)) return null;
    const data = JSON.parse(readFileSync(GAME_SNAPSHOT, "utf8"));
    const dates = (data.games ?? [])
      .filter(
        (g) =>
          String(g.season ?? "") === season &&
          (g.gameType ?? "regular") === "regular" &&
          g.gameDate
      )
      .map((g) => String(g.gameDate).slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    return dates[0] ?? null;
  } catch {
    return null;
  }
}

export function leagueRegularSeasonHasOpened(season, now = new Date()) {
  const opener = firstRegularSeasonTipDate(season);
  if (!opener) return false;
  return nbaTodayIso(now) >= opener;
}

/**
 * Opening tip from schedule when known; else soft Oct 15 so a missing
 * snapshot does not block the home stats runner forever.
 */
export function nbaSeasonPhase(now = new Date()) {
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const season = canonicalSeasonFromStartYear(currentNbaStartYear(now));

  if (month >= 6 && month <= 8) return "offseason";

  // Oct: schedule opener wins. Unknown tip → soft Oct 15 handoff.
  if (month === 9) {
    const opener = firstRegularSeasonTipDate(season);
    if (opener) {
      return nbaTodayIso(now) >= opener ? "regular" : "offseason";
    }
    return day < 15 ? "offseason" : "regular";
  }

  if (month === 10 || month === 11) return "regular";
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
    tipDate: firstRegularSeasonTipDate(canonicalSeasonFromStartYear(startYear)),
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
