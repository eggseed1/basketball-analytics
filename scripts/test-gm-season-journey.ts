import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { advanceSeasonJourney, beginOffseason, decideRookieContract, openingRosterIssues, pendingRookies, reopenRosterFill } from "../src/gm/engine/season-flow";
import { applySeasonProgression, applyTrainingCamp, assignCamp, campSlots, runSummerLeague } from "../src/gm/engine/season-development";
import { flowOf, cbaSeason } from "../src/gm/engine/season-flow-state";
import { finishDraftWithAi } from "../src/gm/engine/progression";
import { enterFreeAgency, startNextSeason } from "../src/gm/engine/offseason";
import { advanceFaDayDetailed, emptyFaMarket, resignOwnFreeAgent, runFaPeriod, userOfferFreeAgent } from "../src/gm/engine/free-agency";
import { applyOptionDecision } from "../src/gm/engine/fa-options";
import { tenderQualifyingOffer } from "../src/gm/engine/fa-qualifying";
import { extensionQuote, offerExtension } from "../src/gm/engine/extensions";
import { evaluateSigning, rosterCount, teamPayrollM, tickDeadMoney } from "../src/gm/engine/cap";
import { releasePlayer } from "../src/gm/engine/roster-decisions";
import { overallOf } from "../src/gm/engine/lineup";
import { seasonJourney } from "../src/gm/lib/season-journey";
import type { GmLeagueState, GmOffseasonStage } from "../src/gm/types";

const fresh = () => prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 83 }));
const playerAt = (league: GmLeagueState, id: string) => league.players.find(player => player.id === id)!;
const summer = (league: GmLeagueState) => beginOffseason({ ...league, phase: "playoffs", champion: { season: league.season, teamId: "bos", finalsMvpId: league.players[0]!.id, wins: 4, losses: 2 }, homeFlow: { awardsSeen: true, championSeen: false } });

// No menu or old shortcut may silently finish the draft or open the market.
{
  const league = fresh();
  assert.equal(league.automation?.autoFreeAgency, false);
  assert.equal(enterFreeAgency(league), league);
  assert.equal(startNextSeason(league), league);
  assert.equal(advanceSeasonJourney(league).ok, false);
  const review = summer(league);
  assert.equal(flowOf(review).stage, "review");
  assert.equal(review.history?.length, 1);
  assert.equal(flowOf(parseFranchise(exportFranchise(review))).stage, "review");
  assert.equal(beginOffseason(review).history?.length, 1);
}

// Extensions keep current salary intact and carry guaranteed future years into waivers.
{
  let league = fresh();
  const raw = league.players.find(player => player.teamId === "bos")!;
  const target = { ...raw, age: 29, morale: 80, draftYear: undefined, contract: { annualSalaryM: 30, yearsRemaining: 1, birdRights: "bird" as const, signedSeason: 2024, originalYears: 4, years: [{ season: 2027, salaryM: 30 }] } };
  league = { ...league, players: league.players.map(player => player.id === target.id ? target : player) };
  const quote = extensionQuote(league, target);
  assert.equal(quote.eligible, true);
  const before = teamPayrollM("bos", league.players);
  assert.equal(offerExtension(league, target.id, NaN, 2).ok, false);
  assert.equal(offerExtension(league, target.id, quote.askingSalaryM, 1.5).ok, false);
  const signed = offerExtension(league, target.id, quote.askingSalaryM, 3);
  assert.equal(signed.ok, true, signed.reason);
  assert.equal(teamPayrollM("bos", signed.state.players), before);
  assert.equal(playerAt(signed.state, target.id).contract?.yearsRemaining, 4);
  assert.equal(offerExtension(signed.state, target.id, quote.askingSalaryM, 2).ok, false);
  const released = releasePlayer(signed.state, target.id);
  const dead = released.teams.find(team => team.id === "bos")!.deadMoney!.find(row => row.playerId === target.id)!;
  assert.equal(dead.yearsLeft, 4);
  assert.equal(dead.annualM, 30);
  assert.equal(tickDeadMoney(released.teams.find(team => team.id === "bos")!).deadMoney!.find(row => row.playerId === target.id)!.annualM, quote.askingSalaryM);
  assert.equal(playerAt(released, target.id).rightsTeamId, null);
  assert.equal(releasePlayer(league, league.players.find(player => player.teamId === "nyk")!.id), league, "cannot waive another club's player");
}

