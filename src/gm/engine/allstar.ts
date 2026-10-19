/**
 * All-Star Sunday, in the current U.S. vs World format.
 * Two American teams and one World team play three 12-minute games,
 * then the top two play the championship. None of it counts in the standings.
 * The 24 players are the ones who have played the best this season.
 */

import type { Conference, GmLeagueState, GmNewsItem, GmPlayer, GmScheduleGame, GmTeam } from "@/gm/types";
import { isRookie, isSophomore } from "@/gm/engine/awards";
import { overallOf } from "@/gm/engine/lineup";
import { getBundledPlayerBio } from "@/data/runtime/player-bio-snapshot";
import { uid } from "@/gm/engine/rng";

const STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA", "ID",
  "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC",
  "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
  "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY", "USA",
]);

export const SQUAD = {
  stars: "as-stars",
  stripes: "as-stripes",
  world: "as-world",
} as const;

const SQUAD_NAME: Record<string, string> = {
  [SQUAD.stars]: "USA Stars",
  [SQUAD.stripes]: "USA Stripes",
  [SQUAD.world]: "World",
  "as-rook": "Rookies",
  "as-soph": "Sophomores",
};

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days)).toISOString().slice(0, 10);
}

/** The February gap, and the Sunday the All-Star Game is played. */
export function allStarBreak(
  schedule: GmScheduleGame[]
): { start: string; end: string; sunday: string } | null {
  const dates = [
    ...new Set(
      schedule
        .filter((game) => game.exhibition !== "allstar")
        .map((game) => game.gameDate)
        .filter((date): date is string => Boolean(date))
    ),
  ].sort();
  let best: { prev: string; next: string; off: number } | null = null;
  for (let index = 1; index < dates.length; index++) {
    const prev = dates[index - 1]!;
    const next = dates[index]!;
    const off = Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`)) / 86_400_000) - 1;
    const first = addDays(prev, 1);
    if (first.slice(5, 7) !== "02" || off < 5) continue;
    if (!best || off > best.off) best = { prev, next, off };
  }
  if (!best) return null;
  const start = addDays(best.prev, 1);
  const end = addDays(best.next, -1);
  let sunday = start;
  while (sunday <= end && new Date(`${sunday}T00:00:00Z`).getUTCDay() !== 0) {
    sunday = addDays(sunday, 1);
  }
  if (sunday > end) sunday = start;
  return { start, end, sunday };
}

export function isUsaBorn(place: string | null | undefined): boolean {
  if (!place) return false;
  const last = place.split(",").pop()?.trim().toUpperCase() ?? "";
  if (STATES.has(last)) return true;
  return /^(USA|U\.S\.A\.|UNITED STATES|US)$/.test(last);
}

export function playerIsAmerican(player: GmPlayer): boolean {
  const bio = getBundledPlayerBio(player.nbaPlayerId ?? player.id, [player.id, player.nbaPlayerId]);
  if (!bio) return true;
  return isUsaBorn(bio.birthPlace);
}

/** Season box score first. Overall only breaks a thin sample. */
export function allStarForm(player: GmPlayer): number {
  const line = player.seasonLine;
  const overall = overallOf(player);
  if (!line || line.gp < 1 || line.min <= 0) return overall * 0.2;
  const perGame = (line.pts + line.reb * 0.7 + line.ast) / line.gp;
  const mpg = line.min / line.gp;
  const load = Math.min(mpg, 36) / 32;
  return perGame * load + overall * 0.08;
}

function conferenceOf(league: GmLeagueState, player: GmPlayer): Conference | null {
  if (!player.teamId) return null;
  return league.teams.find((team) => team.id === player.teamId)?.conference ?? null;
}

export function pickAllStars(league: GmLeagueState): { stars: string[]; stripes: string[]; world: string[] } {
  const pool = league.players.filter((player) => {
    if (!player.teamId || league.draftPool.includes(player.id)) return false;
    if (player.injury && player.injury.gamesRemaining > 0) return false;
    return conferenceOf(league, player) != null;
  });
  const rank = (conference: Conference) =>
    pool
      .filter((player) => conferenceOf(league, player) === conference)
      .sort((a, b) => allStarForm(b) - allStarForm(a) || a.name.localeCompare(b.name));
  const chosen = [...rank("East").slice(0, 12), ...rank("West").slice(0, 12)];
  const rest = pool.filter((player) => !chosen.includes(player)).sort((a, b) => allStarForm(b) - allStarForm(a));
  const americans = () => chosen.filter((player) => playerIsAmerican(player));
  const worldPlayers = () => chosen.filter((player) => !playerIsAmerican(player));
  while (worldPlayers().length < 8) {
    const next = rest.find((player) => !playerIsAmerican(player) && !chosen.includes(player));
    const drop = [...americans()].sort((a, b) => allStarForm(a) - allStarForm(b))[0];
    if (!next || !drop) break;
    const index = chosen.indexOf(drop);
    chosen[index] = next;
  }
  while (americans().length < 16) {
    const next = rest.find((player) => playerIsAmerican(player) && !chosen.includes(player));
    const drop = [...worldPlayers()].sort((a, b) => allStarForm(a) - allStarForm(b))[0];
    if (!next || !drop) break;
    const index = chosen.indexOf(drop);
    chosen[index] = next;
  }
  const usa = americans().sort((a, b) => allStarForm(b) - allStarForm(a));
  const stars: string[] = [];
  const stripes: string[] = [];
  usa.forEach((player, index) => {
    (index % 2 === 0 ? stars : stripes).push(player.id);
  });
  const world = worldPlayers()
    .sort((a, b) => allStarForm(b) - allStarForm(a))
    .map((player) => player.id);
  return { stars, stripes, world };
}

export function risingStars(league: GmLeagueState): { rookies: string[]; sophomores: string[] } {
  const pool = league.players.filter((player) => {
    if (!player.teamId || league.draftPool.includes(player.id)) return false;
    return conferenceOf(league, player) != null;
  });
  const take = (kind: "rook" | "soph") =>
    pool
      .filter((player) =>
        kind === "rook" ? isRookie(player, league.season) : isSophomore(player, league.season)
      )
      .sort((a, b) => allStarForm(b) - allStarForm(a) || a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((player) => player.id);
  return { rookies: take("rook"), sophomores: take("soph") };
}

/** East and West leaders. The three teams are still unnamed. */
export function allStarWatch(league: GmLeagueState): { east: string[]; west: string[] } {
  const pool = league.players.filter((player) => player.teamId && !league.draftPool.includes(player.id));
  const take = (conference: Conference) =>
    pool
      .filter((player) => conferenceOf(league, player) === conference)
      .sort((a, b) => allStarForm(b) - allStarForm(a) || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((player) => player.id);
  return { east: take("East"), west: take("West") };
}

function squadIds(allStar: NonNullable<GmLeagueState["allStar"]>, teamId: string): string[] {
  if (teamId === SQUAD.stars) return allStar.stars;
  if (teamId === SQUAD.stripes) return allStar.stripes;
  return allStar.world;
}

function tip(
  season: number,
  id: string,
  date: string,
  home: string,
  away: string,
  homeIds: string[],
  awayIds: string[]
): GmScheduleGame {
  return {
    id,
    season,
    day: 0,
    gameDate: date,
    homeTeamId: home,
    awayTeamId: away,
    played: false,
    exhibition: "allstar",
    neutral: true,
    span: 0.25,
    squad: [homeIds, awayIds],
  };
}

function reindex(schedule: GmScheduleGame[]): GmScheduleGame[] {
  const dates = [...new Set(schedule.map((game) => game.gameDate).filter((date): date is string => Boolean(date)))].sort();
  const dayByDate = new Map(dates.map((date, index) => [date, index]));
  return schedule
    .map((game) => ({
      ...game,
      day: game.gameDate ? (dayByDate.get(game.gameDate) ?? game.day) : game.day,
    }))
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
}

function winner(game: GmScheduleGame): string | null {
  if (!game.played || game.homeScore == null || game.awayScore == null) return null;
  return game.homeScore >= game.awayScore ? game.homeTeamId : game.awayTeamId;
}

function recordOf(schedule: GmScheduleGame[], teamId: string): { wins: number; diff: number } {
  let wins = 0;
  let diff = 0;
  for (const game of schedule) {
    if (game.exhibition !== "allstar" || !game.played) continue;
    if (game.id.endsWith("_final")) continue;
    if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) continue;
    const home = game.homeScore ?? 0;
    const away = game.awayScore ?? 0;
    const mine = game.homeTeamId === teamId ? home : away;
    const opp = game.homeTeamId === teamId ? away : home;
    diff += mine - opp;
    if (mine > opp) wins += 1;
  }
  return { wins, diff };
}

export function allStarSquadTeam(id: string, playerIds: string[], players: GmPlayer[]): GmTeam {
  const roster = playerIds
    .map((playerId) => players.find((player) => player.id === playerId))
    .filter((player): player is GmPlayer => Boolean(player))
    .sort((a, b) => overallOf(b) - overallOf(a));
  const slots = ["PG", "SG", "SF", "PF", "C"] as const;
  const starters = { PG: null, SG: null, SF: null, PF: null, C: null } as GmTeam["starters"];
  roster.slice(0, 5).forEach((player, index) => {
    starters[slots[index]!] = player.id;
  });
  const minutes: Record<string, number> = {};
  roster.forEach((player, index) => {
    minutes[player.id] = index < 5 ? 28 : 14;
  });
  const label = SQUAD_NAME[id] ?? id;
  return {
    id,
    abbr: id === SQUAD.world ? "WLD" : id === "as-soph" ? "SOP" : id === "as-rook" ? "ROK" : id === SQUAD.stripes ? "STP" : "STR",
    city: id === SQUAD.world ? "World" : "USA",
    name: label.replace("USA ", "").replace("World", "Team"),
    conference: "East",
    division: "All-Star",
    ownerPatience: 50,
    ownerGoal: "contend",
    fanConfidence: 80,
    payrollLuxuryTaxM: 0,
    staff: {
      headCoach: {
        name: "All-Star",
        offenseBonus: 0,
        defenseBonus: 0,
        developmentBonus: 0,
        offenseStyle: "pace_space",
        defenseStyle: "switch",
        tempo: "fast",
      },
      scoutLevel: 1,
      trainerLevel: 1,
    },
    starters,
    benchOrder: roster.slice(5).map((player) => player.id),
    draftPicks: [],
    tradeExceptionsM: [],
    coaching: {
      offense: "pace_space",
      defense: "switch",
      tempo: "fast",
      playThrough: [roster[0]?.id ?? null, roster[1]?.id ?? null],
      minutes,
    },
  };
}

export function squadLabel(teamId: string): string {
  return SQUAD_NAME[teamId] ?? teamId;
}

/**
 * Once the games before the break are done, name the teams and add Sunday's
 * games. Later games in the round robin wait on the result before them.
 */
export function ensureAllStar(league: GmLeagueState): GmLeagueState {
  const brk = allStarBreak(league.schedule);
  if (!brk) return league;
  const before = league.schedule.filter(
    (game) => game.exhibition !== "allstar" && game.gameDate && game.gameDate < brk.start
  );
  if (!before.length || before.some((game) => !game.played)) return league;
  const resumed = league.schedule.some(
    (game) => game.played && game.exhibition !== "allstar" && (game.gameDate ?? "") > brk.end
  );
  if (resumed && !league.allStar) return league;

  const season = league.season;
  let allStar = league.allStar;
  const notes: GmNewsItem[] = [];
  if (!allStar) {
    allStar = pickAllStars(league);
    notes.push({
      id: uid("news"),
      day: league.day,
      season,
      headline: "All-Star teams are set",
      body: `USA Stars, USA Stripes, and the World team were picked from this season. Rising Stars is the day before. They play ${brk.sunday}. The games do not count in the standings.`,
      tone: "info",
    });
  }

  const added: GmScheduleGame[] = [];
  const have = (id: string) => league.schedule.some((game) => game.id === id) || added.some((game) => game.id === id);
  if (!have(`as_${season}_rising`)) {
    const rising = risingStars(league);
    const saturday = addDays(brk.sunday, -1);
    if (rising.rookies.length >= 5 && rising.sophomores.length >= 5 && saturday >= brk.start && saturday <= brk.end) {
      added.push(
        tip(season, `as_${season}_rising`, saturday, "as-rook", "as-soph", rising.rookies, rising.sophomores)
      );
    }
  }
  if (!have(`as_${season}_g1`)) {
    added.push(
      tip(season, `as_${season}_g1`, brk.sunday, SQUAD.stars, SQUAD.world, allStar.stars, allStar.world)
    );
  }
  const g1 = league.schedule.find((game) => game.id === `as_${season}_g1`);
  const g1Winner = g1 ? winner(g1) : null;
  if (g1?.played && g1Winner && !have(`as_${season}_g2`)) {
    const loser = g1Winner === g1.homeTeamId ? g1.awayTeamId : g1.homeTeamId;
    added.push(
      tip(season, `as_${season}_g2`, brk.sunday, g1Winner, SQUAD.stripes, squadIds(allStar, g1Winner), allStar.stripes)
    );
    added.push(
      tip(season, `as_${season}_g3`, brk.sunday, loser, SQUAD.stripes, squadIds(allStar, loser), allStar.stripes)
    );
  }
  const g2 = league.schedule.find((game) => game.id === `as_${season}_g2`);
  const g3 = league.schedule.find((game) => game.id === `as_${season}_g3`);
  if (g2?.played && g3?.played && !have(`as_${season}_final`)) {
    const round = [...league.schedule, ...added].filter((game) => game.exhibition === "allstar" && !game.id.endsWith("_final"));
    const sides = [SQUAD.stars, SQUAD.stripes, SQUAD.world];
    const ranked = sides
      .map((id) => ({ id, ...recordOf(round, id) }))
      .sort((a, b) => b.wins - a.wins || b.diff - a.diff);
    const home = ranked[0]!;
    const away = ranked[1]!;
    added.push(
      tip(season, `as_${season}_final`, brk.sunday, home.id, away.id, squadIds(allStar, home.id), squadIds(allStar, away.id))
    );
  }

  if (!added.length && allStar === league.allStar) return league;
  const schedule = reindex([...league.schedule, ...added]);
  return {
    ...league,
    allStar,
    schedule,
    news: [...notes, ...league.news].slice(0, 50),
  };
}

export function allStarChampionNews(league: GmLeagueState, game: GmScheduleGame): GmNewsItem | null {
  if (game.exhibition !== "allstar" || !game.id.endsWith("_final")) return null;
  if (game.homeScore == null || game.awayScore == null) return null;
  const id = game.homeScore >= game.awayScore ? game.homeTeamId : game.awayTeamId;
  return {
    id: uid("news"),
    day: game.day,
    season: league.season,
    headline: `${squadLabel(id)} win All-Star Sunday`,
    body: "Four 12-minute games. The result stays off the regular-season standings.",
    tone: "info",
  };
}
