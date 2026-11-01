import { remapScheduleDay } from "@/gm/engine/schedule";
/**
 * Emirates NBA Cup, run the way the league runs it.
 * Group games are already on the slate. After those four games, the six
 * group winners and one wild card from each conference play a knockout.
 * Quarterfinals and semifinals count. The championship does not.
 * Everyone else plays the two December games that were left off the slate.
 */

import type { Conference, GmLeagueState, GmNewsItem, GmScheduleGame, GmTeam } from "@/gm/types";
import { uid } from "@/gm/engine/rng";

type CupId = "group" | "quarterfinal" | "semifinal" | "championship" | "makeup";

const GROUPS: Record<Conference, string[][]> = {
  East: [
    ["bkn", "det", "mil", "orl", "tor"],
    ["cle", "ind", "mia", "nyk", "phi"],
    ["atl", "bos", "cha", "chi", "was"],
  ],
  West: [
    ["dal", "den", "hou", "phx", "uta"],
    ["lac", "mem", "min", "nop", "okc"],
    ["gsw", "lal", "por", "sac", "sas"],
  ],
};

/** 2025-26 wins. Last tiebreaker before the drawing. */
const PRIOR_WINS: Record<string, number> = {
  atl: 46, bos: 56, bkn: 20, cha: 44, chi: 31, cle: 52, dal: 26, den: 54,
  det: 60, gsw: 37, hou: 52, ind: 19, lac: 42, lal: 53, mem: 25, mia: 43,
  mil: 32, min: 49, nop: 26, nyk: 53, okc: 64, orl: 45, phi: 45, phx: 45,
  por: 42, sac: 22, sas: 62, tor: 46, uta: 22, was: 17,
};

const CUP_NIGHTS: Array<[number, number]> = [
  [10, 30], [11, 6], [11, 13], [11, 20], [11, 24], [11, 25], [11, 27],
];

