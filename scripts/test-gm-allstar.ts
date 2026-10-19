import assert from "node:assert/strict";
import test from "node:test";

import {
  allStarBreak,
  allStarForm,
  ensureAllStar,
  isUsaBorn,
  pickAllStars,
} from "../src/gm/engine/allstar";
import { ensureNbaCup, gameCounts } from "../src/gm/engine/cup";
import { officialSchedule } from "../src/gm/engine/schedule";
import { seasonMarks } from "../src/gm/engine/calendar-marks";
import { stepDay } from "../src/gm/engine/pace";
import { bundledRosterSeasonRows } from "../src/data/providers/nba/espn-roster-client";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import type { GmLeagueState, GmPlayer, GmScheduleGame, GmTeam } from "../src/gm/types";

test("birthplace splits the U.S. from the World team", () => {
  assert.equal(isUsaBorn("Saint Louis, MO, USA"), true);
  assert.equal(isUsaBorn("Athens, Greece"), false);
  assert.equal(isUsaBorn("Toronto, ON, Canada"), false);
  assert.equal(isUsaBorn(undefined), false);
});

function player(id: string, name: string, teamId: string, pts: number, nbaPlayerId?: string): GmPlayer {
  return {
    id,
    name,
    teamId,
    position: "SF",
    age: 26,
    heightIn: 78,
    weightLbs: 220,
    ratings: {
      impact: pts / 10,
      offense: 2,
      defense: 1,
      shooting: 70,
      finishing: 70,
      playmaking: 70,
      rebounding: 50,
      durability: 80,
      potential: 3,
    },
    scouted: { impact: 1, offense: 1, defense: 1, uncertainty: 0 },
    contract: null,
    injury: null,
    morale: 70,
    personality: 0,
    minutesPreference: 32,
    nbaPlayerId,
    seasonLine: {
      season: "2026-27",
      team: teamId,
      gp: 50,
      min: 50 * 34,
      pts: pts * 50,
      reb: 5 * 50,
      ast: 5 * 50,
      stl: 0,
      blk: 0,
      tov: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
    },
  } as GmPlayer;
}

test("the break is still All-Star week, and Sunday is the game", () => {
  const schedule = officialSchedule(2027);
  const brk = allStarBreak(schedule);
  assert.ok(brk);
  assert.equal(brk.start, "2027-02-19");
  assert.equal(brk.sunday, "2027-02-21");
  const marks = seasonMarks(schedule);
  assert.equal(marks.find((mark) => mark.iso === "2027-02-19" && mark.label)?.label, "All-Star");
  assert.equal(marks.filter((mark) => mark.kind === "break").length, 6);
});

test("rosters follow this season, then the round robin is added on Sunday", () => {
  const east = ["bos", "nyk", "mil", "phi", "mia", "chi", "cle", "orl", "atl", "bkn", "ind", "tor"];
  const west = ["lal", "den", "gsw", "phx", "dal", "sac", "por", "mem", "uta", "nop", "min", "okc"];
  const usa = [
    ...east.map((team, index) => player(`usa-e-${index}`, `East ${index}`, team, 30 - index)),
    ...west.map((team, index) => player(`usa-w-${index}`, `West ${index}`, team, 28 - index)),
  ];
  const world = [
    player("w1", "Giannis Antetokounmpo", "mil", 40, "203507"),
    player("w2", "Nikola Jokic", "den", 39, "203999"),
    player("w3", "Luka Doncic", "lal", 38, "1629029"),
    player("w4", "Joel Embiid", "phi", 37, "203954"),
    player("w5", "Shai Gilgeous-Alexander", "okc", 36, "1628983"),
    player("w6", "Victor Wembanyama", "sas", 35, "1641705"),
    player("w7", "World Seven", "tor", 34, "203507"),
    player("w8", "World Eight", "hou", 33, "203999"),
  ];
  // World players share teams with the USA fillers. Drop the filler on that team.
  const taken = new Set(world.map((entry) => entry.teamId));
  const players = [...usa.filter((entry) => !taken.has(entry.teamId)), ...world];
  const teams = [...new Set(players.map((entry) => entry.teamId))].map(
    (id) =>
      ({
        id,
        conference: east.includes(id!) || id === "tor" || id === "phi" ? "East" : "West",
      }) as GmTeam
  );
  const schedule = officialSchedule(2027).map((game) =>
    (game.gameDate ?? "") < "2027-02-19" ? { ...game, played: true, homeScore: 100, awayScore: 90 } : game
  );
  const league = {
    season: 2027,
    day: 80,
    phase: "regular",
    userTeamId: "bos",
    teams,
    players,
    schedule,
    news: [],
    draftPool: [],
  } as unknown as GmLeagueState;

  assert.ok(allStarForm(world[0]!) > allStarForm(usa[0]!));
  const picked = pickAllStars(league);
  assert.equal(picked.world.length >= 8, true);
  assert.equal(picked.stars.length, picked.stripes.length);
  for (const id of picked.world) {
    const entry = players.find((player) => player.id === id);
    assert.equal(entry?.nbaPlayerId != null, true);
  }

  const named = ensureAllStar(league);
  const opener = named.schedule.find((game) => game.id === "as_2027_g1");
  assert.ok(opener);
  assert.equal(opener.gameDate, "2027-02-21");
  assert.equal(opener.exhibition, "allstar");
  assert.equal(gameCounts(opener), false);
  assert.equal(opener.span, 0.25);
  assert.deepEqual(opener.squad?.[0], picked.stars);
  assert.deepEqual(opener.squad?.[1], picked.world);

  const played: GmScheduleGame[] = named.schedule.map((game) =>
    game.id === "as_2027_g1" ? { ...game, played: true, homeScore: 30, awayScore: 22 } : game
  );
  const next = ensureAllStar({ ...named, schedule: played });
  assert.equal(next.schedule.some((game) => game.id === "as_2027_g2"), true);
  assert.equal(next.schedule.some((game) => game.id === "as_2027_g3"), true);
  const marks = seasonMarks(next.schedule);
  assert.equal(marks.find((mark) => mark.iso === "2027-02-19" && mark.label)?.label, "All-Star");
});

