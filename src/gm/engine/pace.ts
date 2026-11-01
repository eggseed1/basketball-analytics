/**
 * One regular-season day, plus the short recap shown after a skip.
 * Skipping should feel like a week of basketball, not an empty spinner.
 */

import type {
  GmBoxScore,
  GmDigestItem,
  GmLeagueState,
  GmPlayer,
  GmScheduleGame,
  GmStandingsRow,
  GmTeam,
} from "@/gm/types";
import { simulateGame, compactSimBox } from "@/gm/engine/simulate";
import { cupChampionNews, ensureNbaCup, gameCounts } from "@/gm/engine/cup";
import { allStarChampionNews, ensureAllStar } from "@/gm/engine/allstar";
import { maybeGrowInSeason, rollGameInjuries, tickInjuries } from "@/gm/engine/progression";
import { maxScheduleDay, regularSeasonComplete } from "@/gm/engine/schedule";
import { applyGameToStandings } from "@/gm/engine/standings";
import { noteTradeDeadline } from "@/gm/engine/offseason";
import { recordSimGame } from "@/gm/lib/season-line";
import { rebalanceForInjuryChanges, schemeHeadline, shiftSnapshot } from "@/gm/engine/coaching";
import { injuryReturnDate } from "@/gm/engine/injury-schedule";

export function stepDay(league: GmLeagueState): {
  league: GmLeagueState;
  seasonOver: boolean;
} {
  if (league.phase !== "regular") return { league, seasonOver: false };
  league = ensureAllStar(ensureNbaCup(league));
  const day = league.day;
  const due = league.schedule.filter((g) => !g.played && g.day <= day);
  if (!due.length) {
    const nextDay = league.day + 1;
    const maxDay = maxScheduleDay(league.schedule);
    if (nextDay > maxDay || regularSeasonComplete(league.schedule)) {
      return { league: maybeGrowInSeason(league), seasonOver: true };
    }
    return {
      league: maybeGrowInSeason(noteTradeDeadline({ ...league, day: nextDay })),
      seasonOver: false,
    };
  }

  let standings = { ...league.standings };
  let players = [...league.players];
  const playersBeforeInjuries = players;
  let schedule = [...league.schedule];
  let boxScores = [...league.boxScores];
  const trainer =
    league.teams.find((t) => t.id === league.userTeamId)?.staff.trainerLevel ??
    1;

  const dueIds = new Set(due.map((game) => game.id));
  let guard = 0;
  while (guard < 6) {
    guard += 1;
    const slate = schedule
      .filter((game) => !game.played && game.day <= day && (dueIds.has(game.id) || game.exhibition === "allstar"))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!slate.length) break;
    for (const g of slate) {
    const result = simulateGame(g, league.teams, players, undefined, schedule, league.settings);
    if (g.homeTeamId === league.userTeamId || g.awayTeamId === league.userTeamId) {
      const team = league.teams.find(row => row.id === league.userTeamId);
      if (team) result.box.shiftPlan = shiftSnapshot(team, players);
    }
    schedule = schedule.map((x) => (x.id === g.id ? result.game : x));
    if (gameCounts(g)) {
      players = recordSimGame(players, result.box, boxScores);
      standings = applyGameToStandings(
        standings,
        league.teams,
        g.homeTeamId,
        g.awayTeamId,
        result.game.homeScore!,
        result.game.awayScore!
      );
    }
    boxScores = [compactSimBox(result.box, league.userTeamId), ...boxScores].slice(0, 400);
    if (g.exhibition !== "allstar") {
      players = rollGameInjuries(
        { ...league, players },
        result.box.players.map((p) => p.playerId),
        g.day * 99 + g.id.length
      );
    }
    }
    const advanced = ensureAllStar({ ...league, schedule, players, standings, boxScores });
    schedule = advanced.schedule;
    if (!advanced.schedule.some((game) => !game.played && game.day === day && game.exhibition === "allstar" && !dueIds.has(game.id))) {
      break;
    }
  }
  players = tickInjuries(players, trainer, { teamIds: due.filter(g => g.exhibition !== "allstar").flatMap(g => [g.homeTeamId, g.awayTeamId]), before: playersBeforeInjuries, trainerByTeam: Object.fromEntries(league.teams.map(t => [t.id, t.staff.trainerLevel])) });
  const cupNews = schedule
    .filter((game) => game.played && game.day === day)
    .flatMap((game) => {
      const cup = cupChampionNews(league, game);
      const star = allStarChampionNews(league, game);
      return [cup, star].filter((item): item is NonNullable<typeof item> => Boolean(item));
    });
  let next: GmLeagueState = {
    ...league,
    schedule,
    standings,
    players,
    boxScores,
    news: [...cupNews, ...league.news].slice(0, 50),
    day,
  };
  next = rebalanceForInjuryChanges(next, playersBeforeInjuries);
  // Insert event dates before advancing, so the next day can be a Cup or
  // All-Star date that was absent from the original regular-season slate.
  next = ensureAllStar(ensureNbaCup(next));
  next = noteTradeDeadline({ ...next, day: Math.min(next.day + 1, maxScheduleDay(next.schedule) + 1) });
  return {
    league: maybeGrowInSeason(next),
    seasonOver: regularSeasonComplete(schedule),
  };
}

function userGame(box: GmBoxScore, userTeamId: string) {
  return box.homeTeamId === userTeamId || box.awayTeamId === userTeamId;
}

function margin(box: GmBoxScore) {
  return Math.abs(box.homeScore - box.awayScore);
}

function userWon(box: GmBoxScore, userTeamId: string) {
  const home = box.homeTeamId === userTeamId;
  return home
    ? box.homeScore > box.awayScore
    : box.awayScore > box.homeScore;
}