// Required option/QO decisions stop manual bulk simulation. Own negotiations are verbal.
{
  let league = fresh();
  const roster = league.players.filter(player => player.teamId === "bos");
  const option = { ...roster[0]!, contract: { annualSalaryM: 10, yearsRemaining: 0, birdRights: "bird" as const, option: "team" as const, signedSeason: 2023 } };
  const own = { ...roster[1]!, teamId: null, contract: null, rightsTeamId: "bos", rightsKind: "bird" as const, lastSalaryM: 12, serviceYears: 4, qoStatus: undefined };
  league = { ...league, phase: "free_agency", financialSeason: 2028, draftPool: [], faMarket: emptyFaMarket(42), seasonFlow: { version: 1, season: 2027, stage: "free_agency", completed: [], contractsRolled: true }, players: league.players.map(player => player.id === option.id ? option : player.id === own.id ? own : player), freeAgents: [...league.freeAgents, own.id] };
  const blocked = runFaPeriod(league);
  assert.equal(blocked.faMarket?.stage, "options");
  assert.equal(playerAt(blocked, option.id).contract?.yearsRemaining, 0);
  assert.equal(advanceFaDayDetailed(blocked).blocked?.kind, "team_option");
  league = applyOptionDecision(blocked, option.id, "exercise");
  league = advanceFaDayDetailed(league).state;
  assert.equal(league.faMarket?.stage, "qualifying_offers");
  assert.equal(runFaPeriod(league).faMarket?.stage, "qualifying_offers");
  const qo = tenderQualifyingOffer(league, own.id, "bos");
  assert.equal(qo.ok, true);
  if (qo.ok) league = qo.state;
  league = advanceFaDayDetailed(league).state;
  assert.equal(league.faMarket?.stage, "rights");
  league = advanceFaDayDetailed(league).state;
  assert.equal(league.faMarket?.stage, "re_signing");
  const outsider = league.players.find(player => player.teamId == null && player.id !== own.id)!;
  assert.equal(userOfferFreeAgent(league, outsider.id, 5, 2).ok, false);
  const agreement = resignOwnFreeAgent(league, own.id);
  assert.equal(agreement.ok, true);
  if (agreement.ok) league = agreement.state;
  assert.equal(playerAt(league, own.id).teamId, null, "verbal agreement is not a signed player");
  assert.equal(league.faMarket?.agreements.some(row => row.playerId === own.id), true);
  assert.ok((league.faMarket?.reservations?.length ?? 0) > 0);
  for (let i = 0; i < 6 && playerAt(league, own.id).teamId == null; i++) league = advanceFaDayDetailed(league).state;
  assert.equal(playerAt(league, own.id).teamId, "bos");
  assert.equal(playerAt(league, own.id).contract?.signedSeason, 2028);
  assert.equal(cbaSeason(league), 2028);
}

