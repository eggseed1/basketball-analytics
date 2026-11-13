import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { assignGLeague, gLeagueEligibility, tickGLeagueDay, gLeagueGames } from "../src/gm/engine/g-league";
import { playerMentality } from "../src/gm/engine/mentality";
import { advanceDynamicProgression, reviewMentality } from "../src/gm/engine/dynamic-progression";
import { rotationForTeam } from "../src/gm/engine/coaching";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";

const full = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 133 }));
const roster = full.players.filter(p => p.teamId === full.userTeamId && p.contract);
const prospect = roster.find(p => p.age <= 26 && !Object.values(full.teams.find(t => t.id === full.userTeamId)!.starters).includes(p.id))!;
assert.ok(prospect, "fixture needs a young nonstarter");
const team = full.teams.find(t => t.id === full.userTeamId)!;
const minutes = Object.fromEntries(roster.map(p => [p.id, p.id === prospect.id ? 0 : Math.max(2, team.coaching?.minutes?.[p.id] ?? 20)]));
const league: GmLeagueState = { ...full, phase: "regular", day: 0, teams: full.teams.map(t =>
  t.id === team.id ? { ...t, coaching: { ...t.coaching, rotationMode: "manual" as const, shifts: undefined,
    minutes, rotationDepth: 9 } } : t) };
const eligible = gLeagueEligibility(league, prospect);
assert.equal(eligible.ok, true, eligible.reason);
const placed = assignGLeague(league, prospect.id);
assert.equal(placed.ok, true, placed.reason);
const assigned = placed.state.players.find(p => p.id === prospect.id)!;
assert.equal(assigned.gLeague?.assigned, true);
assert.equal(rotationForTeam(placed.state.teams.find(t => t.id === team.id)!, placed.state.players).minutes[prospect.id] ?? 0, 0);
assert.equal(assignGLeague(placed.state, prospect.id).state, placed.state, "reassigning a player does nothing");
const another = roster.find(p => p.id !== prospect.id && p.age <= 26);
if (another) {
  const denied = assignGLeague(placed.state, another.id);
  assert.equal(denied.ok, false, "a rotation player cannot occupy the development slot");
  assert.equal(denied.state, placed.state, "a denied switch must not recall anyone");
}
let stepped = placed.state;
for (let day = 0; day < 180; day++) stepped = tickGLeagueDay(stepped, day);
const repPlayer = stepped.players.find(p => p.id === prospect.id)!;
assert.equal(gLeagueGames(repPlayer, stepped.season), 60);
assert.equal(repPlayer.gLeague?.minutes, 1920);
assert.equal(tickGLeagueDay(stepped, 177), stepped, "repeated day ticks never generate duplicate games");
assert.equal(repPlayer.seasonLine?.gp ?? 0, prospect.seasonLine?.gp ?? 0, "G League minutes are not NBA games");
const restored = parseFranchise(exportFranchise(stepped));
assert.equal(restored.players.find(p => p.id === prospect.id)?.gLeague?.games, 60, "save roundtrip keeps the assignment");
const replaced = assignGLeague(stepped, null);
assert.equal(replaced.ok, true);
assert.equal(replaced.state.players.find(p => p.id === prospect.id)?.gLeague?.assigned, false);
const beforeMentality = playerMentality(repPlayer);
const withReps = reviewMentality({ ...stepped, phase: "offseason" }, repPlayer);
const withoutReps = reviewMentality({ ...stepped, phase: "offseason" },
  { ...repPlayer, gLeague: undefined });
assert.equal(withReps.mentalityGrowth?.reviewedSeason, stepped.season);
assert.equal(withReps.mentalityGrowth?.idleSeasons, 0, "developmental reps preserve mentality");
assert.equal(withoutReps.mentalityGrowth?.idleSeasons, 1, "idle young players accumulate missed time");
assert.ok(playerMentality(withReps).rank >= beforeMentality.rank, "a season with G League reps does not reduce mentality");
assert.deepEqual(reviewMentality({ ...stepped, phase: "offseason" }, withReps), withReps, "annual review cannot reroll");
const growthPlayer: GmPlayer = { ...repPlayer, age: 21, sheet: repPlayer.sheet };
const base: GmLeagueState = { ...stepped, players: [growthPlayer], draftPool: [], phase: "regular" };
const gGrowth = advanceDynamicProgression(growthPlayer, { league: base, checkpoint: "summer" });
const idleGrowth = advanceDynamicProgression({ ...growthPlayer, gLeague: undefined }, { league: base, checkpoint: "summer" });
assert.ok((gGrowth.sheet?.overall ?? 0) >= (idleGrowth.sheet?.overall ?? 0), "G League reps cannot impede skill development");
console.log("GM G League: eligibility, one-slot assignment, NBA exclusion, ledger, save, and mentality checks passed");
