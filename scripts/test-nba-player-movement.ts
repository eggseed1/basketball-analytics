/**
 *   npx tsx --conditions=react-server scripts/test-nba-player-movement.ts
 */
import assert from "node:assert/strict";

import {
  buildNbaMovementGapTransactions,
  type NbaMovementRow,
} from "../src/data/providers/transactions/nba-player-movement";
import type { CanonicalTransaction } from "../src/data/types/transaction-lineage";

const TOR = 1610612761;
const LAC = 1610612746;
const DEN = 1610612743;

function row(partial: Partial<NbaMovementRow> & Pick<NbaMovementRow, "TRANSACTION_DESCRIPTION">): NbaMovementRow {
  return {
    Transaction_Type: "Signing",
    TRANSACTION_DATE: "2026-09-14T00:00:00",
    TEAM_ID: TOR,
    PLAYER_ID: 1,
    PLAYER_SLUG: "someone",
    GroupSort: "Signing 1",
    ...partial,
  };
}

function espn(date: string, teamId: string, description: string): CanonicalTransaction {
  return {
    id: `espn-${date}-${teamId}-${description.length}`,
    date,
    season: "2026-27",
    type: "other",
    status: "real",
    parties: [{ teamId }],
    teamIds: [teamId],
    assets: [],
    methodologyVersion: "1.0",
    description,
  };
}

const trade = (desc: string, team: number, from: number, playerId: number, slug: string): NbaMovementRow =>
  row({
    Transaction_Type: "Trade",
    TRANSACTION_DESCRIPTION: desc,
    TEAM_ID: team,
    Additional_Sort: from,
    PLAYER_ID: playerId,
    PLAYER_SLUG: slug,
    GroupSort: "Trade 2026015",
  });

const rows: NbaMovementRow[] = [
  trade("LA Clippers received guard Gradey Dick from Toronto Raptors.", LAC, TOR, 11, "gradey-dick"),
  trade("LA Clippers received forward Brandon Ingram from Toronto Raptors.", LAC, TOR, 12, "brandon-ingram"),
  trade("LA Clippers received draft consideration from Toronto Raptors.", LAC, TOR, 0, ""),
  trade("Toronto Raptors received forward Kawhi Leonard from LA Clippers.", TOR, LAC, 13, "kawhi-leonard"),
  row({
    TRANSACTION_DATE: "2015-07-12T00:00:00",
    TRANSACTION_DESCRIPTION: "Denver Nuggets re-signed center Nikola Jokic to a Contract.",
    TEAM_ID: DEN,
    PLAYER_SLUG: "nikola-jokic",
    GroupSort: "Signing 2",
  }),
  row({
    Transaction_Type: "Waive",
    TRANSACTION_DATE: "2015-08-01T00:00:00",
    TRANSACTION_DESCRIPTION: "Denver Nuggets waived  forward Joey  Dorsey.",
    TEAM_ID: DEN,
    PLAYER_SLUG: "joey-dorsey",
    GroupSort: "Waive 3",
  }),
  row({
    TRANSACTION_DATE: "2026-09-22T00:00:00",
    TRANSACTION_DESCRIPTION: "Toronto Raptors re-signed forward Kawhi Leonard to a Veteran Extension.",
    PLAYER_SLUG: "kawhi-leonard",
    GroupSort: "Signing 4",
  }),
];

const existing = [
  // Same signing logged by ESPN 16 days later: covered by the same-kind rule.
  espn("2015-07-28", "7", "Signed C Nikola Jokic to a multi-year contract."),
  // Names Dorsey within 30 days but as a signing, so the waiver is still a gap.
  espn("2015-07-20", "7", "Signed F Joey Dorsey."),
];

const result = buildNbaMovementGapTransactions(rows, existing, { ingestedAt: "2026-10-03T00:00:00Z" });
const byDesc = new Map(result.transactions.map((tx) => [tx.description, tx]));

const tor = byDesc.get(
  "Acquired forward Kawhi Leonard from LA Clippers in exchange for guard Gradey Dick, forward Brandon Ingram and draft consideration."
);
assert.ok(tor, "Toronto side of the Kawhi trade");
assert.equal(tor.type, "trade");
assert.deepEqual(tor.teamIds, ["28"]);
assert.equal(tor.season, "2026-27");
assert.equal(tor.source, "nba-player-movement");

const lac = byDesc.get(
  "Acquired guard Gradey Dick, forward Brandon Ingram and draft consideration from Toronto Raptors in exchange for forward Kawhi Leonard."
);
assert.ok(lac, "Clippers side of the Kawhi trade");
assert.deepEqual(lac.teamIds, ["12"]);

assert.equal(byDesc.get("Re-signed forward Kawhi Leonard to a Veteran Extension.")?.type, "extension");
assert.ok(![...byDesc.keys()].some((d) => d?.includes("Jokic")), "Jokic signing is covered by ESPN");
assert.equal(byDesc.get("Waived forward Joey Dorsey.")?.type, "waive");
assert.equal(result.coveredCount, 1);
assert.equal(result.transactions.length, 4);

// Stable ids: a rerun gives the same rows.
const again = buildNbaMovementGapTransactions(rows, existing, { ingestedAt: "2026-10-04T00:00:00Z" });
assert.deepEqual(
  again.transactions.map((tx) => tx.id),
  result.transactions.map((tx) => tx.id)
);

// Once ESPN logs the trade, both sides drop out.
const covered = buildNbaMovementGapTransactions(
  rows,
  [...existing, espn("2026-09-15", "28", "Acquired F Kawhi Leonard from LA Clippers."), espn("2026-09-15", "12", "Traded F Kawhi Leonard to Toronto.")],
  { ingestedAt: "2026-10-04T00:00:00Z" }
);
assert.ok(!covered.transactions.some((tx) => tx.type === "trade"));

console.log("test-nba-player-movement: ok");
