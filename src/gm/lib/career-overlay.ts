import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import { simCountingLine } from "@/gm/lib/counting";
import type { GmCountingLine, GmLeagueState, GmPlayer } from "@/gm/types";

/** Shape shared with the GM player-card career table and /api/players seasons. */
export type GmCareerSeasonRow = {
  season?: string;
  teamAbbreviation?: string;
  teamName?: string;
  gamesPlayed?: number;
  minutes?: number;
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  fieldGoalsMade?: number;
  fieldGoalsAttempted?: number;
  threePointersMade?: number;
  threePointersAttempted?: number;
  freeThrowsMade?: number;
  freeThrowsAttempted?: number;
  trueShootingPct?: number;
  per?: number;
  winShares?: number;
  bpm?: number;
  /** Row comes from this Franchise Lab save, not the NBA file. */
  fromSim?: boolean;
};

/** End year for "2026-27" → 2027, or a bare "2027" seasonLine key. */
export function endYearFromSeasonLabel(
  season: string | number | undefined
): number | null {
  if (season == null) return null;
  const s = String(season).trim();
  const canonical = /^(\d{4})-(\d{2})$/.exec(s);
  if (canonical) return Number(canonical[1]) + 1;
  if (/^\d{4}$/.test(s)) return Number(s);
  return null;
}

export function seasonOverlapsEndYear(
  season: string | number | undefined,
  endYear: number
): boolean {
  return endYearFromSeasonLabel(season) === endYear;
}

function lineToCareerRow(
  line: GmCountingLine,
  endYear: number,
  teamId?: string | null
): GmCareerSeasonRow {
  const team = (teamId ?? line.team ?? "").trim();
  const abbr = team ? team.toUpperCase() : undefined;
  const den = 2 * (line.fga + 0.44 * line.fta);
  return {
    season: canonicalSeasonFromStartYear(endYear - 1),
    teamAbbreviation: abbr,
    gamesPlayed: line.gp,
    minutes: line.min,
    points: line.pts,
    rebounds: line.reb,
    assists: line.ast,
    steals: line.stl,
    blocks: line.blk,
    fieldGoalsMade: line.fgm,
    fieldGoalsAttempted: line.fga,
    threePointersMade: line.tpm,
    threePointersAttempted: line.tpa,
    freeThrowsMade: line.ftm,
    freeThrowsAttempted: line.fta,
    trueShootingPct: den > 0 ? line.pts / den : undefined,
    fromSim: true,
  };
}

/**
 * Replace real NBA rows for years this save owns with sim counting lines.
 * Always strips the live `league.season` year so real 2026-27 never sits on
 * top of a Franchise Lab season in progress.
 */
export function overlaySimCareerSeasons(
  apiRows: GmCareerSeasonRow[],
  league: GmLeagueState,
  player: GmPlayer
): GmCareerSeasonRow[] {
  const overlays = new Map<number, GmCareerSeasonRow>();

  const current = simCountingLine(league, player.id);
  if (current && current.gp > 0) {
    overlays.set(
      league.season,
      lineToCareerRow(current, league.season, player.teamId)
    );
  } else if (
    player.seasonLine &&
    player.seasonLine.gp > 0 &&
    seasonOverlapsEndYear(player.seasonLine.season, league.season)
  ) {
    overlays.set(
      league.season,
      lineToCareerRow(player.seasonLine, league.season, player.teamId)
    );
  }

  if (player.priorLine && player.priorLine.gp > 0) {
    const priorYear = endYearFromSeasonLabel(player.priorLine.season);
    if (priorYear != null && priorYear !== league.season) {
      overlays.set(
        priorYear,
        lineToCareerRow(player.priorLine, priorYear, player.teamId)
      );
    }
  }

  const stripYears = new Set<number>([league.season, ...overlays.keys()]);
  const kept = apiRows.filter((row) => {
    const year = endYearFromSeasonLabel(row.season);
    if (year == null) return true;
    return !stripYears.has(year);
  });

  return [...overlays.values(), ...kept].sort((a, b) =>
    String(b.season ?? "").localeCompare(String(a.season ?? ""))
  );
}

/** True when the seeded entry line is the same year this save is playing. */
export function entrySeasonIsCurrentSaveYear(
  nbaSeason: GmCountingLine | undefined,
  leagueSeason: number
): boolean {
  if (!nbaSeason) return false;
  return seasonOverlapsEndYear(nbaSeason.season, leagueSeason);
}
