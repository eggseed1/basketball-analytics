/**
 * Regular-season awards. The race uses this year's box score and the team's
 * record. A big line on a losing team can still win, the way it sometimes
 * does, but voters lean toward players who played and whose teams won.
 */

import type {
  GmAwardRace,
  GmCountingLine,
  GmLeagueState,
  GmNewsItem,
  GmPlayer,
  GmTeam,
} from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";
import { clamp, uid } from "@/gm/engine/rng";

const VOTE_POINTS = [10, 7, 5, 3, 1] as const;

const TITLES: Record<GmAwardRace["id"], string> = {
  mvp: "MVP",
  dpoy: "Defensive Player",
  roy: "Rookie of the Year",
  smoy: "Sixth Man",
  mip: "Most Improved",
  coty: "Coach of the Year",
  "all-nba-1": "All-NBA First",
  "all-nba-2": "All-NBA Second",
  "all-nba-3": "All-NBA Third",
  "all-def-1": "All-Defense First",
  "all-def-2": "All-Defense Second",
  "all-rook-1": "All-Rookie First",
  "all-rook-2": "All-Rookie Second",
};

function per(total: number, games: number): number {
  if (!Number.isFinite(total) || games < 1) return 0;
  return total / games;
}

function lineFor(player: GmPlayer, season: number): GmCountingLine | null {
  const line = player.seasonLine;
  if (!line || line.gp < 1) return null;
  const key = String(season);
  if (line.season === key || line.season.endsWith(key)) return line;
  return null;
}

function trueShooting(line: GmCountingLine): number | null {
  const attempts = line.fga + 0.44 * line.fta;
  if (!(attempts > 0)) return null;
  return line.pts / (2 * attempts);
}

/** One number for a scoring line. Higher means a louder box score. */
export function boxScoreValue(line: GmCountingLine): number {
  const games = line.gp;
  const shooting = trueShooting(line);
  const efficiency = shooting == null ? 0 : (shooting - 0.56) * 28;
  return (
    per(line.pts, games) +
    per(line.reb, games) * 0.7 +
    per(line.ast, games) * 1.1 +
    per(line.stl, games) * 1.6 +
    per(line.blk, games) * 1.5 -
    per(line.tov, games) * 0.9 +
    efficiency
  );
}

function gamesWeight(gp: number, seasonGames: number): number {
  const full = Math.max(12, Math.round(Math.max(seasonGames, gp) * 0.75));
  if (gp < full * 0.45) return 0.08;
  if (gp >= full) return 1;
  return 0.4 + ((gp - full * 0.45) / (full * 0.55)) * 0.6;
}

/** 50 wins sits near 1. A 30-win team is much lighter. */
function winWeight(wins: number): number {
  return Math.pow(Math.max(wins, 0) / 48, 1.35);
}

function recordOf(league: GmLeagueState, teamId: string | null): { wins: number; losses: number; margin: number } {
  const row = teamId ? league.standings[teamId] : undefined;
  const games = (row?.wins ?? 0) + (row?.losses ?? 0);
  const margin = games > 0 ? ((row?.pointsFor ?? 0) - (row?.pointsAgainst ?? 0)) / games : 0;
  return { wins: row?.wins ?? 0, losses: row?.losses ?? 0, margin };
}

function seasonGames(league: GmLeagueState): number {
  let most = 0;
  for (const row of Object.values(league.standings)) {
    most = Math.max(most, row.wins + row.losses);
  }
  return most;
}

