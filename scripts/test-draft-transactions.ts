/**
 * Draft transactions and drafted-but-unplayed search rows.
 * Run: npx tsx scripts/test-draft-transactions.ts
 */
import assert from "node:assert/strict";

import {
  buildDraftTransactions,
  draftRoundDate,
  easternDate,
  selectionFromTransaction,
  type DraftSelection,
} from "../src/data/providers/transactions/espn-draft";
import { transformEspnAthleteProfile } from "../src/data/transformers/espn-career";
import { classifyEspnTransactionDescription } from "../src/data/transformers/espn-transactions";
import { draftNightPicks } from "../src/data/runtime/draft-night-snapshot";
import { unplayedDraftees } from "../src/data/runtime/draftee-search";
import { getPlayerSearchIndex } from "../src/data/runtime/player-search-snapshot";
import { parseRosterMoves } from "../src/lib/espn-ledger-text";
import { formatOrdinal as ordinal } from "../src/lib/format";
import { normalizePlayerName } from "../src/lib/player-name";
import { createAcquisitionEngine } from "../src/trades/acquisition-engine";

const NIGHTS_2026 = { year: 2026, startDate: "2026-06-24T00:00Z", endDate: "2026-06-25T00:00Z" };
const NIGHTS_2025 = { year: 2025, startDate: "2025-06-26T00:00Z", endDate: "2025-06-27T03:59Z" };

const sel = (over: Partial<DraftSelection>): DraftSelection => ({
  year: 2026,
  round: 1,
  roundPick: 1,
  overall: 1,
  espnTeamId: "27",
  draftAthleteId: "110904",
  playerId: "5142718",
  name: "AJ Dybantsa",
  position: "F",
  ...over,
});

function testDates() {
  // 8pm Eastern start: the UTC date is a day ahead of the draft night.
  assert.equal(easternDate("2026-06-24T00:00Z"), "2026-06-23");
  assert.equal(draftRoundDate(NIGHTS_2026, 1), "2026-06-23");
  assert.equal(draftRoundDate(NIGHTS_2026, 2), "2026-06-24");
  assert.equal(draftRoundDate(NIGHTS_2025, 1), "2025-06-25");
  assert.equal(draftRoundDate(NIGHTS_2025, 2), "2025-06-26");
  // One-night draft: both rounds share the date.
  const oneNight = { year: 2030, startDate: "2030-06-27T00:00Z", endDate: "2030-06-27T03:59Z" };
  assert.equal(draftRoundDate(oneNight, 2), "2030-06-26");
  assert.equal(easternDate("not a date"), null);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 31, 42, 60].map(ordinal), [
    "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "31st", "42nd", "60th",
  ]);
}

function testRows() {
  const { transactions, skipped } = buildDraftTransactions(
    NIGHTS_2026,
    [
      sel({ round: 2, roundPick: 30, overall: 60, draftAthleteId: "9", playerId: null, name: "Malique Lewis" }),
      sel({}),
      sel({ overall: 5, espnTeamId: "999", draftAthleteId: "5" }),
    ],
    { ingestedAt: "2026-10-05T00:00:00.000Z" }
  );
  assert.deepEqual(skipped, { "unknown-team": 1 });
  assert.equal(transactions.length, 2);
  const [first, last] = transactions;
  assert.equal(first!.id, "espn-draft-2026-01");
  assert.equal(first!.type, "draft");
  assert.equal(first!.date, "2026-06-23");
  // June belongs to the season that is ending.
  assert.equal(first!.season, "2025-26");
  assert.deepEqual(first!.parties, [{ teamId: "27", teamAbbr: "WAS" }]);
  assert.equal(first!.description, "Drafted F AJ Dybantsa with the 1st overall pick in the 2026 NBA Draft.");
  assert.equal(first!.assets[0]!.asset.playerId, "5142718");
  assert.equal(last!.date, "2026-06-24");
  assert.equal(last!.assets[0]!.asset.id, "draft:2026:60");
  assert.equal(last!.assets[0]!.asset.playerId, undefined);

  assert.deepEqual(selectionFromTransaction(first!), sel({}));
  assert.deepEqual(
    selectionFromTransaction(last!),
    sel({ round: 2, roundPick: 30, overall: 60, draftAthleteId: "9", playerId: null, name: "Malique Lewis" })
  );

  // The ledger readers see a draft arrival for the named player.
  assert.equal(classifyEspnTransactionDescription(first!.description!), "draft");
  assert.deepEqual(parseRosterMoves(first!.description), [{ kind: "draft", label: "AJ Dybantsa" }]);
  assert.deepEqual(parseRosterMoves("Drafted C Mikel Brown Jr. with the 6th overall pick in the 2026 NBA Draft."), [
    { kind: "draft", label: "Mikel Brown Jr." },
  ]);
  assert.deepEqual(parseRosterMoves("Drafted Egor Demin with the 8th overall pick in the 2025 NBA Draft."), [
    { kind: "draft", label: "Egor Demin" },
  ]);
}

