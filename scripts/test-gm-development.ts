import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { assignMentor, activeMentor, mentorshipBonus, raiseCeiling, reviewPlayerCeilings, breakoutEvidence, workEthicOf } from "../src/gm/engine/development";
import { recordSimGame } from "../src/gm/lib/season-line";
import { progressSheet, overallFromAttributes } from "../src/gm/engine/attributes";
import { applyTrainingCamp, assignCamp, campSlots } from "../src/gm/engine/season-development";
import { tickInjuries } from "../src/gm/engine/progression";
import type { GmBoxScore, GmLeagueState, GmPlayer } from "../src/gm/types";

let league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 32 }));
const roster = league.players.filter(p => p.teamId === "bos" && p.contract);
const young: GmPlayer = { ...roster[0]!, age: 21, position: "PG", sheet: { ...roster[0]!.sheet!, overall: 70, potential: { ...roster[0]!.sheet!.potential, ceiling: 80, path: "average", trait: "normal" } } };
young.sheet!.overallOffset = 70 - overallFromAttributes(young.position, young.sheet!.attributes, { impact: young.ratings.impact, drbl100: young.drbl100 });
const veteran: GmPlayer = { ...roster[1]!, age: 32, position: "PG", workEthic: 95, sheet: { ...roster[1]!.sheet!, overall: 90 } };
const other: GmPlayer = { ...roster[2]!, age: 20, position: "PG" };
league = { ...league, players: league.players.map(p => p.id === young.id ? young : p.id === veteran.id ? veteran : p.id === other.id ? other : p) };
assert.equal(assignMentor(league, young.id, young.id).ok, false);
assert.equal(assignMentor({ ...league, players: league.players.map(p => p.id === veteran.id ? { ...p, position: "C" } : p) }, young.id, veteran.id).ok, false);
const paired = assignMentor(league, young.id, veteran.id);
assert.equal(paired.ok, true);
league = paired.state;
const student = () => league.players.find(p => p.id === young.id)!;
assert.equal(assignMentor(league, other.id, veteran.id).ok, false, "one learner per mentor");
assert.equal(assignMentor(league, young.id, veteran.id).state, league, "reselecting does not reset exposure");
const bonus = mentorshipBonus(student(), league.players);
assert.ok(bonus > 0 && bonus <= 0.18);
const weak = league.players.map(p => p.id === veteran.id ? { ...p, workEthic: 40, sheet: { ...p.sheet!, overall: 65 } } : p);
assert.ok(mentorshipBonus(student(), weak) < bonus);
assert.equal(mentorshipBonus(student(), league.players.map(p => p.id === veteran.id ? { ...p, teamId: "nyk" } : p)), 0);
assert.equal(activeMentor(student(), league.players.map(p => p.id === young.id ? { ...p, position: "SG" } : p))?.id, veteran.id, "eligibility uses the supplied learner");
assert.equal(activeMentor({ ...student(), position: "SG" }, league.players), undefined);
assert.equal(workEthicOf(veteran), 95);
const unmentored = progressSheet(student(), { pace: "season", speed: 0.5, minutes: 24, mentorBonus: 0 });
const mentored = progressSheet(student(), { pace: "season", speed: 0.5, minutes: 24, mentorBonus: bonus });
assert.ok((mentored.sheet!.developmentCarry ?? 0) > (unmentored.sheet!.developmentCarry ?? 0), "mentor work increases fractional development before a rating step");
assert.ok(mentored.sheet!.overall >= unmentored.sheet!.overall);
const box: GmBoxScore = { id: "mentor-box", gameId: "mentor-game", season: league.season, day: 1, homeTeamId: "bos", awayTeamId: "nyk", homeScore: 100, awayScore: 90, possessions: 100, players: [{ playerId: young.id, playerName: young.name, teamId: "bos", minutes: 28, points: 20, assists: 5, rebounds: 5, steals: 1, blocks: 0, turnovers: 2, fgm: 8, fga: 15, tpm: 2, tpa: 5, ftm: 2, fta: 2, plusMinus: 5, trueShootingPct: 0.6, usagePct: 0.2, gameScore: 18 }] };
league = { ...league, players: recordSimGame(league.players, box, []) };
assert.equal(student().mentorship?.sharedGames, 1);
assert.equal(recordSimGame(league.players, box, [box]).find(p => p.id === young.id)?.mentorship?.sharedGames, 1);
assert.equal(student().developmentBaseline?.overall, 70);
const saved = parseFranchise(exportFranchise(league));
assert.deepEqual(saved.players.find(p => p.id === young.id)?.mentorship, student().mentorship);

