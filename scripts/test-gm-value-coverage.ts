/** Generated players deserve the same simulated-value leaderboard coverage. */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise } from "../src/gm/engine/franchise";
import { valueForBoard, war1FromRate } from "../src/gm/lib/season-line";

const league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2033, seed: 917 }));
const prospect = league.players.find(p => p.teamId && p.sheet && !p.nbaPlayerId)!;
assert.ok(prospect, "generated league must contain an active generated player");
const generated = { ...prospect, draftModel: 2 as const, ratings: { ...prospect.ratings, impact: 3.5 } };
const first = valueForBoard(league, generated);
assert.equal(first.drbl100, 3.5, "a generated player must not be missing DRBL/100");
assert.equal(first.estimated, true, "the UI must distinguish simulated estimates from real published values");
assert.equal(first.war1, null, "never award a season's WAR1 before a game is played");
const withStats = { ...generated, seasonLine: {
  season: "2033", team: "bos", gp: 55, gs: 42, min: 1830,
  pts: 1240, reb: 310, ast: 220, stl: 55, blk: 24, tov: 90,
  fgm: 470, fga: 950, tpm: 150, tpa: 400, ftm: 150, fta: 185,
}, seasonPossessions: 3870 };
const season = { ...league, players: league.players.map(p => p.id === generated.id ? withStats : p) };
const value = valueForBoard(season, withStats);
assert.ok(value.drbl100 != null && value.war1 != null, "played generated players must appear in both metrics");
assert.equal(value.war1, war1FromRate(3.5, 3870));
const evolved = { ...withStats, ratings: { ...withStats.ratings, impact: 7.2 } };
assert.ok(valueForBoard(season, evolved).war1! > value.war1!, "future-season WAR1 reflects earned player improvement");
const real = { ...generated, nbaPlayerId: "seed-real", drbl100: 4.1, entryWar1: 3.0,
  simProfile: { ...generated.simProfile!, impact: 3.5, source: "nba" as const },
  ratings: { ...generated.ratings, impact: 5.2 },
};
const realValue = valueForBoard(season, real);
assert.ok(realValue.drbl100! > 4.1 && realValue.drbl100! < 6,
  "future seasons should update real players too, not freeze their NBA entry rating");
assert.equal(realValue.estimated, true);
assert.equal(realValue.war1, null, "players without simulated possessions cannot earn current WAR1");
console.log("Generated and real future-season DRBL coverage, earned WAR1, and source labels passed.");
