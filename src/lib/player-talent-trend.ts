/**
 * Career talent trend on a season axis.
 * Small dots are games. The line runs through one point per season, the
 * published rate for impact stats and the mean of the games for box stats.
 */

export type TalentSample = {
  year: number;
  game: number;
  value: number;
  teamId?: string;
  teamAbbr?: string;
};

export type TalentSeasonMark = {
  year: number;
  value: number;
  season?: string;
  teamId?: string;
  teamAbbr?: string;
};

export type TalentGame = {
  date: string;
  minutes: number;
  box?: number | null;
  /** Per-36 box score. Impact dots are this, recentered on the season rate. */
  boxScore?: number | null;
  teamId?: string;
  teamAbbr?: string;
};

/** A 10-point game-score gap moves the dot by about half a point. */
const BOX_RESIDUAL_SCALE = 0.05;
const BOX_RESIDUAL_CAP = 12;

export function fractionalSeasonYear(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = Date.UTC(year, 0, 1);
  const at = Date.UTC(year, month - 1, day);
  const end = Date.UTC(year + 1, 0, 1);
  if (!Number.isFinite(at) || end <= start) return null;
  return year + (at - start) / (end - start);
}

function seasonAnchorYear(season: string | undefined, games: TalentGame[]): number | null {
  const years = games
    .map((game) => fractionalSeasonYear(game.date))
    .filter((year): year is number => year != null)
    .sort((a, b) => a - b);
  if (years.length) return years[Math.floor((years.length - 1) / 2)]!;
  const match = /^(\d{4})-\d{2}$/.exec(season ?? "");
  if (!match) return null;
  return Number(match[1]) + 1.2;
}

function ease(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
}

function seasonTeam(
  season: { teamId?: string; teamAbbr?: string; games: TalentGame[] }
): { teamId?: string; teamAbbr?: string } {
  if (season.teamId) {
    return { teamId: season.teamId, teamAbbr: season.teamAbbr };
  }
  // Mid-season trades: use the last game's club (matches seasons-board TOT rows
  // when the season point already carries the primary / total team).
  for (let i = season.games.length - 1; i >= 0; i--) {
    const game = season.games[i]!;
    if (game.teamId) {
      return { teamId: game.teamId, teamAbbr: game.teamAbbr };
    }
  }
  return {};
}

export function buildTalentSeries(options: {
  kind: "impact" | "box";
  seasons: Array<{
    value: number;
    season?: string;
    teamId?: string;
    teamAbbr?: string;
    games: TalentGame[];
  }>;
}): { dots: TalentSample[]; line: TalentSeasonMark[] } | null {
  const dots: TalentSample[] = [];
  const line: TalentSeasonMark[] = [];
  let carried: number | null = null;

  for (const season of options.seasons) {
    if (!Number.isFinite(season.value)) continue;
    const games = [...season.games]
      .filter((game) => game.minutes > 0 && fractionalSeasonYear(game.date) != null)
      .sort((a, b) => a.date.localeCompare(b.date));
    const anchor = seasonAnchorYear(season.season, games);
    if (anchor == null) {
      carried = season.value;
      continue;
    }
    const team = seasonTeam({ ...season, games });

    if (options.kind === "impact") {
      const start = carried ?? 0;
      const scores = games.map((game) =>
        game.boxScore != null && Number.isFinite(game.boxScore)
          ? game.boxScore
          : null
      );
      const finite = scores.filter((score): score is number => score != null);
      const mean =
        finite.length > 0
          ? finite.reduce((sum, score) => sum + score, 0) / finite.length
          : null;
      games.forEach((game, index) => {
        const year = fractionalSeasonYear(game.date)!;
        const toward = ease((index + 1) / games.length);
        const base = start * (1 - toward) + season.value * toward;
        let value = base;
        const score = scores[index];
        if (mean != null && score != null) {
          const residual = Math.max(
            -BOX_RESIDUAL_CAP,
            Math.min(BOX_RESIDUAL_CAP, score - mean)
          );
          value += residual * BOX_RESIDUAL_SCALE;
        }
        dots.push({
          year,
          game: dots.length + 1,
          value,
          teamId: game.teamId ?? team.teamId,
          teamAbbr: game.teamAbbr ?? team.teamAbbr,
        });
      });
      line.push({
        year: anchor,
        value: season.value,
        season: season.season,
        teamId: team.teamId,
        teamAbbr: team.teamAbbr,
      });
    } else {
      const boxes: number[] = [];
      const recorded: Array<{
        year: number;
        value: number;
        teamId?: string;
        teamAbbr?: string;
      }> = [];
      for (const game of games) {
        if (game.box == null || !Number.isFinite(game.box)) continue;
        const year = fractionalSeasonYear(game.date)!;
        boxes.push(game.box);
        recorded.push({
          year,
          value: game.box,
          teamId: game.teamId ?? team.teamId,
          teamAbbr: game.teamAbbr ?? team.teamAbbr,
        });
      }
      // A whole season of zeros against a real season rate is a missing log,
      // not a player who never recorded the stat.
      const missingLog =
        boxes.length > 0 &&
        boxes.every((value) => value === 0) &&
        season.value > 0;
      if (!missingLog) {
        for (const point of recorded) {
          dots.push({
            year: point.year,
            game: dots.length + 1,
            value: point.value,
            teamId: point.teamId,
            teamAbbr: point.teamAbbr,
          });
        }
      }
      const average =
        !missingLog && boxes.length
          ? boxes.reduce((sum, value) => sum + value, 0) / boxes.length
          : season.value;
      line.push({
        year: anchor,
        value: average,
        season: season.season,
        teamId: team.teamId,
        teamAbbr: team.teamAbbr,
      });
    }
    carried = season.value;
  }

  line.sort((a, b) => a.year - b.year);
  if (dots.length < 2 && line.length < 2) return null;
  return { dots, line };
}
