/** Mentor calibration, continuous negotiations and the post-Finals trade clock.
 * Run: npx tsx scripts/test-gm-front-office-polish.ts
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { mentorProfile, mentorshipBonus, mentorshipQuality, assignMentor } from "../src/gm/engine/development";
import { extensionInterest, extensionQuote, extensionSalaryTarget, offerExtension } from "../src/gm/engine/extensions";
import { emptyFaMarket } from "../src/gm/engine/free-agency";
import { projectFreeAgentResponse, legalFreeAgentSalaryRange } from "../src/gm/engine/fa-offer-projection";
import { evaluateOfferUtility } from "../src/gm/engine/fa-utility";
import { tradeWindowStatus } from "../src/gm/engine/trade-window";
import { beginOffseason } from "../src/gm/engine/season-flow";
import type { GmPlayer, GmLeagueState } from "../src/gm/types";

const league = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 781 });
const roster = league.players.filter(p => p.teamId === "bos" && p.contract && p.sheet);
assert.ok(roster.length >= 4);
const base = roster[0]!;
const make = (id: string, age: number, years: number, overall: number, workEthic = 85): GmPlayer => ({
  ...base, id, name: id, age, serviceYears: years, workEthic,
  sheet: { ...base.sheet!, overall }, position: "PG",
});
const mentorOld = make("old-vet", 38, 16, 72, 88);
const mentorStar = make("young-star", 29, 7, 95, 92);
const mentorElite = make("old-star", 38, 16, 94, 92);
const mentorRookie = make("late-rookie", 33, 1, 90, 92);
assert.ok(mentorshipQuality(mentorOld) > mentorshipQuality(mentorStar),
  "a 16-year veteran role player can out-mentor a young all-star");
assert.ok(mentorshipQuality(mentorElite) > mentorshipQuality(mentorOld),
  "great players are still advantaged at equal experience");
assert.ok(mentorshipQuality(mentorOld) > mentorshipQuality(mentorRookie),
  "age alone without actual career service cannot make an exceptional mentor");
assert.equal(mentorProfile(mentorOld).service, 16);
const young = make("young-student", 21, 2, 70, 85);
const mentorLeague = { ...league, players: [...league.players.filter(p => p.id !== base.id), young, mentorOld, mentorStar] };
const oldPair = assignMentor(mentorLeague, young.id, mentorOld.id);
const starPair = assignMentor(mentorLeague, young.id, mentorStar.id);
assert.ok(oldPair.ok && starPair.ok);
assert.ok(mentorshipBonus(young, oldPair.state.players) < 0.18 + 0.0001);
const oldMentee = oldPair.state.players.find(p => p.id === young.id)!;
const starMentee = starPair.state.players.find(p => p.id === young.id)!;
assert.ok(mentorshipBonus(oldMentee, oldPair.state.players) > mentorshipBonus(starMentee, starPair.state.players));

const extender = make("extension-player", 29, 8, 81, 82);
extender.morale = 76;
extender.contract = {
  ...base.contract!, annualSalaryM: 28, yearsRemaining: 1,
  originalYears: 4, signedSeason: 2023,
  option: null, extension: undefined,
  years: [{ season: 2027, salaryM: 28 }],
};
const extensionLeague: GmLeagueState = {
  ...league, phase: "regular", day: 1,
  players: [...league.players.filter(p => p.id !== base.id), { ...extender, teamId: "bos" }],
};
const q = extensionQuote(extensionLeague, extender);
assert.equal(q.eligible, true, q.reason);
const first = extensionSalaryTarget(q, 1);
const long = extensionSalaryTarget(q, 4);
assert.ok(first > long, "longer guaranteed term improves annual asking price");
const lower = Math.min(q.maxSalaryM, Math.max(1, q.askingSalaryM * 0.77));
const higher = Math.min(q.maxSalaryM, Math.max(lower + 1, q.askingSalaryM * 1.04));
const interest = (salary: number, years: number) => extensionInterest(extensionLeague, extender, q, salary, years);
for (const years of [1, 2, 3, 4]) {
  let last = 0;
  for (let i = 0; i <= 16; i++) {
    const amount = lower + (higher - lower) * i / 16;
    const chance = interest(amount, years);
    assert.ok(chance >= last, "annual salary cannot make a player less interested");
    assert.ok(chance > 0 && chance < 100);
    last = chance;
  }
}
for (const amount of [lower, q.askingSalaryM, higher]) {
  for (let years = 2; years <= 4; years++)
    assert.ok(interest(amount, years) >= interest(amount, years - 1),
      "each additional year must improve extension interest");
}
assert.ok(interest(higher, 3) > interest(lower, 3));
assert.equal(offerExtension(extensionLeague, extender.id, Math.max(1, long * 0.7), 4).ok, false);
assert.equal(offerExtension(extensionLeague, extender.id, Math.min(q.maxSalaryM, long + 0.10), 4).ok, true);

const free = { ...base, id: "free-player", teamId: null, contract: null,
  rightsTeamId: "bos", rightsKind: "bird" as const, age: 28 };
const faLeague: GmLeagueState = { ...league, phase: "free_agency",
  players: [...league.players, free], freeAgents: [...league.freeAgents, free.id],
  faMarket: { ...emptyFaMarket(12), stage: "open" } };
const range = legalFreeAgentSalaryRange(faLeague, free, 3);
assert.ok(range.maxM > range.minM + 1);
const salaries = [range.minM, (range.minM + range.maxM) / 2, range.maxM];
let previous = -1;
for (const salary of salaries) {
  const projection = projectFreeAgentResponse(faLeague, free, salary, 3);
  assert.ok(projection.legal);
  assert.ok(projection.chance > 0 && projection.chance < 100);
  assert.ok(projection.chance >= previous, "more money must not reduce FA interest");
  previous = projection.chance;
}
for (const salary of salaries) {
  const junior = projectFreeAgentResponse(faLeague, free, salary, 2);
  const senior = projectFreeAgentResponse(faLeague, free, salary, 3);
  const team = faLeague.teams.find(t => t.id === faLeague.userTeamId)!;
  assert.ok(senior.chance >= junior.chance, "additional guaranteed years improve player interest");
  assert.ok(evaluateOfferUtility(faLeague, free, team, salary, 3).total >=
    evaluateOfferUtility(faLeague, free, team, salary, 2).total,
    "the actual decision utility must improve with the years slider");
}

assert.equal(tradeWindowStatus({ ...league, phase: "regular", tradeDeadlinePassed: false }).open, true);
assert.equal(tradeWindowStatus({ ...league, phase: "regular", tradeDeadlinePassed: true }).open, false);
assert.equal(tradeWindowStatus({ ...league, phase: "play_in", tradeDeadlinePassed: true }).open, false);
assert.equal(tradeWindowStatus({ ...league, phase: "playoffs", tradeDeadlinePassed: true }).open, false);
assert.equal(tradeWindowStatus({ ...league, phase: "playoffs", tradeDeadlinePassed: true, champion: "bos" }).open, true);
for (const phase of ["offseason", "draft", "free_agency"] as const) {
  assert.equal(tradeWindowStatus({ ...league, phase, tradeDeadlinePassed: true }).open, true,
    "an old deadline flag cannot freeze "+phase+" trade proposals");
}
assert.equal(tradeWindowStatus({ ...faLeague, tradeDeadlinePassed: true, faMarket: { ...faLeague.faMarket!, stage: "moratorium" } }).open, false);
assert.equal(tradeWindowStatus({ ...faLeague, tradeDeadlinePassed: true, faMarket: { ...faLeague.faMarket!, stage: "open" } }).open, true);
const begun = beginOffseason({ ...league, phase: "playoffs", champion: "bos", tradeDeadlinePassed: true });
assert.equal(begun.phase, "offseason");
assert.equal(begun.tradeDeadlinePassed, false);
assert.equal(tradeWindowStatus(begun).open, true);
console.log("Mentor wisdom, monotonic contract interest, realistic term concessions and summer trade windows passed.");
