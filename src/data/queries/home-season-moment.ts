import "server-only";

import { cache } from "react";

import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import { fetchScoreboardMonth } from "@/data/providers/nba/scoreboard-client";
import { withBudget } from "@/data/queries/budget";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import type { Game } from "@/data/types";
import {
  guessHomeSeasonPhase,
  resolveHomeSeasonMoment,
  scheduleMarks,
  type HomeSeasonMoment,
} from "@/lib/home-season-moment";
import { nbaTodayIso } from "@/lib/nba-calendar-date";

const LIVE_SCHEDULE_BUDGET_MS = 2_500;

/**
 * The bundled schedule only refreshes in-season, so a schedule released in
 * August may be missing. Ask ESPN for the October slate before saying the
 * schedule isn't out.
 */
async function liveOctoberSlate(season: string, startYear: number): Promise<Game[]> {
  const { value } = await withBudget(
    fetchScoreboardMonth({ monthKey: `${startYear}-10`, season }),
    LIVE_SCHEDULE_BUDGET_MS,
    [] as Game[]
  );
  return value.filter((g) => g.season === season);
}

function seasonWindow(now: Date): {
  today: string;
  startYear: number;
  season: string;
  previousSeason: string;
} {
  const today = nbaTodayIso(now);
  const year = Number(today.slice(0, 4));
  const startYear = Number(today.slice(5, 7)) >= 7 ? year : year - 1;
  return {
    today,
    startYear,
    season: canonicalSeasonFromStartYear(startYear),
    previousSeason: canonicalSeasonFromStartYear(startYear - 1),
  };
}

async function resolveFromGames(
  today: string,
  season: string,
  previousSeason: string,
  currentGames: Game[]
): Promise<HomeSeasonMoment> {
  return resolveHomeSeasonMoment({
    today,
    current: scheduleMarks(season, currentGames, today),
    previous: scheduleMarks(
      previousSeason,
      await getRuntimeSnapshotGames(previousSeason),
      today
    ),
  });
}

/**
 * Snapshot-only moment. Sync, no ESPN. Use this for the home shell so the
 * module grid never waits on a live schedule fetch.
 */
export async function getHomeSeasonMomentSync(now = new Date()): Promise<HomeSeasonMoment> {
  const { today, season, previousSeason } = seasonWindow(now);
  return resolveFromGames(
    today,
    season,
    previousSeason,
    await getRuntimeSnapshotGames(season)
  );
}

/**
 * True when the bundled slate has no regular-season opener yet and we are in
 * the Aug–Oct window where ESPN may still have the October schedule.
 */
export function homeSeasonMomentNeedsLiveEnrichment(
  moment: HomeSeasonMoment,
  now = new Date()
): boolean {
  const { today, startYear } = seasonWindow(now);
  if (moment.marks.opener) return false;
  return today >= `${startYear}-08-01`;
}

async function loadHomeSeasonMoment(now: Date): Promise<HomeSeasonMoment> {
  const { today, startYear, season, previousSeason } = seasonWindow(now);
  let currentGames = await getRuntimeSnapshotGames(season);
  const hasRegular = currentGames.some((g) => g.gameType === "regular");
  if (!hasRegular && today >= `${startYear}-08-01`) {
    const live = await liveOctoberSlate(season, startYear).catch(() => [] as Game[]);
    if (live.length) currentGames = live;
  }
  return resolveFromGames(today, season, previousSeason, currentGames);
}

/**
 * Full moment, including a budgeted ESPN October fetch when the snapshot is
 * thin. Prefer `getHomeSeasonMomentSync` for the home shell; call this inside
 * streamed moment/calendar modules when enrichment is needed.
 * Request-scoped via React cache so moment + calendar + phase-bar share one load.
 * No `now` arg — a fresh Date per call would bust the cache key.
 */
export const getHomeSeasonMoment = cache(async function getHomeSeasonMoment(): Promise<HomeSeasonMoment> {
  return loadHomeSeasonMoment(new Date());
});

/**
 * Layout phase for the first home paint: snapshot when it has an opener,
 * calendar guess when the slate is still thin (avoids blocking on ESPN).
 */
export function homeShellPhase(moment: HomeSeasonMoment, now = new Date()) {
  if (homeSeasonMomentNeedsLiveEnrichment(moment, now)) {
    return guessHomeSeasonPhase(moment.today);
  }
  return moment.phase;
}