function draftClassYear(player: GmPlayer): number | null {
  if (typeof player.draftYear === "number") return player.draftYear;
  const match = player.draftLabel?.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function isRookie(player: GmPlayer, season: number): boolean {
  const drafted = draftClassYear(player);
  if (drafted != null) return drafted === season - 1;
  const prior = player.priorLine ?? player.nbaSeason;
  if (prior && prior.gp >= 15) return false;
  return player.age <= 24;
}

export function isSophomore(player: GmPlayer, season: number): boolean {
  const drafted = draftClassYear(player);
  if (drafted != null) return drafted === season - 2;
  if (isRookie(player, season)) return false;
  const prior = player.priorLine ?? player.nbaSeason;
  return player.age <= 22 && Boolean(prior && prior.gp >= 15);
}

function countingDetail(line: GmCountingLine, extra?: string): string {
  const games = line.gp;
  const bits = [
    `${per(line.pts, games).toFixed(1)} points`,
    `${per(line.reb, games).toFixed(1)} rebounds`,
    `${per(line.ast, games).toFixed(1)} assists`,
  ];
  if (extra) bits.push(extra);
  bits.push(`${games} games`);
  return bits.join(", ");
}

function defenseDetail(line: GmCountingLine): string {
  const games = line.gp;
  return [
    `${per(line.stl, games).toFixed(1)} steals`,
    `${per(line.blk, games).toFixed(1)} blocks`,
    `${per(line.min, games).toFixed(1)} minutes`,
    `${games} games`,
  ].join(", ");
}

function teamName(league: GmLeagueState, teamId: string): string {
  const team = league.teams.find((entry) => entry.id === teamId);
  return team ? `${team.city} ${team.name}` : teamId.toUpperCase();
}

type RankRow = {
  id: string;
  name: string;
  teamId: string;
  detail: string;
  score: number;
};

function raceNote(top: RankRow[]): string | undefined {
  if (top.length < 2) return undefined;
  const lead = top[0]!.score;
  const second = top[1]!.score;
  if (!(lead > 0)) return undefined;
  const gap = (lead - second) / lead;
  if (gap < 0.04) return "Dead heat at the top";
  if (gap < 0.1) return "Tight race";
  if (gap > 0.28) return "Runaway favorite";
  return undefined;
}

function ranked(rows: RankRow[]): {
  candidates: GmAwardRace["candidates"];
  note?: string;
} {
  const top = rows
    .filter((row) => Number.isFinite(row.score) && row.score > Number.NEGATIVE_INFINITY)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5);
  const leader = top[0]?.score ?? 0;
  return {
    note: raceNote(top),
    candidates: top.map((row, index) => ({
      id: row.id,
      name: row.name,
      teamId: row.teamId,
      detail: row.detail,
      score: Math.round(row.score * 100) / 100,
      share: leader > 0 ? clamp(row.score / leader, 0, 1) : 0,
      votes: VOTE_POINTS[index],
    })),
  };
}

/** Games played by the busiest team — used for mid-season race copy. */
export function awardSeasonProgress(league: GmLeagueState): {
  played: number;
  full: number;
  ready: boolean;
} {
  const played = seasonGames(league);
  return { played, full: 82, ready: played >= 1 && playerPool(league).length > 0 };
}

function playerPool(league: GmLeagueState): Array<{ player: GmPlayer; line: GmCountingLine }> {
  const rows: Array<{ player: GmPlayer; line: GmCountingLine }> = [];
  for (const player of league.players) {
    if (!player.teamId || league.draftPool.includes(player.id)) continue;
    const line = lineFor(player, league.season);
    if (!line) continue;
    rows.push({ player, line });
  }
  return rows;
}

function expectedWins(league: GmLeagueState, team: GmTeam): number {
  const core = league.players
    .filter((player) => player.teamId === team.id)
    .sort((a, b) => overallOf(b) - overallOf(a))
    .slice(0, 8);
  if (core.length < 5) return 36;
  const average = core.reduce((sum, player) => sum + overallOf(player), 0) / core.length;
  return Math.max(18, Math.min(68, 41 + (average - 76) * 2.4));
}

function teamDefenseMul(league: GmLeagueState, teamId: string | null): number {
  const row = teamId ? league.standings[teamId] : undefined;
  const games = (row?.wins ?? 0) + (row?.losses ?? 0);
  if (!row || games < 1) return 1;
  const paa = row.pointsAgainst / games;
  // League-ish 112; stingier defenses lift DPOY / All-Defense candidates.
  return clamp(1.12 - (paa - 110) / 45, 0.78, 1.18);
}

