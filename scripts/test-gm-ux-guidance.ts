import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { emptyFaMarket } from "../src/gm/engine/free-agency";
import { advanceSeasonJourney, openingRosterChecks, reopenRosterFill } from "../src/gm/engine/season-flow";
import { assignCamp, applyTrainingCamp, campSkillChanges, campSlots, suggestCampAssignments } from "../src/gm/engine/season-development";
import { releasePlayer } from "../src/gm/engine/roster-decisions";
import { rosterCount } from "../src/gm/engine/cap";
import { seasonJourney } from "../src/gm/lib/season-journey";
import { remainingSalaryM } from "../src/gm/lib/contract-terms";
import type { GmLeagueState, GmOffseasonStage } from "../src/gm/types";

function summer(stage: GmOffseasonStage): GmLeagueState {
  const league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 71 }));
  return { ...league, phase: "offseason", faMarket: { ...emptyFaMarket(71), stage: "fill", done: true }, seasonFlow: { version: 1, season: 2027, stage, completed: [], progressionApplied: true, contractsRolled: true } };
}

// A blocked season must provide a route to repair it while retaining the engine guard.
{
  let under = summer("roster_check");
  while (rosterCount("bos", under.players) >= under.settings.minRoster) {
    under = releasePlayer(under, under.players.find(player => player.teamId === "bos" && (player.contract?.annualSalaryM ?? 0) >= 1.2)!.id);
  }
  assert.equal(openingRosterChecks(under)[0]?.kind, "minimum");
  assert.equal(advanceSeasonJourney(under).ok, false);
  assert.equal(seasonJourney(under).primaryAction, "open_roster_fill");
  const market = reopenRosterFill(under);
  assert.equal(market.ok, true);
  assert.equal(market.state.phase, "free_agency");
  assert.equal(market.state.seasonFlow?.returnFromMarket, "roster_check");
  assert.equal(market.state.seasonFlow?.progressionApplied, true);

  let over = summer("roster_check");
  over = { ...over, settings: { ...over.settings, maxRoster: rosterCount("bos", over.players) - 1 } };
  assert.equal(openingRosterChecks(over)[0]?.kind, "maximum");
  assert.equal(seasonJourney(over).primaryHref, "/gm/roster");
  assert.equal(advanceSeasonJourney(over).ok, false);
}

// Suggestions keep the GM's choice, avoid unavailable players, and fill only real slots.
{
  let league = summer("training_camp");
  const candidates = league.players.filter(player => player.teamId === "bos" && player.contract && !player.injury);
  const chosen = candidates[0]!, injured = candidates[1]!;
  league = { ...league, players: league.players.map(player => player.id === injured.id ? { ...player, injury: { type: "Ankle sprain", gamesRemaining: 4, reinjuryRisk: 0.1 } } : player) };
  assert.match(seasonJourney(league).primaryLabel, /without individual camps/);
  league = assignCamp(league, chosen.id, "conditioning").state;
  const suggested = suggestCampAssignments(league);
  assert.equal(suggested.ok, true);
  const assignments = suggested.state.seasonFlow!.campAssignments!;
  assert.equal(assignments[chosen.id], "conditioning");
  assert.equal(assignments[injured.id], undefined);
  assert.equal(Object.keys(assignments).length, campSlots(league));
  assert.deepEqual(suggestCampAssignments(suggested.state).state.seasonFlow?.campAssignments, assignments);
  const changedHiddenPotential = { ...league, players: league.players.map(player => ({ ...player, ratings: { ...player.ratings, potential: 99 - player.ratings.potential } })) };
  assert.deepEqual(suggestCampAssignments(changedHiddenPotential).state.seasonFlow?.campAssignments, assignments, "suggestions must not use hidden potential");
  const applied = applyTrainingCamp(suggested.state);
  for (const [id, focus] of Object.entries(assignments)) {
    const before = suggested.state.players.find(player => player.id === id)!;
    const after = applied.players.find(player => player.id === id)!;
    for (const preview of campSkillChanges(suggested.state, before, focus)) assert.equal(after.sheet!.attributes[preview.key], preview.after, "camp must honor the visible skill preview");
  }
  const restored = parseFranchise(exportFranchise(applied));
  assert.equal(applyTrainingCamp(restored), restored, "reloading cannot apply a second camp");
  assert.equal(suggestCampAssignments(restored).ok, false);
}

// Money shown before a waiver follows the salary book and matches what is retained.
{
  const league = summer("roster_check");
  const target = league.players.find(player => player.teamId === "bos")!;
  const contract = { annualSalaryM: 10, yearsRemaining: 3, birdRights: "bird" as const, signedSeason: 2026, years: [{ season: 2027, salaryM: 10 }, { season: 2028, salaryM: 12 }, { season: 2029, salaryM: 14 }] };
  assert.equal(remainingSalaryM(contract), 36);
  const withBook = { ...league, players: league.players.map(player => player.id === target.id ? { ...player, contract } : player) };
  const released = releasePlayer(withBook, target.id);
  const dead = released.teams.find(team => team.id === "bos")!.deadMoney!.find(row => row.playerId === target.id)!;
  assert.equal(dead.years?.reduce((sum, year) => sum + year.salaryM, 0), remainingSalaryM(contract));
  const expired = { ...withBook, players: withBook.players.map(player => player.id === target.id ? { ...player, contract: { ...contract, yearsRemaining: 0, years: [] } } : player) };
  assert.equal(remainingSalaryM(expired.players.find(player => player.id === target.id)!.contract), 0);
  assert.ok(!releasePlayer(expired, target.id).teams.find(team => team.id === "bos")?.deadMoney?.some(row => row.playerId === target.id), "expired deals must not create a new guarantee");
}
console.log("Franchise UX guidance passed: actionable roster guards, camp suggestions and previews, reloads, and waiver commitments.");
