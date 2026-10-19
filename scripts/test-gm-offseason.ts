/**
 * GM Lab summer loop: expiring deals, options, CPU signings, next cap year.
 * Run: npx tsx scripts/test-gm-offseason.ts
 */
import assert from "node:assert/strict";

import {
  enterFreeAgency,
  noteTradeDeadline,
  runCpuFreeAgency,
  signingAllowed,
  startNextSeason,
} from "../src/gm/engine/offseason";
import { evaluateSigning, tradeSalaryLegal } from "../src/gm/engine/cap";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { getCbaRules } from "../src/gm/myleague/cba-registry";
import type { GmPlayer } from "../src/gm/types";

const league = createGeneratedLeague({
  userTeamId: "bos",
  season: 2026,
  seed: 42,
});

const bos = league.players.filter((p) => p.teamId === "bos");
assert.ok(bos.length >= 4, "boston has a roster");

function withContract(
  player: GmPlayer,
  years: number,
  option: "player" | "team" | null,
  impact: number
): GmPlayer {
  return {
    ...player,
    ratings: { ...player.ratings, impact },
    contract: {
      yearsRemaining: years,
      annualSalaryM: 12,
      birdRights: "none",
      option,
      signedSeason: 2024,
    },
  };
}

const expiring = withContract(bos[0]!, 1, null, 1);
const kept = withContract(bos[1]!, 3, null, 2);
const teamOption = withContract(bos[2]!, 1, "team", 1);
const playerOption = withContract(bos[3]!, 1, "player", 4);
const rookie = withContract(bos[4]!, 4, null, 0);
rookie.draftYear = 2026;

const patched = {
  ...league,
  phase: "draft" as const,
  draftPool: [] as string[],
  players: league.players.map((player) => {
    if (player.id === expiring.id) return expiring;
    if (player.id === kept.id) return kept;
    if (player.id === teamOption.id) return teamOption;
    if (player.id === playerOption.id) return playerOption;
    if (player.id === rookie.id) return rookie;
    return player;
  }),
};

const market = enterFreeAgency(patched);
assert.equal(market.phase, "free_agency");
assert.equal(market.season, 2026);

const find = (id: string) => market.players.find((p) => p.id === id)!;
assert.equal(find(expiring.id).teamId, null, "one-year deal hits the market");
assert.equal(find(kept.id).teamId, "bos");
assert.equal(find(kept.id).contract?.yearsRemaining, 2);
assert.equal(find(teamOption.id).teamId, "bos", "team option picked up");
assert.equal(find(teamOption.id).contract?.yearsRemaining, 1);
assert.equal(find(playerOption.id).teamId, null, "star declines the player option");
assert.equal(find(rookie.id).contract?.yearsRemaining, 4, "draft night year is not burned");

const twice = enterFreeAgency(market);
assert.equal(twice.players.find((p) => p.id === kept.id)?.age, find(kept.id).age);

const signed = runCpuFreeAgency(market, { includeUser: false });
const other = signed.teams.find((t) => t.id !== "bos")!;
const before = market.players.filter((p) => p.teamId === other.id).length;
const after = signed.players.filter((p) => p.teamId === other.id).length;
assert.ok(after >= before, "cpu signing does not strip a roster");

const next = startNextSeason(market);
assert.equal(next.phase, "regular");
assert.equal(next.season, 2027);
assert.equal(next.day, 0);
assert.ok(next.schedule.length > 100);
assert.equal(next.settings.salaryCapM, getCbaRules(2027).salaryCapM);
assert.ok(next.draftPool.length > 0);
assert.equal(
  next.players.find((p) => p.id === kept.id)?.age,
  find(kept.id).age,
  "opening the year does not age twice"
);

const blocked = signingAllowed(
  {
    ...market,
    userTeamId: "bos",
    settings: { ...market.settings, salaryCapM: 5, minRoster: 10 },
  },
  expiring.id,
  20,
  2
);
assert.equal(blocked.ok, false);

const birdFa = market.players.find((p) => p.id === expiring.id)!;
const withRights = {
  ...market,
  players: market.players.map((p) =>
    p.id === birdFa.id
      ? {
          ...p,
          rightsTeamId: "bos",
          rightsKind: "bird" as const,
          lastSalaryM: 40,
        }
      : p
  ),
};
const overCap = {
  ...withRights,
  settings: {
    ...withRights.settings,
    salaryCapM: 100,
    luxuryTaxM: 400,
    firstApronM: 420,
    secondApronM: 440,
  },
  players: withRights.players.map((p) =>
    p.teamId === "bos" && p.contract
      ? { ...p, contract: { ...p.contract, annualSalaryM: 20 } }
      : p
  ),
};
const bosPayroll = overCap.players
  .filter((p) => p.teamId === "bos" && p.contract)
  .reduce((sum, p) => sum + (p.contract?.annualSalaryM ?? 0), 0);
assert.ok(bosPayroll > 100, "boston is over the toy cap");
const birdDeal = evaluateSigning(overCap, "bos", overCap.players.find((p) => p.id === birdFa.id)!, 20, 4);
assert.equal(birdDeal.ok, true);
if (birdDeal.ok) assert.equal(birdDeal.via, "bird");

const outsider = overCap.players.find((p) => p.teamId == null && p.id !== birdFa.id)!;
const mle = evaluateSigning(overCap, "bos", outsider, 8, 2);
assert.equal(mle.ok, true);
if (mle.ok) assert.equal(mle.via, "mle");

const apron = tradeSalaryLegal({
  payrollM: 200,
  outM: 40,
  inM: 20,
  outCount: 2,
  inCount: 1,
  settings: { ...overCap.settings, secondApronM: 150 },
});
assert.equal(apron.ok, false);

const deadline = noteTradeDeadline({
  ...league,
  day: 200,
  phase: "regular",
});
assert.equal(deadline.tradeDeadlinePassed, true);
const locked = noteTradeDeadline(deadline);
assert.equal(
  locked.news.filter((item) => item.headline.includes("deadline")).length,
  1
);

console.log("gm offseason: ok");
