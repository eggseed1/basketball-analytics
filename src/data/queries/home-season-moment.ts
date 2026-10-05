import "server-only";

import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import { fetchScoreboardMonth } from "@/data/providers/nba/scoreboard-client";
import { withBudget } from "@/data/queries/budget";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import type { Game } from "@/data/types";
import {
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

export async function getHomeSeasonMoment(now = new Date()): Promise<HomeSeasonMoment> {
  const today = nbaTodayIso(now);
  const year = Number(today.slice(0, 4));
  const startYear = Number(today.slice(5, 7)) >= 7 ? year : year - 1;
  const season = canonicalSeasonFromStartYear(startYear);
  const previousSeason = canonicalSeasonFromStartYear(startYear - 1);

  let currentGames = getRuntimeSnapshotGames(season);
  const hasRegular = currentGames.some((g) => g.gameType === "regular");
  if (!hasRegular && today >= `${startYear}-08-01`) {
    const live = await liveOctoberSlate(season, startYear).catch(() => [] as Game[]);
    if (live.length) currentGames = live;
  }

  return resolveHomeSeasonMoment({
    today,
    current: scheduleMarks(season, currentGames, today),
    previous: scheduleMarks(previousSeason, getRuntimeSnapshotGames(previousSeason), today),
  });
}