export function awardRaces(league: GmLeagueState): GmAwardRace[] {
  const played = seasonGames(league);
  const pool = playerPool(league);
  if (played < 1 || pool.length === 0) {
    return (Object.keys(TITLES) as GmAwardRace["id"][]).map((id) => ({
      id,
      title: TITLES[id],
      candidates: [],
    }));
  }
  const mvp = ranked(
    pool.map(({ player, line }) => {
      const record = recordOf(league, player.teamId);
      const impact = Number.isFinite(player.ratings.impact)
        ? clamp(player.ratings.impact / 7, 0, 0.22)
        : 0;
      const marginMul = 1 + clamp(record.margin / 22, -0.08, 0.12);
      const score =
        boxScoreValue(line) *
        gamesWeight(line.gp, played) *
        (0.4 + winWeight(record.wins)) *
        (0.92 + impact) *
        marginMul;
      return {
        id: player.id,
        name: player.name,
        teamId: player.teamId!,
        detail: `${countingDetail(line)}, ${record.wins}-${record.losses}`,
        score,
      };
    })
  );

  const dpoy = ranked(
    pool.map(({ player, line }) => {
      const mpg = per(line.min, line.gp);
      const stocks = line.min > 0 ? ((line.stl + line.blk) / line.min) * 36 : 0;
      const skill = Number.isFinite(player.ratings.defense) ? player.ratings.defense : 0;
      const glass = Number.isFinite(player.ratings.rebounding) ? player.ratings.rebounding / 40 : 0;
      const minutesOk = mpg >= 24 ? 1 : mpg / 24;
      const record = recordOf(league, player.teamId);
      const score =
        (stocks * 7 + skill * 2.2 + glass) *
        gamesWeight(line.gp, played) *
        minutesOk *
        teamDefenseMul(league, player.teamId) *
        (0.78 + 0.22 * winWeight(record.wins));
      return {
        id: player.id,
        name: player.name,
        teamId: player.teamId!,
        detail: defenseDetail(line),
        score,
      };
    })
  );

  const roy = ranked(
    pool
      .filter(({ player }) => isRookie(player, league.season))
      .map(({ player, line }) => {
        const record = recordOf(league, player.teamId);
        const score =
          boxScoreValue(line) *
          gamesWeight(line.gp, played) *
          (0.8 + 0.2 * winWeight(record.wins));
        return {
          id: player.id,
          name: player.name,
          teamId: player.teamId!,
          detail: countingDetail(line),
          score,
        };
      })
  );

  const smoy = ranked(
    pool
      .filter(({ line }) => {
        const starts = line.gs ?? 0;
        if (line.gp < 1) return false;
        if (starts / line.gp >= 0.5) return false;
        const mpg = per(line.min, line.gp);
        return mpg >= 16 && mpg <= 32;
      })
      .map(({ player, line }) => {
        const record = recordOf(league, player.teamId);
        const starts = line.gs ?? 0;
        const score =
          boxScoreValue(line) *
          gamesWeight(line.gp, played) *
          (0.58 + 0.42 * winWeight(record.wins));
        return {
          id: player.id,
          name: player.name,
          teamId: player.teamId!,
          detail: countingDetail(
            line,
            `${per(line.min, line.gp).toFixed(1)} mpg · ${starts} starts`
          ),
          score,
        };
      })
  );

  const mip = ranked(
    pool
      .filter(({ player, line }) => {
        if (isRookie(player, league.season)) return false;
        const prior = player.priorLine ?? player.nbaSeason;
        return Boolean(prior && prior.gp >= 20 && line.gp >= Math.min(20, played));
      })
      .map(({ player, line }) => {
        const prior = (player.priorLine ?? player.nbaSeason)!;
        const jump = boxScoreValue(line) - boxScoreValue(prior);
        const minutes = per(line.min, line.gp) - per(prior.min, prior.gp);
        const age = player.age <= 27 ? 1.12 : player.age <= 30 ? 0.92 : 0.62;
        const score =
          (jump + Math.max(0, minutes) * 0.12) * age * gamesWeight(line.gp, played);
        const jumpLabel =
          jump >= 0 ? `+${jump.toFixed(1)} vs last year` : `${jump.toFixed(1)} vs last year`;
        return {
          id: player.id,
          name: player.name,
          teamId: player.teamId!,
          detail: `${countingDetail(line)} · ${jumpLabel}`,
          score,
        };
      })
      .filter((row) => row.score > 0.35)
  );

  const coty = ranked(
    league.teams.map((team) => {
      const record = recordOf(league, team.id);
      const coach = team.staff?.headCoach?.name;
      const surprise = record.wins - expectedWins(league, team);
      return {
        id: `coach:${team.id}`,
        name: coach || "Head coach",
        teamId: team.id,
        detail: `${record.wins}-${record.losses}, ${record.margin >= 0 ? "+" : ""}${record.margin.toFixed(1)} a game · expected ${expectedWins(league, team).toFixed(0)}`,
        score:
          record.wins + record.losses < 1 || !coach
            ? Number.NEGATIVE_INFINITY
            : surprise + record.wins * 0.08 + clamp(record.margin, -6, 8) * 0.15,
      };
    })
  );

  const floor =
    played >= 75 ? Math.round(played * (65 / 82)) : Math.max(8, Math.round(played * 0.45));
  const ballot = (rows: BallotRow[]) => rows.filter((row) => row.gp >= floor);
  const offense = ballot(
    pool.map(({ player, line }) => {
      const record = recordOf(league, player.teamId);
      const impact = Number.isFinite(player.ratings.impact)
        ? clamp(player.ratings.impact / 8, 0, 0.18)
        : 0;
      return {
        id: player.id,
        name: player.name,
        teamId: player.teamId!,
        position: player.position,
        gp: line.gp,
        detail: countingDetail(line),
        score:
          boxScoreValue(line) *
          gamesWeight(line.gp, played) *
          (0.48 + 0.52 * winWeight(record.wins)) *
          (0.94 + impact),
      };
    })
  );
  const defense = ballot(
    pool.map(({ player, line }) => {
      const record = recordOf(league, player.teamId);
      return {
        id: player.id,
        name: player.name,
        teamId: player.teamId!,
        position: player.position,
        gp: line.gp,
        detail: defenseDetail(line),
        score:
          ((line.min > 0 ? ((line.stl + line.blk) / line.min) * 36 : 0) * 7 +
            (Number.isFinite(player.ratings.defense) ? player.ratings.defense : 0) * 2.2) *
          gamesWeight(line.gp, played) *
          teamDefenseMul(league, player.teamId) *
          (0.85 + 0.15 * winWeight(record.wins)),
      };
    })
  );
  const rookies = offense.filter(({ id }) => {
    const player = pool.find((row) => row.player.id === id)?.player;
    return player ? isRookie(player, league.season) : false;
  });

  return [
    { id: "mvp", title: TITLES.mvp, candidates: mvp.candidates, note: mvp.note },
    { id: "dpoy", title: TITLES.dpoy, candidates: dpoy.candidates, note: dpoy.note },
    { id: "roy", title: TITLES.roy, candidates: roy.candidates, note: roy.note },
    { id: "smoy", title: TITLES.smoy, candidates: smoy.candidates, note: smoy.note },
    { id: "mip", title: TITLES.mip, candidates: mip.candidates, note: mip.note },
    { id: "coty", title: TITLES.coty, candidates: coty.candidates, note: coty.note },
    ...namedTeams("all-nba", offense),
    ...namedTeams("all-def", defense).slice(0, 2),
    ...namedTeams("all-rook", rookies).slice(0, 2),
  ];
}

