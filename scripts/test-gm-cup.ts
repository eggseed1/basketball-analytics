import assert from "node:assert/strict";
import test from "node:test";

import { drawCupGroups, ensureNbaCup, gameCounts, retieCupGroupGames, tagGroupGames } from "../src/gm/engine/cup";
import { generateSchedule, officialSchedule } from "../src/gm/engine/schedule";
import { FRANCHISES } from "../src/gm/seed/franchises";
import type { GmLeagueState, GmScheduleGame, GmTeam } from "../src/gm/types";

const teams = FRANCHISES.map((team) => team as unknown as GmTeam);

function leagueFrom(schedule: GmScheduleGame[], day = 0): GmLeagueState {
  return {
    season: 2027,
    day,
    schedule,
    teams,
    news: [],
    players: [],
    standings: {},
    phase: "regular",
    userTeamId: "bos",
  } as unknown as GmLeagueState;
}

function scoreGroup(schedule: GmScheduleGame[]): GmScheduleGame[] {
  const tagged = tagGroupGames(schedule, 2027);
  return tagged.map((game) => {
    if (game.cup !== "group") return game;
    const homeRank = game.homeTeamId.charCodeAt(0) + game.homeTeamId.charCodeAt(1);
    const awayRank = game.awayTeamId.charCodeAt(0) + game.awayTeamId.charCodeAt(1);
    const homeWins = homeRank >= awayRank;
    return {
      ...game,
      played: true,
      homeScore: homeWins ? 110 : 100,
      awayScore: homeWins ? 100 : 108,
    };
  });
}

test("cup nights are the 60 group games, four per team", () => {
  const tagged = tagGroupGames(officialSchedule(2027), 2027);
  const group = tagged.filter((game) => game.cup === "group");
  assert.equal(group.length, 60);
  const counts = new Map<string, { games: number; home: number }>();
  for (const game of group) {
    for (const id of [game.homeTeamId, game.awayTeamId]) {
      const row = counts.get(id) ?? { games: 0, home: 0 };
      row.games += 1;
      if (id === game.homeTeamId) row.home += 1;
      counts.set(id, row);
    }
  }
  assert.equal(counts.size, 30);
  for (const row of counts.values()) {
    assert.equal(row.games, 4);
    assert.equal(row.home, 2);
  }
  const bos = group.filter((game) => game.homeTeamId === "bos" || game.awayTeamId === "bos");
  const foes = new Set(bos.map((game) => (game.homeTeamId === "bos" ? game.awayTeamId : game.homeTeamId)));
  assert.deepEqual([...foes].sort(), ["atl", "cha", "chi", "was"]);
});

test("the knockout and the two makeup games are scheduled from the group results", () => {
  const scored = scoreGroup(officialSchedule(2027));
  const dec12 = scored.find((game) => game.gameDate === "2026-12-12");
  assert.ok(dec12);
  let state = ensureNbaCup(leagueFrom(scored, dec12.day));
  assert.ok(state.day < dec12.day);
  assert.equal(state.schedule.filter((game) => game.cup === "quarterfinal").length, 4);
  const makeup = state.schedule.filter((game) => game.cup === "makeup");
  assert.equal(makeup.length, 22);
  const field = new Set(
    state.schedule.filter((game) => game.cup === "quarterfinal").flatMap((game) => [game.homeTeamId, game.awayTeamId])
  );
  assert.equal(field.size, 8);
  for (const game of makeup) {
    assert.equal(field.has(game.homeTeamId), false);
    assert.equal(field.has(game.awayTeamId), false);
  }
  const appearances = new Map<string, number>();
  for (const game of makeup) {
    for (const id of [game.homeTeamId, game.awayTeamId]) {
      appearances.set(id, (appearances.get(id) ?? 0) + 1);
    }
  }
  assert.equal(appearances.size, 22);
  for (const count of appearances.values()) assert.equal(count, 2);

  state = {
    ...state,
    schedule: state.schedule.map((game) =>
      game.cup === "quarterfinal"
        ? { ...game, played: true, homeScore: 120, awayScore: 99 }
        : game
    ),
  };
  state = ensureNbaCup(state);
  assert.equal(state.schedule.filter((game) => game.cup === "semifinal").length, 2);
  assert.equal(state.schedule.filter((game) => game.id.startsWith("cuploser_")).length, 2);

  state = {
    ...state,
    schedule: state.schedule.map((game) =>
      game.cup === "semifinal"
        ? { ...game, played: true, homeScore: 118, awayScore: 101 }
        : game
    ),
  };
  state = ensureNbaCup(state);
  const final = state.schedule.find((game) => game.cup === "championship");
  assert.ok(final);
  assert.equal(final.neutral, true);
  assert.equal(final.gameDate, "2026-12-11");
  assert.equal(gameCounts(final), false);

  for (const team of FRANCHISES) {
    const counting = state.schedule.filter(
      (game) =>
        gameCounts(game) && (game.homeTeamId === team.id || game.awayTeamId === team.id)
    );
    assert.equal(counting.length, 82, team.id);
  }
  const byTeamDate = new Map<string, Set<string>>();
  for (const game of state.schedule) {
    for (const id of [game.homeTeamId, game.awayTeamId]) {
      const key = `${id}|${game.gameDate}`;
      assert.equal(byTeamDate.get(id)?.has(game.gameDate ?? "") ?? false, false, key);
      const set = byTeamDate.get(id) ?? new Set<string>();
      set.add(game.gameDate ?? "");
      byTeamDate.set(id, set);
    }
  }
});

test("the next season redraws Cup groups from this save's wins", () => {
  const wins: Record<string, number> = {};
  teams.forEach((team, index) => {
    wins[team.id] = 20 + index;
  });
  const groups = drawCupGroups(teams, wins);
  for (const conference of ["East", "West"] as const) {
    assert.equal(groups[conference].length, 3);
    for (const room of groups[conference]) assert.equal(room.length, 5);
  }
  const tied = retieCupGroupGames(generateSchedule(teams, 2028), groups, 2028);
  const tagged = tagGroupGames(tied, 2028, groups);
  const group = tagged.filter((game) => game.cup === "group");
  assert.equal(group.length, 60);
  const mates = new Map<string, Set<string>>();
  for (const conference of ["East", "West"] as const) {
    for (const room of groups[conference]) {
      for (const id of room) mates.set(id, new Set(room.filter((other) => other !== id)));
    }
  }
  const counts = new Map<string, number>();
  for (const game of group) {
    assert.equal(mates.get(game.homeTeamId)?.has(game.awayTeamId), true);
    for (const id of [game.homeTeamId, game.awayTeamId]) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  for (const count of counts.values()) assert.equal(count, 4);
});