// Whole summer, reloads at every handoff, two consecutive seasons.
let league = fresh();
for (let cycle = 0; cycle < 2; cycle++) {
  const season = league.season;
  league = summer(league);
  league.automation = { ...league.automation!, autoFreeAgency: true };
  const visited = new Set<GmOffseasonStage>();
  let rookieId: string | undefined;
  let ageAfterRoll: number | undefined;
  for (let step = 0; step < 90 && league.season === season; step++) {
    const stage = flowOf(league).stage!;
    visited.add(stage);
    if (stage === "draft") {
      league = finishDraftWithAi(league);
      const rookie = league.players.find(player => player.teamId === "bos" && player.pendingRookieContract);
      rookieId = rookie?.id;
      if (rookie) { assert.equal(rookie.contract, null); assert.equal(evaluateSigning(league, "nyk", rookie, 5, 2).ok, false); }
    }
    if (stage === "rookie_signing") {
      assert.equal(advanceSeasonJourney(league).ok, pendingRookies(league).length === 0);
      for (const rookie of pendingRookies(league)) {
        // Make summer room without bypassing the signing decision.
        while (rosterCount("bos", league.players) > 21) {
          const fringe = league.players.filter(player => player.teamId === "bos" && player.contract).sort((a,b) => overallOf(a) - overallOf(b))[0]!;
          league = releasePlayer(league, fringe.id);
        }
        const signed = decideRookieContract(league, rookie.id, true);
        assert.equal(signed.ok, true, signed.reason); league = signed.state;
      }
    }
    if (stage === "free_agency" && !ageAfterRoll && rookieId) {
      ageAfterRoll = playerAt(league, rookieId).age;
      assert.equal(playerAt(league, rookieId).contract?.yearsRemaining, 4, "rookie year is not burned at July rollover");
    }
    if (stage === "progression") {
      assert.equal(applySeasonProgression(league), league, "progression must be idempotent");
      if (rookieId && ageAfterRoll) assert.equal(playerAt(league, rookieId).age, ageAfterRoll, "progression must not age twice");
    }
    if (stage === "summer_league") {
      const statistics = JSON.stringify({ standings: league.standings, boxes: league.boxScores, players: league.players });
      league = runSummerLeague(league);
      assert.equal(league.seasonFlow?.summerLeague?.games.length, 3);
      assert.equal(runSummerLeague(league), league, "summer games cannot be farmed on reload");
      assert.equal(JSON.stringify({ standings: league.standings, boxes: league.boxScores, players: league.players }), statistics);
    }
    if (stage === "training_camp" && !league.seasonFlow?.campResults) {
      const candidates = league.players.filter(player => player.teamId === "bos" && player.contract && !player.injury);
      for (const player of candidates.slice(0, campSlots(league))) league = assignCamp(league, player.id, "shooting").state;
      if (candidates.length > campSlots(league)) assert.equal(assignCamp(league, candidates[campSlots(league)]!.id, "defense").ok, false);
      const applied = applyTrainingCamp(league);
      assert.equal(applyTrainingCamp(applied), applied);
      assert.equal(applied.seasonFlow?.campResults?.filter(row => candidates.some(player => player.id === row.playerId)).length, campSlots(league));
      for (const team of league.teams) {
        const ids = new Set(league.players.filter(player => player.teamId === team.id).map(player => player.id));
        assert.ok(applied.seasonFlow!.campResults!.filter(row => ids.has(row.playerId)).length <= campSlots(league, team.id));
      }
      league = applied;
    }
    if (stage === "roster_check") {
      while (rosterCount("bos", league.players) > league.settings.maxRoster) {
        const fringe = league.players.filter(player => player.teamId === "bos" && player.contract && player.contract.annualSalaryM >= 1.2).sort((a,b) => overallOf(a) - overallOf(b))[0]!;
        league = releasePlayer(league, fringe.id);
      }
      if (rosterCount("bos", league.players) < league.settings.minRoster) { league = reopenRosterFill(league).state; continue; }
      assert.deepEqual(openingRosterIssues(league), []);
      // A late-fill return preserves development and camps.
      const development = league.seasonFlow?.progression;
      const camps = league.seasonFlow?.campResults;
      let late = reopenRosterFill(league).state;
      late = runFaPeriod(late);
      const back = advanceSeasonJourney(late).state;
      assert.equal(back.seasonFlow?.stage, "roster_check");
      assert.deepEqual(back.seasonFlow?.progression, development);
      assert.deepEqual(back.seasonFlow?.campResults, camps);
    }
    const advanced = advanceSeasonJourney(league);
    assert.equal(advanced.ok, true, stage + ": " + advanced.reason);
    league = parseFranchise(exportFranchise(advanced.state));
  }
  assert.equal(league.season, season + 1, "summer must reach a new season");
  assert.equal(league.phase, "regular");
  assert.equal(flowOf(league).stage, undefined);
  assert.equal(visited.size, 11);
  assert.equal(league.history?.length, cycle + 1);
  assert.ok(league.schedule.length > 100);
  assert.equal(seasonJourney(league).title, "Opening night");
}

// Old FA saves already applied progression. Migration must preserve them exactly.
{
  const old = enterFreeAgency({ ...createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 42 }), phase: "draft", draftPool: [] });
  const migrated = prepareFranchise(old);
  assert.equal(migrated.seasonFlow?.stage, "free_agency");
  assert.equal(migrated.seasonFlow?.progressionApplied, true);
  assert.equal(applySeasonProgression(migrated), migrated);
  assert.deepEqual(migrated.players.map(player => [player.id, player.age, player.contract?.yearsRemaining]), old.players.map(player => [player.id, player.age, player.contract?.yearsRemaining]));
}
console.log("Season journey checks passed: contract windows, extensions, rookie signing, progression, summer stats, camp limits, reloads, legacy migration and two summer rollovers.");