type BallotRow = {
  id: string;
  name: string;
  teamId: string;
  position: string;
  gp: number;
  detail: string;
  score: number;
};

function spotOf(position: string): "G" | "F" | "C" {
  if (position === "PG" || position === "SG") return "G";
  if (position === "C") return "C";
  return "F";
}

/** Two guards, two forwards, one center. A thin pool fills the last spots with the next best player. */
function pickFive(rows: BallotRow[], used: Set<string>): BallotRow[] {
  const open = rows
    .filter((row) => !used.has(row.id))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const team: BallotRow[] = [];
  for (const spot of ["G", "F", "C"] as const) {
    const want = spot === "C" ? 1 : 2;
    for (const row of open) {
      if (team.length >= 5) break;
      if (team.includes(row) || spotOf(row.position) !== spot) continue;
      team.push(row);
      if (team.filter((entry) => spotOf(entry.position) === spot).length >= want) break;
    }
  }
  for (const row of open) {
    if (team.length >= 5) break;
    if (!team.includes(row)) team.push(row);
  }
  return team.slice(0, 5);
}

function namedTeams(prefix: "all-nba" | "all-def" | "all-rook", rows: BallotRow[]): GmAwardRace[] {
  const labels = ["First", "Second", "Third"] as const;
  const used = new Set<string>();
  const races: GmAwardRace[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const team = pickFive(rows, used);
    if (team.length < 5) break;
    for (const row of team) used.add(row.id);
    const id = `${prefix}-${index + 1}` as GmAwardRace["id"];
    const leader = team[0]?.score ?? 0;
    races.push({
      id,
      title: TITLES[id],
      candidates: team.map((row) => ({
        id: row.id,
        name: row.name,
        teamId: row.teamId,
        detail: `${spotOf(row.position) === "G" ? "Guard" : spotOf(row.position) === "C" ? "Center" : "Forward"}. ${row.detail}`,
        score: Math.round(row.score * 100) / 100,
        share: leader > 0 ? clamp(row.score / leader, 0, 1) : 0,
      })),
    });
  }
  return races;
}

export function awardNews(league: GmLeagueState, races: GmAwardRace[]): GmNewsItem | null {
  const lines = races
    .filter((race) => !race.id.startsWith("all-") || race.id.endsWith("-1"))
    .map((race) => {
      if (race.id.startsWith("all-")) {
        const names = race.candidates.map((candidate) => candidate.name).join(", ");
        return names ? `${race.title}: ${names}.` : null;
      }
      const winner = race.candidates[0];
      if (!winner) return null;
      return `${race.title}: ${winner.name}, ${teamName(league, winner.teamId)}. ${winner.detail}.`;
    })
    .filter((line): line is string => Boolean(line));
  if (!lines.length) return null;
  return {
    id: uid("news"),
    day: league.day,
    season: league.season,
    headline: "Regular-season awards",
    body: lines.join(" "),
    tone: "good",
  };
}

/** Freeze the ballot once. Later playoff games do not rewrite it. */
export function stampSeasonAwards(league: GmLeagueState): GmLeagueState {
  if (league.awards?.season === league.season) return league;
  const races = awardRaces(league);
  if (!races.some((race) => race.candidates.length > 0)) return league;
  const note = awardNews(league, races);
  return {
    ...league,
    awards: { season: league.season, races },
    news: note ? [note, ...league.news].slice(0, 50) : league.news,
  };
}