type Row = {
  id: string;
  wins: number;
  losses: number;
  diff: number;
  points: number;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** December of a season sits in the previous calendar year. */
export function cupDate(season: number, month: number, day: number): string {
  const year = month >= 8 ? season - 1 : season;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export type CupGroups = Record<Conference, string[][]>;

function groupOf(
  teamId: string,
  groups: CupGroups = GROUPS
): { conference: Conference; teams: string[] } | null {
  for (const conference of ["East", "West"] as const) {
    for (const teams of groups[conference]) {
      if (teams.includes(teamId)) return { conference, teams };
    }
  }
  return null;
}

/** Pots of three from last year's wins. One team from each pot lands in each group. */
export function drawCupGroups(teams: GmTeam[], wins: Record<string, number>): CupGroups {
  const drawn: CupGroups = { East: [[], [], []], West: [[], [], []] };
  for (const conference of ["East", "West"] as const) {
    const ranked = teams
      .filter((team) => team.conference === conference && !team.id.startsWith("as-"))
      .sort((a, b) => (wins[b.id] ?? 0) - (wins[a.id] ?? 0) || a.id.localeCompare(b.id));
    for (let pot = 0; pot < 5; pot += 1) {
      ranked.slice(pot * 3, pot * 3 + 3).forEach((team, index) => {
        drawn[conference][(pot + index) % 3]!.push(team.id);
      });
    }
  }
  return drawn;
}

/**
 * Later seasons keep the Cup nights, then fill those 60 slots with the new groups.
 * Each club plays the other four teams in its room.
 */
function groupRounds(ids: string[]): Array<Array<[string, string]>> {
  const rounds: Array<Array<[string, string]>> = [];
  const n = ids.length;
  for (let round = 0; round < n; round += 1) {
    const pairs: Array<[string, string]> = [];
    for (let step = 1; step <= Math.floor(n / 2); step += 1) {
      pairs.push([ids[(round + step) % n]!, ids[(round - step + n) % n]!]);
    }
    rounds.push(pairs);
  }
  return rounds;
}

export function retieCupGroupGames(
  schedule: GmScheduleGame[],
  groups: CupGroups,
  season: number
): GmScheduleGame[] {
  const dates = CUP_NIGHTS.map(([month, day]) => cupDate(season, month, day));
  const slotIndexes: number[] = [];
  schedule.forEach((game, index) => {
    if (game.gameDate && dates.includes(game.gameDate)) slotIndexes.push(index);
  });
  if (slotIndexes.length !== 60) return schedule;
  const rooms = (["East", "West"] as const).flatMap((conference) => groups[conference]);
  if (rooms.length !== 6 || rooms.some((room) => room.length !== 5)) return schedule;
  const byDate = new Map<string, number>();
  for (const index of slotIndexes) {
    const date = schedule[index]!.gameDate!;
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  const hostDates = [...dates].sort((a, b) => (byDate.get(b) ?? 0) - (byDate.get(a) ?? 0)).slice(0, 5);
  const dayByDate = new Map<string, number>();
  for (const game of schedule) {
    if (game.gameDate && hostDates.includes(game.gameDate) && !dayByDate.has(game.gameDate)) {
      dayByDate.set(game.gameDate, game.day);
    }
  }
  const tips: Array<{ date: string; home: string; away: string }> = [];
  const homeCount = new Map<string, number>();
  rooms.forEach((room) => {
    groupRounds(room).forEach((pairs, round) => {
      const date = hostDates[round]!;
      for (const pair of pairs) {
        const homeFirst = (homeCount.get(pair[0]) ?? 0) <= (homeCount.get(pair[1]) ?? 0);
        const home = homeFirst ? pair[0] : pair[1];
        const away = homeFirst ? pair[1] : pair[0];
        homeCount.set(home, (homeCount.get(home) ?? 0) + 1);
        tips.push({ date, home, away });
      }
    });
  });
  if (tips.length !== slotIndexes.length) return schedule;
  const next = schedule.map((game) => ({ ...game }));
  slotIndexes.forEach((index, tipIndex) => {
    const tip = tips[tipIndex]!;
    const game = next[index]!;
    game.gameDate = tip.date;
    game.day = dayByDate.get(tip.date) ?? game.day;
    game.homeTeamId = tip.home;
    game.awayTeamId = tip.away;
    game.cup = "group";
  });
  return next;
}

function nights(season: number): Set<string> {
  return new Set(CUP_NIGHTS.map(([month, day]) => cupDate(season, month, day)));
}

export function tagGroupGames(
  schedule: GmScheduleGame[],
  season: number,
  groups?: CupGroups
): GmScheduleGame[] {
  const rooms = groups ?? GROUPS;
  const cupNights = nights(season);
  let changed = false;
  const next = schedule.map((game) => {
    if (!game.gameDate || !cupNights.has(game.gameDate)) return game;
    const home = groupOf(game.homeTeamId, rooms);
    const away = groupOf(game.awayTeamId, rooms);
    if (!home || !away || home.conference !== away.conference) return game;
    if (!home.teams.includes(game.awayTeamId)) return game;
    if (game.cup === "group") return game;
    changed = true;
    return { ...game, cup: "group" as const };
  });
  return changed ? next : schedule;
}

export function gameCounts(game: GmScheduleGame): boolean {
  return game.cup !== "championship" && game.exhibition !== "allstar";
}

function drawKey(id: string, season: number): number {
  let hash = season >>> 0;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function groupGames(schedule: GmScheduleGame[]): GmScheduleGame[] {
  return schedule.filter((game) => game.cup === "group" && game.played && game.homeScore != null && game.awayScore != null);
}

function rowFor(teamId: string, games: GmScheduleGame[]): Row {
  let wins = 0;
  let losses = 0;
  let diff = 0;
  let points = 0;
  for (const game of games) {
    if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) continue;
    const home = game.homeScore ?? 0;
    const away = game.awayScore ?? 0;
    const mine = game.homeTeamId === teamId ? home : away;
    const opp = game.homeTeamId === teamId ? away : home;
    points += mine;
    diff += mine - opp;
    if (mine > opp) wins += 1;
    else losses += 1;
  }
  return { id: teamId, wins, losses, diff, points };
}

function headToHead(games: GmScheduleGame[], a: string, b: string): number {
  let edge = 0;
  for (const game of games) {
    const pair = game.homeTeamId === a && game.awayTeamId === b
      ? 1
      : game.homeTeamId === b && game.awayTeamId === a
        ? -1
        : 0;
    if (!pair) continue;
    const homeWon = (game.homeScore ?? 0) > (game.awayScore ?? 0);
    const aWon = pair === 1 ? homeWon : !homeWon;
    edge += aWon ? 1 : -1;
  }
  return edge;
}

function priorTable(season: number, saved?: Record<string, number>): Record<string, number> {
  if (season > 2027) return saved ?? {};
  return PRIOR_WINS;
}

function compareRows(
  a: Row,
  b: Row,
  games: GmScheduleGame[],
  season: number,
  useHead: boolean,
  prior?: Record<string, number>
): number {
  if (a.wins !== b.wins) return b.wins - a.wins;
  if (useHead) {
    const edge = headToHead(games, a.id, b.id);
    if (edge !== 0) return -edge;
  }
  if (a.diff !== b.diff) return b.diff - a.diff;
  if (a.points !== b.points) return b.points - a.points;
  const table = priorTable(season, prior);
  const saved = (table[b.id] ?? 0) - (table[a.id] ?? 0);
  if (saved !== 0) return saved;
  return drawKey(a.id, season) - drawKey(b.id, season);
}

function rankTeams(
  ids: string[],
  games: GmScheduleGame[],
  season: number,
  useHead: boolean,
  prior?: Record<string, number>
): Row[] {
  const rows = ids.map((id) => rowFor(id, games));
  return rows.sort((a, b) => compareRows(a, b, games, season, useHead, prior));
}

export type CupGroupTable = {
  conference: Conference;
  rows: Row[];
};

export function cupTables(
  schedule: GmScheduleGame[],
  season: number,
  groups?: CupGroups,
  prior?: Record<string, number>
): CupGroupTable[] {
  const rooms = groups ?? GROUPS;
  const games = groupGames(tagGroupGames(schedule, season, rooms));
  const tables: CupGroupTable[] = [];
  for (const conference of ["East", "West"] as const) {
    for (const teams of rooms[conference]) {
      const started = games.some(
        (game) => teams.includes(game.homeTeamId) && teams.includes(game.awayTeamId)
      );
      tables.push({
        conference,
        rows: started ? rankTeams(teams, games, season, true, prior) : teams.map((id) => rowFor(id, [])),
      });
    }
  }
  return tables;
}

type Qualifier = { id: string; wild: boolean; row: Row };

function conferenceField(
  schedule: GmScheduleGame[],
  season: number,
  conference: Conference,
  groups: CupGroups = GROUPS,
  prior?: Record<string, number>
): Qualifier[] {
  const games = groupGames(schedule);
  const tables = groups[conference].map((teams) => rankTeams(teams, games, season, true, prior));
  const winners = tables.map((rows) => rows[0]!).filter(Boolean);
  const seconds = tables.map((rows) => rows[1]!).filter(Boolean);
  const wildOrder = [...seconds].sort((a, b) => compareRows(a, b, games, season, false, prior));
  const wild = wildOrder[0];
  if (!wild) return [];
  const field = [
    ...winners.map((row) => ({ id: row.id, wild: false, row })),
    { id: wild.id, wild: true, row: wild },
  ];
  const order = [...field].sort((a, b) => compareRows(a.row, b.row, games, season, true, prior));
  return order;
}

function tip(season: number, id: string, date: string, home: string, away: string, cup: CupId, neutral = false): GmScheduleGame {
  return {
    id,
    season,
    day: 0,
    gameDate: date,
    homeTeamId: home,
    awayTeamId: away,
    played: false,
    cup,
    ...(neutral ? { neutral: true } : {}),
  };
}

function meetings(schedule: GmScheduleGame[], a: string, b: string): number {
  return schedule.filter(
    (game) =>
      game.cup !== "makeup" &&
      game.cup !== "quarterfinal" &&
      game.cup !== "semifinal" &&
      game.cup !== "championship" &&
      ((game.homeTeamId === a && game.awayTeamId === b) ||
        (game.homeTeamId === b && game.awayTeamId === a))
  ).length;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Pair an even list. Prefer opponents who already meet three times on the slate. */
function pairTeams(
  ids: string[],
  schedule: GmScheduleGame[],
  used: Set<string>
): Array<[string, string]> {
  const need = new Set(ids);
  const pairs: Array<[string, string]> = [];
  while (need.size >= 2) {
    let best: [string, string] | null = null;
    let bestScore = -1;
    const open = [...need];
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        const a = open[i]!;
        const b = open[j]!;
        if (used.has(pairKey(a, b))) continue;
        const met = meetings(schedule, a, b);
        const score = met === 3 ? 30 : met === 2 ? 8 : met === 4 ? 6 : met === 1 ? 3 : 0;
        if (score > bestScore) {
          bestScore = score;
          best = [a, b];
        }
      }
    }
    if (!best) {
      const open = [...need];
      if (open.length < 2) break;
      best = [open[0]!, open[1]!];
    }
    pairs.push(best);
    used.add(pairKey(best[0], best[1]));
    need.delete(best[0]);
    need.delete(best[1]);
  }
  return pairs;
}

function hostOf(
  schedule: GmScheduleGame[],
  a: string,
  b: string,
  season: number,
  games: GmScheduleGame[],
  prior?: Record<string, number>
): string {
  const rows = rankTeams([a, b], games, season, true, prior);
  return rows[0]?.id ?? a;
}

function makeupGames(
  schedule: GmScheduleGame[],
  season: number,
  groups: CupGroups = GROUPS,
  prior?: Record<string, number>
): GmScheduleGame[] {
  const games = groupGames(schedule);
  const used = new Set<string>();
  const sides = (["East", "West"] as const).map((conference) => {
    const field = new Set(conferenceField(schedule, season, conference, groups, prior).map((team) => team.id));
    const rest = groups[conference].flat().filter((id) => !field.has(id));
    const ranked = rankTeams(rest, games, season, true, prior);
    const worst = ranked[ranked.length - 1]?.id;
    const second = ranked[ranked.length - 2]?.id;
    const pool = ranked.slice(0, -2).map((row) => row.id);
    if (!worst || !second) return null;
    return {
      worst,
      second,
      round1: pairTeams([second, ...pool], schedule, used),
      round2: pairTeams([worst, ...pool], schedule, used),
    };
  });
  const east = sides[0];
  const west = sides[1];
  if (!east || !west) return [];
  const roundOne: Array<[string, string]> = [
    [east.worst, west.worst],
    ...east.round1,
    ...west.round1,
  ];
  const roundTwo: Array<[string, string]> = [
    [east.second, west.second],
    ...east.round2,
    ...west.round2,
  ];
  const out: GmScheduleGame[] = [];
  const place = (pairs: Array<[string, string]>, day: number) => {
    const date = cupDate(season, 12, day);
    for (const [a, b] of pairs) {
      const home = hostOf(schedule, a, b, season, games, prior);
      const away = home === a ? b : a;
      out.push(tip(season, `cupmake_${season}_${date}_${home}_${away}`, date, home, away, "makeup"));
    }
  };
  place(roundOne, 6);
  place(roundTwo, 9);
  return out;
}

function quarterfinals(
  schedule: GmScheduleGame[],
  season: number,
  groups: CupGroups = GROUPS,
  prior?: Record<string, number>
): GmScheduleGame[] {
  const games = groupGames(schedule);
  const out: GmScheduleGame[] = [];
  for (const conference of ["East", "West"] as const) {
    const field = conferenceField(schedule, season, conference, groups, prior);
    const wild = field.find((team) => team.wild);
    const host = field.find((team) => !team.wild);
    if (!wild || !host) continue;
    const others = field.filter((team) => team.id !== wild.id && team.id !== host.id);
    const otherHome = others[0];
    const otherAway = others[1];
    if (!otherHome || !otherAway) continue;
    const side = conference === "East" ? "east" : "west";
    out.push(
      tip(
        season,
        `cupqf_${season}_${side}_wild`,
        cupDate(season, 12, 4),
        host.id,
        wild.id,
        "quarterfinal"
      )
    );
    out.push(
      tip(
        season,
        `cupqf_${season}_${side}_other`,
        cupDate(season, 12, 5),
        otherHome.id,
        otherAway.id,
        "quarterfinal"
      )
    );
  }
  return out;
}

function winnerId(game: GmScheduleGame): string | null {
  if (!game.played || game.homeScore == null || game.awayScore == null) return null;
  return game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
}

function loserId(game: GmScheduleGame): string | null {
  if (!game.played || game.homeScore == null || game.awayScore == null) return null;
  return game.homeScore > game.awayScore ? game.awayTeamId : game.homeTeamId;
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

function teamLabel(teams: GmTeam[], id: string): string {
  const team = teams.find((entry) => entry.id === id);
  return team ? `${team.city} ${team.name}` : id.toUpperCase();
}

function newsItem(league: GmLeagueState, day: number, headline: string, body: string): GmNewsItem {
  return { id: uid("news"), day, season: league.season, headline, body, tone: "info" };
}

/**
 * Write the next Cup games onto the schedule once the results that decide
 * them are in. Safe to call every day. Does nothing until group play is finished.
 */
export function ensureNbaCup(league: GmLeagueState): GmLeagueState {
  const season = league.season;
  const groups = league.cupGroups ?? GROUPS;
  const prior = league.priorWins;
  const schedule = tagGroupGames(league.schedule, season, groups);
  const grouped = schedule.filter((game) => game.cup === "group");
  if (!grouped.length || grouped.some((game) => !game.played)) {
    return schedule === league.schedule ? league : { ...league, schedule };
  }

  const added: GmScheduleGame[] = [];
  const notes: string[] = [];
  if (!schedule.some((game) => game.cup === "quarterfinal")) {
    const qf = quarterfinals(schedule, season, groups, prior);
    const makeup = makeupGames(schedule, season, groups, prior);
    added.push(...qf, ...makeup);
    if (qf.length) {
      notes.push(
        `Quarterfinals are ${cupDate(season, 12, 4)} and ${cupDate(season, 12, 5)}. The final is ${cupDate(season, 12, 11)} and does not count in the standings.`
      );
    }
  }

  for (const conference of ["East", "West"] as const) {
    const side = conference === "East" ? "east" : "west";
    const qf = schedule.filter((game) => game.id.startsWith(`cupqf_${season}_${side}`));
    if (qf.length < 2 || qf.some((game) => !game.played)) continue;
    if (schedule.some((game) => game.id === `cupsemi_${season}_${side}`)) continue;
    const winners = qf.map(winnerId).filter((id): id is string => Boolean(id));
    const losers = qf.map(loserId).filter((id): id is string => Boolean(id));
    if (winners.length === 2) {
      const games = groupGames(schedule);
      const ranked = rankTeams(winners, games, season, true, prior);
      const home = ranked[0]!.id;
      const away = ranked[1]!.id;
      added.push(tip(season, `cupsemi_${season}_${side}`, cupDate(season, 12, 8), home, away, "semifinal"));
    }
    if (losers.length === 2 && !schedule.some((game) => game.id === `cuploser_${season}_${side}`)) {
      const games = groupGames(schedule);
      const home = hostOf(schedule, losers[0]!, losers[1]!, season, games, prior);
      const away = home === losers[0] ? losers[1]! : losers[0]!;
      added.push(
        tip(season, `cuploser_${season}_${side}`, cupDate(season, 12, 10), home, away, "makeup")
      );
    }
  }

  const semis = schedule.filter((game) => game.cup === "semifinal" && game.id.includes(`_${season}_`));
  const pendingSemis = added.filter((game) => game.cup === "semifinal");
  const semiSource = [...semis, ...pendingSemis];
  if (
    semiSource.length === 2 &&
    semiSource.every((game) => game.played) &&
    !schedule.some((game) => game.cup === "championship") &&
    !added.some((game) => game.cup === "championship")
  ) {
    const finalists = semiSource.map(winnerId).filter((id): id is string => Boolean(id));
    if (finalists.length === 2) {
      const games = groupGames(schedule);
      const ranked = rankTeams(finalists, games, season, true, prior);
      added.push(
        tip(
          season,
          `cupfinal_${season}`,
          cupDate(season, 12, 11),
          ranked[0]!.id,
          ranked[1]!.id,
          "championship",
          true
        )
      );
    }
  }

  if (!added.length && schedule === league.schedule) return league;
  const nextSchedule = reindex([...schedule, ...added]);
  const day = remapScheduleDay(league, nextSchedule);
  const extraNews = notes.map((body) => newsItem({ ...league, day }, day, "NBA Cup field is set", body));
  return {
    ...league,
    schedule: nextSchedule,
    day,
    news: [...extraNews, ...league.news].slice(0, 50),
  };
}

export function cupChampionNews(league: GmLeagueState, game: GmScheduleGame): GmNewsItem | null {
  if (game.cup !== "championship" || game.homeScore == null || game.awayScore == null) return null;
  const winner = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
  return newsItem(
    league,
    game.day,
    `${teamLabel(league.teams, winner)} win the NBA Cup`,
    "The championship does not count in the standings or the season stats."
  );
}

