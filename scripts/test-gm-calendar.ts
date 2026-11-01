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
