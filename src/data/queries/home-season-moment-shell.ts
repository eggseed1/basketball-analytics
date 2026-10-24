import "server-only";

import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import {
  guessHomeSeasonPhase,
  type HomeSeasonMoment,
  type HomeSeasonPhase,
  type ScheduleMarks,
} from "@/lib/home-season-moment";
import { nbaTodayIso } from "@/lib/nba-calendar-date";

function emptyMarks(season: string): ScheduleMarks {
  return {
    season,
    preseasonStart: null,
    opener: null,
    regularEnd: null,
    playoffStart: null,
    openerGames: [],
    champion: null,
  };
}

/**
 * Calendar-only home bootstrap — no game-snapshot.json on the module graph.
 * Real schedule marks load inside streamed moment/calendar modules.
 */
export function getHomeShellBootstrap(now = new Date()): {
  today: string;
  season: string;
  phase: HomeSeasonPhase;
  moment: HomeSeasonMoment;
} {
  const today = nbaTodayIso(now);
  const year = Number(today.slice(0, 4));
  const startYear = Number(today.slice(5, 7)) >= 7 ? year : year - 1;
  const season = canonicalSeasonFromStartYear(startYear);
  const phase = guessHomeSeasonPhase(today);
  return {
    today,
    season,
    phase,
    moment: {
      phase,
      today,
      season,
      marks: emptyMarks(season),
      champion: null,
      daysToOpener: null,
      daysToPreseason: null,
      regularDaysLeft: null,
      regularWeek: null,
    },
  };
}
