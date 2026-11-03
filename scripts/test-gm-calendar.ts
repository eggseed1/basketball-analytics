import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { simulateGame } from "../src/gm/engine/simulate";
import { stepDay } from "../src/gm/engine/pace";
import { adoptRealSchedule, remapScheduleDay, regularSeasonComplete } from "../src/gm/engine/schedule";

// Special events add dates during the season. The visible clock must never rewind,
// no game may be stranded, and serialized saves must resume at the same date.
for (const season of [2027, 2028]) {
  let league = createGeneratedLeague({ userTeamId: "bos", season, seed: 23 });
  let date = "";
  for (let turn = 0; turn < 260; turn++) {
    const cursor = league.schedule.filter(g => g.day >= league.day && g.gameDate).sort((a,b) => a.day-b.day)[0]?.gameDate;
    if (cursor) assert.equal(league.schedule.some(g => !g.played && g.gameDate && g.gameDate < cursor), false, "new event dates must be visited before later regular games");
    if (cursor) { assert.ok(cursor >= date, `${season}: ${date} rewound to ${cursor}`); date = cursor; }
    const stepped = stepDay(league);
    league = stepped.league;
    if (turn % 25 === 0) league = JSON.parse(JSON.stringify(league));
    if (stepped.seasonOver) break;
  }
  assert.equal(regularSeasonComplete(league.schedule), true, `${season}: all games finish`);
  assert.equal(league.schedule.filter(g => !g.played).length, 0, "special events also finish");
  assert.equal(league.standings.bos!.wins + league.standings.bos!.losses, 82);
  assert.equal(adoptRealSchedule(league), league, "reloading a started save preserves results");
  console.log(`Calendar ${season}: full regular season, Cup and All-Star completed without date reversal.`);
}
const seed = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 8 });
const eligible = seed.players.filter(p => p.teamId).slice(0, 10).map(p => ({ ...p, injury: null }));
const exhibition = { ...seed.schedule[0]!, id: "allstar-regression", exhibition: "allstar" as const,
  homeTeamId: "as-stars", awayTeamId: "as-world", span: 0.05,
  squad: [eligible.slice(0, 5).map(p => p.id), eligible.slice(5).map(p => p.id)] as [string[], string[]] };
assert.equal(simulateGame(exhibition, seed.teams, eligible).game.played, true, "exhibition squads are constructed before team validation");
const legacy = { ...seed, day: 20, schedule: seed.schedule.map(g => ({ ...g, id: "old_" + g.id })) };
assert.equal(adoptRealSchedule(legacy), legacy, "legacy progress is never wiped on reload");
const before = { ...seed, day: 1, schedule: [{ ...seed.schedule[0]!, day: 0, gameDate: "2026-10-20" }, { ...seed.schedule[1]!, day: 1, gameDate: "2026-10-23" }] };
const expanded = [before.schedule[0]!, { ...before.schedule[0]!, day: 1, gameDate: "2026-10-21" }, { ...before.schedule[1]!, day: 2 }];
assert.equal(remapScheduleDay(before, expanded), 2, "inserting a date preserves the current date");

// Exercise the actual next-game store action with a deterministic daily clock.
// Only the daily engine is replaced here, so crossing a decision is observable.
const store = readFileSync("src/gm/state/gm-store.ts", "utf8");
const action = store.slice(store.indexOf("      simulateNextGame: () => {"), store.indexOf("\n      simulateDay:", store.indexOf("      simulateNextGame: () => {")));
const js = stripTypeScriptTypes(`const actions = {${action}}; actions;`, { mode: "transform" });
let day = 0;
let paused = false;
let running = true;
let target = { id: "target", day: 3, played: false, homeTeamId: "bos", awayTeamId: "nyk", boxScoreId: "box" };
const state = { league: { phase: "regular", userTeamId: "bos", day, schedule: [target] }, stopAutoSim: () => { running = false; }, simulateDay: () => { day++; paused = day === 2; target = { ...target, played: day >= 3 }; state.league = { ...state.league, day, schedule: [target] }; } };
const actions = vm.runInNewContext(js, { get: () => state, set: () => {}, myLeagueAllowsSim: () => true, isCalendarPaused: () => paused });
assert.equal(actions.simulateNextGame(), null);
assert.equal(day, 2, "next-game action stops at an intervening decision");
assert.equal(running, false, "manual simulation cancels the other clock");
paused = false;
assert.equal(actions.simulateNextGame(), "box");
assert.equal(day, 3, "next-game action stops immediately after its target");
console.log("Next-game action respects daily gates and has a single simulation clock.");


