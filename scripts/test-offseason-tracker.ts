/**
 * Offseason Tracker / transaction EVENT archive tests.
 * Run: npx tsx scripts/test-offseason-tracker.ts
 */
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  clearTransactionEventIndexCache,
  buildTransactionEventIndex,
  filterTransactionEvents,
  paginateEvents,
  aggregateTeamActivity,
  buildOffseasonPulse,
} from "../src/data/providers/transactions/transaction-event-index";
import {
  currentOffseasonLabelYear,
  offseasonWindowForYear,
} from "../src/data/providers/transactions/offseason-window";
import { writeTransactionArchive } from "../src/data/providers/transactions/transaction-archive-store";
import {
  TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
  type CanonicalTransaction,
} from "../src/data/types/transaction-lineage";
import { isTransactionGenealogyUiReady } from "../src/data/queries/transaction-lineage";

function tx(
  partial: Partial<CanonicalTransaction> &
    Pick<CanonicalTransaction, "id" | "date" | "type" | "teamIds" | "description">
): CanonicalTransaction {
  return {
    season: "2025-26",
    status: "real",
    parties: [{ teamId: partial.teamIds[0], teamAbbr: "BOS" }],
    assets: [],
    source: "espn-site-v2-transactions",
    sourceVersion: "1.0",
    methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
    provenance: {
      source: "espn-site-v2-transactions",
      datasetVersion: "1.0",
      ingestedAt: "2026-01-01T00:00:00.000Z",
      espnCalendarYear: 2026,
    },
    ...partial,
  };
}

async function withTempArchive(
  transactions: CanonicalTransaction[],
  fn: (cwd: string) => Promise<void>
) {
  const dir = path.join(
    os.tmpdir(),
    `ba-offseason-${process.pid}-${Date.now()}`
  );
  await mkdir(dir, { recursive: true });

  clearTransactionEventIndexCache();
  await writeTransactionArchive(
    {
      transactions,
      ownershipEdges: [],
      espnCalendarYears: [2026],
      validationIssueCounts: {},
      builtAt: "2026-08-01T00:00:00.000Z",
    },
    dir
  );

  try {
    await fn(dir);
  } finally {
    clearTransactionEventIndexCache();
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  // Offseason window helpers
  {
    const w = offseasonWindowForYear(2026);
    assert.equal(w.startDate, "2026-06-01");
    assert.equal(w.endDate, "2026-10-15");
    assert.equal(w.upcomingSeason, "2026-27");
    assert.equal(
      currentOffseasonLabelYear(new Date("2026-08-14T12:00:00Z")),
      2026
    );
    assert.equal(
      currentOffseasonLabelYear(new Date("2026-03-01T12:00:00Z")),
      2025
    );
  }

  const fixtures: CanonicalTransaction[] = [
    tx({
      id: "e1",
      date: "2026-07-01",
      season: "2025-26",
      type: "signing",
      teamIds: ["2"],
      description: "Signed G Test Player to a contract.",
      parties: [{ teamId: "2", teamAbbr: "BOS" }],
    }),
    tx({
      id: "e2",
      date: "2026-07-06",
      season: "2025-26",
      type: "trade",
      teamIds: ["2"],
      description: "Traded F Someone to Brooklyn for draft considerations.",
      parties: [{ teamId: "2", teamAbbr: "BOS" }],
    }),
    tx({
      id: "e3",
      date: "2026-07-06",
      season: "2025-26",
      type: "waive",
      teamIds: ["17"],
      description: "Waived G Other Player.",
      parties: [{ teamId: "17", teamAbbr: "BKN" }],
    }),
    tx({
      id: "e4",
      date: "2026-08-10",
      season: "2026-27",
      type: "extension",
      teamIds: ["2"],
      description: "Signed F Ace to a contract extension.",
      parties: [{ teamId: "2", teamAbbr: "BOS" }],
    }),
    tx({
      id: "e5",
      date: "2025-07-15",
      season: "2024-25",
      type: "signing",
      teamIds: ["2"],
      description: "Signed G Prior Year.",
      parties: [{ teamId: "2", teamAbbr: "BOS" }],
    }),
    // duplicate id should be excluded by archive write validation path — we won't include dup here
  ];

  await withTempArchive(fixtures, async (cwd) => {
    const index = await buildTransactionEventIndex({ force: true, cwd });
    assert.equal(index.events.length, 5);
    // No assets / ownership from event index
    assert.ok(index.events.every((e) => e.description.length > 0));

    // Current offseason filtering
    const off26 = filterTransactionEvents(index, { offseasonYear: 2026 });
    assert.equal(off26.length, 4);
    assert.ok(off26.every((e) => e.date >= "2026-06-01" && e.date <= "2026-10-15"));

    // Season filter
    const s = filterTransactionEvents(index, { season: "2026-27" });
    assert.equal(s.length, 1);
    assert.equal(s[0]!.id, "e4");

    // Team filter
    const bos = filterTransactionEvents(index, {
      offseasonYear: 2026,
      teamId: "2",
    });
    assert.equal(bos.length, 3);

    // Date filter
    const week = filterTransactionEvents(index, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-07",
    });
    assert.equal(week.length, 3);

    // Text search on descriptions
    const tradeQ = filterTransactionEvents(index, { q: "traded" });
    assert.equal(tradeQ.length, 1);
    assert.equal(tradeQ[0]!.sourceTextCategory, "trade");

    // Chronological ordering (newest first in index)
    assert.ok(index.events[0]!.date >= index.events[1]!.date);

    // Pagination
    const page = paginateEvents(off26, 1, 2);
    assert.equal(page.events.length, 2);
    assert.equal(page.total, 4);
    assert.equal(page.pageCount, 2);

    // Team activity wording data
    const activity = aggregateTeamActivity(off26);
    const bosA = activity.find((a) => a.teamId === "2");
    assert.ok(bosA);
    assert.equal(bosA!.eventCount, 3);
    assert.equal(bosA!.bySourceTextCategory.trade, 1);
    assert.equal(bosA!.activeDays, 3);

    // Pulse
    const pulse = buildOffseasonPulse(index, {
      offseasonYear: 2026,
      now: new Date("2026-08-14T12:00:00Z"),
    });
    assert.equal(pulse.eventCount, 4);
    assert.equal(pulse.mostActiveTeam?.teamId, "2");
    assert.ok(pulse.latestEvent);

    // Events do not create ownership / unlock genealogy
    const ready = await isTransactionGenealogyUiReady({ force: true });
    assert.equal(ready, false);
    assert.equal(index.events.some((e) => (e as { assets?: unknown }).assets), false);
  });

  // Source preservation on real archive if present
  {
    clearTransactionEventIndexCache();
    const index = await buildTransactionEventIndex({ force: true });
    if (index.events.length) {
      const sample = index.events[0]!;
      assert.ok(sample.source.includes("espn"));
      assert.ok(sample.description);
      assert.ok(sample.teamId);
      // Never invent player ids on events
      assert.equal(
        (sample as { playerId?: string }).playerId,
        undefined
      );
    }
  }

  console.log("offseason-tracker checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
