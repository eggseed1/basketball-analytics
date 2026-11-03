import { mkdirSync, writeFileSync } from "node:fs";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { exportFranchise, prepareFranchise } from "../src/gm/engine/franchise";
import { beginOffseason } from "../src/gm/engine/season-flow";
import { extensionQuote } from "../src/gm/engine/extensions";
import { emptyFaMarket } from "../src/gm/engine/free-agency";
import { normalizeSeasonFlow } from "../src/gm/engine/season-flow-state";
import { askingSalary } from "../src/gm/engine/free-agency-ask";
import { legalFreeAgentSalaryRange } from "../src/gm/engine/fa-offer-projection";
const dir = process.argv[2] ?? "/tmp/franchise-qa";
mkdirSync(dir, { recursive: true });
let league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 83 }));
const first = league.players.find(player => player.teamId === "bos")!;
const target = { ...first, age: 29, morale: 80, draftYear: undefined, contract: { annualSalaryM: 30, yearsRemaining: 1, birdRights: "bird" as const, signedSeason: 2024, originalYears: 4, years: [{ season: 2027, salaryM: 30 }] } };
league = { ...league, players: league.players.map(player => player.id === target.id ? target : player) };
const quote = extensionQuote(league, target);
if (!quote.eligible) throw new Error(quote.reason);
writeFileSync(dir + "/journey-regular.json", exportFranchise(league));
writeFileSync(dir + "/journey-manifest.json", JSON.stringify({ playerId: target.id, playerName: target.name, ask: quote.askingSalaryM }));
const review = beginOffseason({ ...league, phase: "playoffs", champion: { season: 2027, teamId: "bos", finalsMvpId: target.id, wins: 4, losses: 2 }, homeFlow: { awardsSeen: true, championSeen: false } });
writeFileSync(dir + "/journey-review.json", exportFranchise(review));
const camp = { ...review, phase: "offseason" as const, seasonFlow: { ...review.seasonFlow!, stage: "training_camp" as const, contractsRolled: true, progressionApplied: true, completed: ["review", "staff", "lottery", "scouting", "draft", "rookie_signing", "free_agency", "progression", "summer_league"] as const }, faMarket: { ...emptyFaMarket(42), stage: "fill" as const, done: true } };
writeFileSync(dir + "/journey-camp.json", exportFranchise({ ...camp, seasonFlow: { ...camp.seasonFlow, completed: [...camp.seasonFlow.completed] } }));

/** Browser fixtures for free-agent terms, verbal commitment and RFA gates. */
const freeAgent = { ...target, teamId: null, contract: null, rightsTeamId: "bos",
  rightsKind: "bird" as const, lastSalaryM: 30 };
const faBase = normalizeSeasonFlow({
  ...league, phase: "free_agency" as const,
  players: league.players.map(player => player.id === target.id ? freeAgent : player),
  freeAgents: [...new Set([...league.freeAgents, target.id])],
});
const freeAgency = {
  ...faBase,
  faMarket: { ...emptyFaMarket(221), stage: "moratorium" as const, day: 1 },
};
const faRange = legalFreeAgentSalaryRange(freeAgency, freeAgent, 3);
const faAsk = askingSalary(freeAgent, freeAgency);
if (faRange.maxM + 0.05 < faAsk) throw new Error("Browser free-agency fixture cannot offer the player's ask.");
writeFileSync(dir + "/journey-fa.json", exportFranchise(freeAgency));
// Use a rotation-level RFA so his legal two-year exception offer is also
// a plausible contract, rather than testing a superstar minimum-sheet exploit.
if (!freeAgent.sheet) throw new Error("Expected the prepared player ratings sheet.");
const restrictedPlayer = {
  ...freeAgent, sheet: { ...freeAgent.sheet, overall: 77 }, lastSalaryM: 8,
  rightsTeamId: "nyk", rightsKind: "restricted" as const,
  qoStatus: "tendered" as const,
};
const rfa = { ...freeAgency, players: freeAgency.players.map(player =>
  player.id === target.id ? restrictedPlayer : player) };
writeFileSync(dir + "/journey-rfa.json", exportFranchise(rfa));
writeFileSync(dir + "/journey-fa-manifest.json", JSON.stringify({
  playerId: target.id, playerName: freeAgent.name, ask: faAsk,
  maxSalaryM: faRange.maxM,
}));