// Future seasons must be genuine, NBA-shaped calendars rather than a shifted
// or shuffled copy of the opening slate. Validate the complete fixture matrix,
// game dates and rest constraints (including Cup group games).
const officialPairOrder = seed.schedule.map(g => g.homeTeamId + ":" + g.awayTeamId).join(",");
const calendarSignatures: string[] = [];
for (const [year, calendarSeed] of [[2028, 23], [2029, 47]] as const) {
  const future = createGeneratedLeague({ userTeamId: "bos", season: year, seed: calendarSeed });
  const games = future.schedule;
  assert.equal(games.length, 1200, year + ": 80 published games for each of 30 clubs");
  assert.equal(new Set(games.map(g => g.id)).size, 1200, year + ": game IDs unique");
  assert.equal(games.filter(g => g.cup === "group").length, 60, year + ": 60 Cup group games");
  const seenDates = new Set<string>();
  const teamDates = new Map<string, number[]>();
  const homes = new Map<string, number>();
  const opponents = new Map<string, Map<string, number>>();
  for (const team of future.teams) { teamDates.set(team.id, []); homes.set(team.id, 0); opponents.set(team.id, new Map()); }
  for (const game of games) {
    assert.equal(game.season, year);
    assert.ok(game.gameDate, year + ": every game has a date");
    assert.notEqual(game.homeTeamId, game.awayTeamId);
    assert.ok(teamDates.has(game.homeTeamId) && teamDates.has(game.awayTeamId));
    const date = game.gameDate!;
    assert.ok(date >= (year - 1) + "-10-19" && date <= year + "-04-13", year + ": game falls inside season window");
    assert.ok(!(date.slice(5, 7) === "02" && Number(date.slice(8, 10)) >= 13 && Number(date.slice(8, 10)) <= 21),
      year + ": February All-Star break protected");
    const day = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
    for (const [team, opponent] of [[game.homeTeamId, game.awayTeamId], [game.awayTeamId, game.homeTeamId]]) {
      assert.ok(!seenDates.has(team + "|" + date), year + ": team cannot play twice in one day");
      seenDates.add(team + "|" + date);
      teamDates.get(team)!.push(day);
      const counts = opponents.get(team)!;
      counts.set(opponent, (counts.get(opponent) ?? 0) + 1);
    }
    homes.set(game.homeTeamId, homes.get(game.homeTeamId)! + 1);
  }
  for (const team of future.teams) {
    const dates = teamDates.get(team.id)!.sort((a,b) => a-b);
    assert.equal(dates.length, 80, year + ": " + team.id + " plays 80 published games");
    assert.equal(homes.get(team.id), 40, year + ": " + team.id + " has 40 home games");
    assert.equal(opponents.get(team.id)!.size, 29, year + ": visits all opponents");
    let backToBacks = 0;
    for (let i = 1; i < dates.length; i++) if (dates[i]! - dates[i-1]! === 1) backToBacks++;
    assert.ok(backToBacks <= 18, year + ": " + team.id + " has too many back-to-backs");
    for (let i = 0; i + 2 < dates.length; i++)
      assert.ok(dates[i+2]! - dates[i]! >= 3, year + ": no three consecutive nights for " + team.id);
    for (let i = 0; i + 3 < dates.length; i++)
      assert.ok(dates[i+3]! - dates[i]! >= 5, year + ": no four games in five nights for " + team.id);
    for (const opponent of future.teams.filter(t => t.id !== team.id)) {
      const count = opponents.get(team.id)!.get(opponent.id);
      const expected = team.conference !== opponent.conference ? 2
        : team.division === opponent.division ? 4 : undefined;
      if (expected) assert.equal(count, expected, year + ": " + team.id + " vs " + opponent.id);
      else assert.ok(count === 3 || count === 4, year + ": intraconference matchup count");
    }
    const conferenceGames = [...opponents.get(team.id)!].reduce((sum,[opponent,count]) =>
      sum + (future.teams.find(t => t.id === opponent)!.conference === team.conference ? count : 0),0);
    assert.equal(conferenceGames, 50, year + ": conference fixture split");
  }
  const pairOrder = games.map(g => g.homeTeamId + ":" + g.awayTeamId).join(",");
  assert.notEqual(pairOrder, officialPairOrder, year + ": cannot copy first-season opponents");
  calendarSignatures.push(pairOrder);
}
assert.notEqual(calendarSignatures[0], calendarSignatures[1],
  "independent future seasons should not repeat the same opponent order");
console.log("Future calendars: all fixture, rest, Cup and season-variation checks passed.");