test("All-Star Sunday plays four short games and the standings stay put", () => {
  const rows = bundledRosterSeasonRows("2026-27");
  let league = buildLeagueFromPlayerSeasons(rows, {
    userTeamId: "bos",
    seasonCanonical: "2026-27",
    seed: 4,
    keepAssignedRoster: true,
  });
  const playThroughBreak = (state: typeof league) => ({
    ...state,
    schedule: state.schedule.map((game) =>
      game.gameDate && game.gameDate < "2027-02-19"
        ? { ...game, played: true, homeScore: game.homeScore ?? 110, awayScore: game.awayScore ?? 100 }
        : game
    ),
  });
  league = playThroughBreak(league);
  for (let pass = 0; pass < 6; pass += 1) {
    league = playThroughBreak(ensureNbaCup(league));
  }
  league = ensureAllStar(league);
  const opener = league.schedule.find((game) => game.id === "as_2027_g1");
  assert.ok(opener);
  assert.ok(league.allStar);
  assert.equal(league.allStar.stars.length > 0, true);
  assert.equal(league.allStar.world.length > 0, true);
  const before = Object.values(league.standings)
    .map((row) => row.wins)
    .join(",");
  const sample = league.players.find((player) => player.teamId === "bos");
  const gp = sample?.seasonLine?.gp ?? 0;
  const stepped = stepDay({ ...league, day: opener.day });
  const stars = stepped.league.schedule.filter((game) => game.exhibition === "allstar");
  assert.equal(stars.length, 5);
  const sundayGames = stars.filter((game) => game.gameDate === opener.gameDate);
  assert.equal(sundayGames.length, 4);
  assert.equal(
    sundayGames.every((game) => game.played),
    true
  );
  const rising = stars.find((game) => game.id.endsWith("_rising"));
  assert.ok(rising);
  assert.equal(rising.played, false);
  assert.equal(rising.gameDate < opener.gameDate!, true);
  for (const game of sundayGames) {
    assert.ok((game.homeScore ?? 0) >= 8 && (game.homeScore ?? 99) <= 70, `${game.id} ${game.homeScore}`);
    assert.ok((game.awayScore ?? 0) >= 8 && (game.awayScore ?? 99) <= 70, `${game.id} ${game.awayScore}`);
  }
  assert.equal(
    Object.values(stepped.league.standings)
      .map((row) => row.wins)
      .join(","),
    before
  );
  const after = stepped.league.players.find((player) => player.id === sample?.id);
  assert.equal(after?.seasonLine?.gp ?? 0, gp);
  const box = stepped.league.boxScores.find((entry) => entry.gameId === "as_2027_final");
  assert.ok(box);
  assert.ok(box.players.length >= 8);
  assert.equal(
    box.players.every((line) => line.minutes <= 14),
    true
  );
});
