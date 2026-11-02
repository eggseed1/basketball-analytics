import assert from "node:assert/strict";
import { askingSalary, askingYears, minimumAcceptableSalary } from "../src/gm/engine/free-agency-ask";
import { userOfferFreeAgent, emptyFaMarket } from "../src/gm/engine/free-agency";
import { evaluateSigning } from "../src/gm/engine/cap";
import { extensionQuote } from "../src/gm/engine/extensions";
import type { GmLeagueState, GmPlayer, GmTeam } from "../src/gm/types";

function prospect(overall: number, age = 27, extra: Partial<GmPlayer> = {}): GmPlayer {
  return {
    id: "market-player", name: "Market Player", teamId: null, rightsTeamId: null,
    position: "SF", age, heightIn: 79, weightLbs: 220, morale: 70,
    minutesPreference: 30, injury: null, contract: null,
    ratings: { impact: 2, offense: 2, defense: 1, shooting: 75, finishing: 75, playmaking: 75, rebounding: 65, durability: 80, potential: 2 },
    sheet: { overall, attributes: {} as never, tendencies: {} as never, potential: {} as never },
    scouted: { impact: 2, offense: 2, defense: 1, uncertainty: 0 },
    ...extra
  } as GmPlayer;
}
function team(id: string): GmTeam {
  return {
    id, abbr: id.toUpperCase(), city: id, name: "Club", conference: "East",
    division: "Atlantic", ownerGoal: "contend",
    staff: { headCoach: { name: "Coach", offenseBonus: 0, defenseBonus: 0, developmentBonus: 0 }, scoutLevel: 1, trainerLevel: 1 },
    starters: { PG: null, SG: null, SF: null, PF: null, C: null },
    benchOrder: [], draftPicks: [], tradeExceptionsM: [], deadMoney: []
  } as GmTeam;
}
function league(player: GmPlayer): GmLeagueState {
  return {
    version: 1, id: "contract-market-test", season: 2027, day: 200, phase: "free_agency",
    userTeamId: "bos", teams: [team("bos"), team("nyk")], players: [player],
    freeAgents: [player.id], draftPool: [], schedule: [], standings: {}, boxScores: [],
    news: [], tradeLog: [], faMarket: { ...emptyFaMarket(42), stage: "open", day: 5 },
    settings: { salaryCapM: 165, luxuryTaxM: 198, firstApronM: 205, secondApronM: 215, maxRoster: 15, minRoster: 14, seasonLength: 82 },
    automation: { autoDraft: false, autoFreeAgency: false },
  } as unknown as GmLeagueState;
}
const base = league(prospect(80));
const bench = askingSalary(prospect(72), base);
const rotation = askingSalary(prospect(78), base);
const starter = askingSalary(prospect(83), base);
const star = askingSalary(prospect(89), base);
assert.ok(bench < rotation && rotation < starter && starter < star, "salary tiers should scale with player quality");
assert.ok(star > 30, "stars must command major cap share");
assert.ok(bench < 7, "end-of-bench salaries must not match starter salaries");

const strongSeason = {
  season: "2026-27", team: "BOS", gp: 70, min: 2450,
  pts: 1750, reb: 455, ast: 350, stl: 80, blk: 35, tov: 150,
  fgm: 610, fga: 1200, tpm: 130, tpa: 330, ftm: 400, fta: 470
};
assert.ok(
  askingSalary(prospect(80, 27, { seasonLine: strongSeason }), base) >
    askingSalary(prospect(80), base),
  "verified season production must improve salary expectations"
);
assert.ok(askingSalary(prospect(81, 35), base) < askingSalary(prospect(81, 27), base), "older veterans need age-aware valuation");
assert.ok(askingYears(prospect(85, 23), base) > askingYears(prospect(75, 35), base), "prime and older veterans require different term demands");

const elite = prospect(89);
const state = league(elite);
const ask = askingSalary(elite, state);
const floor = minimumAcceptableSalary(elite, state);
assert.ok(floor > ask * 0.9, "stars must protect most of their market price");
const cheap = userOfferFreeAgent(state, elite.id, 4, 1);
assert.equal(cheap.ok, false, "legal underbids must not immediately acquire elite players");
const outside = prospect(80, 27, { rightsTeamId: "nyk", rightsKind: "bird" });
assert.equal(evaluateSigning(league(outside), "bos", outside, askingSalary(outside, base), 5).ok, false, "outside clubs cannot offer the prior-team fifth year");

const veteran = prospect(77, 29, {
  teamId: "bos",
  contract: { yearsRemaining: 1, annualSalaryM: 3.0, signedSeason: 2024, originalYears: 4, birdRights: "bird", years: [{ season: 2027, salaryM: 3 }] }
});
const current = { ...league(veteran), phase: "regular" as const, freeAgents: [] };
const quote = extensionQuote(current, veteran);
assert.ok(quote.maxSalaryM >= 0.082 * current.settings.salaryCapM * 1.4 - 0.05, "veteran ceilings must use estimated league average when current salary is low");
assert.equal(quote.eligible, true, quote.reason);
console.log("GM market salary tiers, production, underbids, term and extension ceilings passed.");
