import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { simulateGame } from "../src/gm/engine/simulate";
import { recordBadgeBox } from "../src/gm/engine/badges";
import { shiftSnapshot, rebalanceForInjuryChanges } from "../src/gm/engine/coaching";
import { rollGameInjuries, tickInjuries } from "../src/gm/engine/progression";
import { buildChampionResult } from "../src/gm/engine/finals-mvp";
import { buildPlayoffBracket, computeLotteryOrder, betterRecord, seriesHosts } from "../src/gm/engine/standings";
import { applyPlayInResult, createPlayInBoard, playInDone, playInOpenGames, playoffSeeds, playoffTeamIdSet, teamName } from "../src/gm/engine/play-in";
import { seriesGameBoxes, postseasonBox } from "../src/gm/engine/postseason";
import type { GmLeagueState } from "../src/gm/types";

const source = readFileSync("src/gm/state/gm-store.ts", "utf8");
const actionSource = source.slice(source.indexOf("      simPlayInNight: (match) => {"), source.indexOf("\n      ackAwardsShow:")) + source.slice(source.indexOf("      simPlayoffDay: (seriesId) => {"), source.indexOf("\n      finishPlayoffRound:"));
const gate = source.slice(source.indexOf("function myLeagueAllowsSim("), source.indexOf("\nfunction calendarPauseReason("));
const code = stripTypeScriptTypes(`${gate}\nconst actions={${actionSource}};({actions,myLeagueAllowsSim});`, { mode: "transform" });
const initial = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2028, seed: 41 }));
initial.phase = "play_in";
initial.playIn = createPlayInBoard(initial)!;
initial.settings.injuryFrequency = 0;
let serial = 0;
const state: { league: GmLeagueState; [key: string]: unknown } = { league: initial };
const { actions, myLeagueAllowsSim } = vm.runInNewContext(code, {
  get: () => state, set: (partial: { league: GmLeagueState }) => Object.assign(state, partial),
  syncMyLeague: () => {}, withUpdate: (league: GmLeagueState) => league,
  uid: (prefix: string) => `${prefix}-postseason-${serial++}`,
  simulateGame, recordBadgeBox, shiftSnapshot, rebalanceForInjuryChanges,
  rollGameInjuries, tickInjuries, buildChampionResult, buildPlayoffBracket,
  computeLotteryOrder, betterRecord, seriesHosts, applyPlayInResult,
  createPlayInBoard, playInDone, playInOpenGames, playoffSeeds, playoffTeamIdSet, teamName,
  stampSeasonAwards: () => { throw new Error("Play-in must not restamp regular-season awards"); },
});
Object.assign(state, actions);
assert.equal(myLeagueAllowsSim(state.league), false, "the actual calendar guard rejects play-in; never mock it true");
const standings = JSON.stringify(initial.standings);
const first = playInOpenGames(initial.playIn!)[0]!;
const watched = actions.simPlayInNight({ homeId: first.homeId, awayId: first.awayId });
assert.ok(watched);
assert.equal(state.league.boxScores.length, 1, "watching one matchup plays exactly one official game");
assert.equal(state.league.boxScores[0]!.id, watched);
assert.ok(state.league.boxScores[0]!.events!.length);
assert.equal(state.league.playIn!.conferences.flatMap(c => c.results ?? []).length, 1);
const saved = parseFranchise(exportFranchise(state.league));
state.league = saved;
actions.simPlayInNight();
assert.equal(state.league.boxScores.length, 4, "Sim tonight completes the remaining first-night games after reload");
actions.simPlayInNight();
assert.equal(state.league.boxScores.length, 6);
assert.equal(state.league.phase, "playoffs");
assert.equal(playInDone(state.league.playIn!), true, "completed play-in remains viewable");
assert.equal(state.league.playoffBracket!.length, 8);
assert.equal(JSON.stringify(state.league.standings), standings, "postseason never adds regular-season wins");
for (const conf of state.league.playIn!.conferences) for (const game of conf.results ?? []) {
  assert.ok(postseasonBox(state.league, { ...game, homeTeamId: game.homeId, awayTeamId: game.awayId }, "play_in"));
}
const playoffStart = structuredClone(state.league);
assert.equal(actions.simPlayoffDay("missing-series"), null);
assert.equal(state.league.boxScores.length, 6);
const series = state.league.playoffBracket![0]!;
const playoffWatch = actions.simPlayoffDay(series.id);
assert.ok(playoffWatch);
assert.equal(state.league.boxScores.length, 7);
assert.equal(state.league.playoffBracket!.find(s => s.id === series.id)!.games!.length, 1);
let guard = 0;
while (!state.league.champion && guard++ < 100) actions.simPlayoffDay();
assert.ok(state.league.champion, "the actual store actions reach a champion");
assert.equal(state.league.playoffBracket!.length, 15);
for (const series of state.league.playoffBracket!) {
  assert.ok(series.done);
  const boxes = seriesGameBoxes(state.league, series);
  assert.equal(boxes.filter(Boolean).length, series.games!.length);
  for (const box of boxes) assert.ok(box!.events!.length, "all postseason matchups retain their official replay feed");
  const legacy = { ...series, games: series.games!.map(({ gameId: _game, boxScoreId: _box, ...rest }) => rest) };
  assert.equal(seriesGameBoxes(state.league, legacy).filter(Boolean).length, series.games!.length, "old saves resolve retained boxes without new ids");
  if (series.round > 1) {
    for (const [id, seed] of [[series.teamAId, series.seedA], [series.teamBId, series.seedB]] as const) {
      const firstRound = state.league.playoffBracket!.find(s => s.round === 1 && [s.teamAId, s.teamBId].includes(id))!;
      assert.equal(seed, firstRound.teamAId === id ? firstRound.seedA : firstRound.seedB);
    }
  }
}
assert.equal(JSON.stringify(state.league.standings), standings);
const finalCount = state.league.boxScores.length;
assert.equal(actions.simPlayoffDay(), null);
assert.equal(state.league.boxScores.length, finalCount, "repeated clicks cannot replay a completed Finals");
state.league = { ...playoffStart, phase: "play_in" };
actions.simPlayInNight();
assert.equal(state.league.phase, "playoffs", "a completed board stranded on play-in recovers");
state.league = { ...initial, playIn: undefined };
actions.simPlayInNight();
assert.equal(state.league.boxScores.length, 4, "legacy missing board is rebuilt");
console.log("Postseason passed: real phase guard, individual watch, six play-in games, reloads, official feeds, game links, legacy records, original seeds and all four playoff rounds.");