const dominant = { ...student(), developmentBaseline: { season: 2027, overall: 70 }, seasonLine: { season: "2027", team: "BOS", gp: 70, min: 2100, pts: 1680, reb: 420, ast: 350, stl: 90, blk: 40, tov: 140, fgm: 650, fga: 1180, tpm: 180, tpa: 450, ftm: 200, fta: 300 } };
assert.equal(breakoutEvidence(dominant, 2027).eligible, true);
assert.equal(breakoutEvidence({ ...dominant, seasonLine: { ...dominant.seasonLine, gp: 8, min: 240 } }, 2027).eligible, false, "small samples cannot raise ceilings");
assert.equal(breakoutEvidence({ ...dominant, age: 29 }, 2027).eligible, false);
const full = { ...league, schedule: league.schedule.map(g => ({ ...g, played: true })), players: league.players.map(p => p.id === young.id ? dominant : p) };
const reviewed = reviewPlayerCeilings(full);
const breakout = reviewed.players.find(p => p.id === young.id)!;
assert.equal(breakout.ceilingGrowth?.total, 2);
assert.equal(breakout.sheet!.potential.ceiling, 82);
assert.equal(raiseCeiling(breakout, 2, 2027, "breakout", "Replay"), breakout, "an award cannot be replayed in the same season");
assert.equal(reviewPlayerCeilings(reviewed), reviewed, "season reviews are idempotent");
assert.equal(reviewPlayerCeilings(parseFranchise(exportFranchise(reviewed))).players.find(p => p.id === young.id)?.ceilingGrowth?.total, 2);
let career = breakout;
for (let season = 2028; season < 2050; season++) {
  career = raiseCeiling(career, 3, season, "mentorship", "Mentor progress");
  career = raiseCeiling(career, 2, season, "breakout", "Breakout progress");
}
assert.equal(career.ceilingGrowth?.total, 4);
assert.equal(career.sheet!.potential.ceiling, 84);
assert.equal(career.ceilingGrowth!.awards.reduce((n,a) => n + a.gain, 0), 4);
const cappedSave = parseFranchise(exportFranchise({ ...league, players: league.players.map(p => p.id === young.id ? career : p) }));
assert.equal(cappedSave.players.find(p => p.id === young.id)?.ceilingGrowth?.total, 4);
let mentorAwards = 0;
for (let seed = 0; seed < 300; seed++) {
  const learner = { ...young, id: "mentee-" + seed, mentorship: { mentorId: veteran.id, teamId: "bos", season: 2027, sharedGames: 40 } };
  const result = reviewPlayerCeilings({ ...full, players: [learner, veteran] });
  const winner = result.players[0]!;
  if (winner.ceilingGrowth?.total) { mentorAwards++; assert.ok(winner.ceilingGrowth.total >= 1 && winner.ceilingGrowth.total <= 3); }
  assert.equal(reviewPlayerCeilings(result), result);
}
assert.ok(mentorAwards > 5 && mentorAwards < 65, "mentorship ceiling changes stay rare");

const camp: GmLeagueState = { ...league, phase: "offseason", seasonFlow: { version: 1, season: league.season, stage: "training_camp", completed: [] } };
assert.equal(campSlots(camp), 2);
let selected = assignCamp(camp, young.id, "shooting").state;
selected = assignCamp(selected, veteran.id, "defense").state;
assert.equal(assignCamp(selected, other.id, "creation").ok, false);
const trained = applyTrainingCamp(selected);
assert.equal(trained.seasonFlow?.campResults?.filter(r => r.playerId === young.id || r.playerId === veteran.id).length, 2);
for (const id of [young.id, veteran.id]) {
  const p = trained.players.find(row => row.id === id)!;
  assert.ok(p.campFatigueGames === 2 || p.injury?.type === "Camp soreness");
  assert.equal(p.sheet?.potential.ceiling, selected.players.find(row => row.id === id)?.sheet?.potential.ceiling);
}
assert.equal(applyTrainingCamp(trained), trained);
const injuriesOff = applyTrainingCamp({ ...selected, settings: { ...selected.settings, injuryFrequency: 0 } });
assert.ok(injuriesOff.players.filter(p => p.id === young.id || p.id === veteran.id).every(p => p.campFatigueGames === 2 && !p.injury), "camp honors injury settings");
assert.equal(applyTrainingCamp(league), league, "camp cannot run in the regular season");
const fatigued = [{ ...young, campFatigueGames: 2 }];
const rested = tickInjuries(fatigued, 1, { teamIds: ["bos"], before: fatigued, trainerByTeam: {} });
assert.equal(rested[0]?.campFatigueGames, 1);
assert.equal(tickInjuries(rested, 1, { teamIds: ["nyk"], before: rested, trainerByTeam: {} })[0]?.campFatigueGames, 1);
assert.equal(tickInjuries(rested, 1, { teamIds: ["bos"], before: rested, trainerByTeam: {} })[0]?.campFatigueGames, 0);
console.log("Development checks passed: mentorship eligibility, growth, exposure, trade/reload guards, full-season breakouts, rare annual rolls, shared +4 career cap, camp limits and workload recovery.");