function testEngineUsesLoggedDraft() {
  const engine = createAcquisitionEngine(
    [
      {
        id: "espn-draft-2026-01",
        date: "2026-06-23",
        teamId: "27",
        description: "Drafted F AJ Dybantsa with the 1st overall pick in the 2026 NBA Draft.",
      },
    ],
    {
      playerFor: (label) => (label === "AJ Dybantsa" ? { playerId: "5142718", name: label } : null),
      draftOf: () => ({ year: 2026, round: 1, pick: 1, teamId: "27" }),
      draftedBy: () => [],
      draftees: [{ playerId: "5142718", name: "AJ Dybantsa" }],
      currentTeamOf: () => "27",
      lastDraftYear: 2026,
    }
  );
  const arrival = engine.latestArrival("27", "p:5142718");
  assert.equal(arrival?.how, "draft");
  assert.equal(arrival?.date, "2026-06-23");
  assert.equal(arrival && "eventId" in arrival ? arrival.eventId : null, "espn-draft-2026-01");
  assert.deepEqual(arrival?.how === "draft" ? arrival.draft : null, { year: 2026, round: 1, pick: 1 });
}

function testSearchRows() {
  const draftees = unplayedDraftees();
  const byId = new Map(draftees.map((d) => [d.id, d]));
  const indexIds = new Set(getPlayerSearchIndex().map((r) => r.id));

  const aj = byId.get("5142718");
  assert.ok(aj, "AJ Dybantsa is searchable by his ESPN id");
  assert.equal(aj!.overall, 1);
  assert.equal(aj!.year, 2026);
  assert.equal(aj!.position, "F");

  for (const d of draftees) {
    assert.ok(d.id, `${d.name} has a route id`);
    assert.ok(!indexIds.has(d.id), `${d.name} already has box-score rows`);
  }
  assert.equal(new Set(draftees.map((d) => d.id)).size, draftees.length, "one row per player");

  // Played rookies stay out (Cooper Flagg, Dylan Harper).
  assert.ok(!byId.has("5041939"));
  assert.ok(!byId.has("5037871"));

  // Every linked draft-night pick is either searchable or already played
  // (index rows can carry another id, e.g. bref:essenno01 for Noa Essengue).
  const indexNames = new Set(getPlayerSearchIndex().map((r) => normalizePlayerName(r.name)));
  for (const p of draftNightPicks()) {
    if (!p.playerId) continue;
    const played = indexIds.has(p.playerId) || indexNames.has(normalizePlayerName(p.name));
    assert.ok(byId.has(p.playerId) || played, `${p.name} (${p.year} #${p.overall}) missing`);
  }
}

function testFreeAgentProfileHasNoTeam() {
  // The profile keeps a free agent's last club in `team`.
  const profile = (status: string) =>
    transformEspnAthleteProfile(
      { athlete: { id: "5184016", displayName: "Malique Lewis", team: { id: "15" }, status: { type: status } } },
      "5184016"
    );
  assert.equal(profile("free-agent")?.currentTeamId, undefined);
  assert.equal(profile("active")?.currentTeamId, "15");
  assert.equal(profile("inactive")?.currentTeamId, "15");
}

testDates();
testRows();
testFreeAgentProfileHasNoTeam();
testEngineUsesLoggedDraft();
testSearchRows();
console.log("draft transactions: ok");