function line(player: GmBoxScore["players"][number]) {
  return `${player.points} points, ${player.rebounds} rebounds, ${player.assists} assists`;
}

export function buildDigest(opts: {
  boxes: GmBoxScore[];
  userTeamId: string;
  players: GmPlayer[];
  winsBefore: number;
  lossesBefore: number;
  winsAfter: number;
  lossesAfter: number;
  injuries: Array<{
    name: string;
    type: string;
    games: number;
    yours: boolean;
    returnDate?: string | null;
  }>;
  standings?: Record<string, GmStandingsRow>;
  teams?: GmTeam[];
}): GmDigestItem[] {
  const items: GmDigestItem[] = [];
  const yours = opts.boxes.filter((box) => userGame(box, opts.userTeamId));
  const gainedW = opts.winsAfter - opts.winsBefore;
  const gainedL = opts.lossesAfter - opts.lossesBefore;
  if (yours.length && gainedW + gainedL > 0) {
    const close = yours.find((box) => margin(box) <= 3);
    items.push({
      tone: gainedW >= gainedL ? "good" : "bad",
      headline: `You went ${gainedW}-${gainedL}`,
      detail: close
        ? `One of them was ${close.awayTeamId.toUpperCase()} ${close.awayScore}, ${close.homeTeamId.toUpperCase()} ${close.homeScore}.`
        : `${opts.winsAfter}-${opts.lossesAfter} on the season.`,
      gameId: close?.id,
    });
  }

  const best = yours
    .flatMap((box) =>
      box.players
        .filter((p) => p.teamId === opts.userTeamId)
        .map((p) => ({ box, p }))
    )
    .sort((a, b) => b.p.points - a.p.points)[0];
  if (best && best.p.points >= 25) {
    items.push({
      tone: "good",
      headline: `${best.p.playerName} scored ${best.p.points}`,
      detail: line(best.p),
      gameId: best.box.id,
    });
  }

  const userTeam = opts.teams?.find((team) => team.id === opts.userTeamId);
  const scheme = schemeHeadline(userTeam?.coaching);
  if (scheme && yours.length) {
    const side = yours.flatMap((box) => box.players.filter((p) => p.teamId === opts.userTeamId));
    const threes = side.reduce((sum, p) => sum + p.tpa, 0);
    const shots = side.reduce((sum, p) => sum + p.fga, 0);
    const firstId = userTeam?.coaching?.playThrough[0];
    const first = firstId ? side.filter((p) => p.playerId === firstId) : [];
    const firstPoints = first.reduce((sum, p) => sum + p.points, 0);
    const firstName = first[0]?.playerName;
    items.push({
      tone: "info",
      headline: scheme,
      detail: firstName
        ? `${threes} threes on ${shots} shots. ${firstName} scored ${firstPoints}.`
        : `${threes} threes on ${shots} shots.`,
    });
  }

  const explosion = opts.boxes
    .flatMap((box) => box.players.map((p) => ({ box, p })))
    .filter((row) => row.p.points >= 40 && row.p.teamId !== opts.userTeamId)
    .sort((a, b) => b.p.points - a.p.points)[0];
  if (explosion) {
    items.push({
      tone: "info",
      headline: `${explosion.p.playerName} went for ${explosion.p.points}`,
      detail: `${explosion.box.awayTeamId.toUpperCase()} at ${explosion.box.homeTeamId.toUpperCase()}.`,
      gameId: explosion.box.id,
    });
  }

  if (opts.standings && opts.teams?.length) {
    const ranked = opts.teams
      .map((team) => {
        const row = opts.standings?.[team.id];
        return {
          abbr: team.abbr,
          id: team.id,
          wins: row?.wins ?? 0,
          losses: row?.losses ?? 0,
        };
      })
      .filter((row) => row.wins + row.losses > 0)
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    const leader = ranked[0];
    const place = ranked.findIndex((row) => row.id === opts.userTeamId);
    if (leader && place >= 0) {
      items.push({
        tone: "info",
        headline: `${leader.abbr} leads the league at ${leader.wins}-${leader.losses}`,
        detail: `You are ${place + 1} of ${ranked.length}.`,
      });
    }
  }

  const hurt = opts.injuries.find((row) => row.yours) ?? opts.injuries[0];
  if (hurt) {
    items.push({
      tone: "bad",
      headline: `${hurt.name} is out`,
      detail: hurt.returnDate
        ? `${hurt.type}. About ${hurt.games} games · due back ${hurt.returnDate}.`
        : `${hurt.type}. About ${hurt.games} games.`,
    });
  }

  if (!items.length) {
    items.push({
      tone: "info",
      headline: "Quiet stretch",
      detail: "No thriller, no big night, no new injury.",
    });
  }
  return items.slice(0, 5);
}

export function newInjuries(
  before: GmPlayer[],
  after: GmPlayer[],
  userTeamId: string,
  schedule?: GmScheduleGame[],
  day?: number
) {
  const prev = new Map(before.map((p) => [p.id, p]));
  const found: Array<{
    name: string;
    type: string;
    games: number;
    yours: boolean;
    returnDate?: string | null;
  }> = [];
  for (const player of after) {
    const old = prev.get(player.id);
    if (!player.injury || old?.injury) continue;
    const star = player.ratings.impact >= 2 || player.teamId === userTeamId;
    if (!star) continue;
    const returnDate =
      schedule && day != null
        ? injuryReturnDate(player, schedule, day)
        : null;
    found.push({
      name: player.name,
      type: player.injury.type,
      games: player.injury.gamesRemaining,
      yours: player.teamId === userTeamId,
      returnDate,
    });
  }
  return found.slice(0, 3);
}

