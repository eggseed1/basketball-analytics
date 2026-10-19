/**
 * Published contracts and the real pick ledger.
 * Run: npx tsx scripts/test-gm-books.ts
 */
import assert from "node:assert/strict";

import { applyRealBooks, contractFromPublished } from "../src/gm/seed/real-books";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";

const tatum = contractFromPublished(
  ["2026-27", "2027-28", "2028-29", "2029-30"],
  [{ amount: 58456566 }, { amount: 62786682 }, { amount: 67116798 }, { amount: 71446914, option: "player" }],
  "2029-30 is a player option.",
  2027,
  "bird"
);
assert.ok(tatum);
assert.equal(tatum.annualSalaryM, 58.46);
assert.equal(tatum.yearsRemaining, 4);
assert.equal(tatum.option, "player");
assert.equal(tatum.years?.[3]?.option, "player");

const league = {
  season: 2027,
  tradeLog: [],
  booksBook: undefined,
  teams: [
    {
      id: "bos",
      abbr: "BOS",
      draftPicks: [{ id: "fake", season: 2027, round: 1, originalTeamId: "bos", ownerTeamId: "bos" }],
    },
  ],
  players: [
    {
      id: "1628369",
      name: "Jayson Tatum",
      teamId: "bos",
      contract: { yearsRemaining: 4, annualSalaryM: 58.5, birdRights: "bird", signedSeason: 2024 },
    } as GmPlayer,
  ],
} as unknown as GmLeagueState;

const booked = applyRealBooks(league);
const deal = booked.players[0]?.contract;
assert.equal(deal?.yearsRemaining, 4);
assert.equal(deal?.option, "player");
assert.ok((deal?.years?.length ?? 0) >= 4);
const bos = booked.teams[0]!;
assert.equal(booked.booksBook, 1);
assert.ok(bos.draftPicks.some((pick) => pick.season === 2027 && pick.round === 1 && pick.originalTeamId === "bos"));
assert.equal(
  bos.draftPicks.some((pick) => pick.season === 2027 && pick.round === 2),
  false
);
assert.ok((bos.owedPicks ?? []).some((pick) => pick.season === 2027 && pick.round === 2));
assert.equal(applyRealBooks(booked).players[0]?.contract?.annualSalaryM, deal?.annualSalaryM);

console.log("books ok", deal?.annualSalaryM, bos.draftPicks.length, bos.owedPicks?.length);
