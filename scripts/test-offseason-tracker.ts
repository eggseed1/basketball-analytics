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
  buildTransactionEventCoverage,
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
import type { NbaTransactionEvent } from "../src/data/types/transaction-event";

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
      assert.equal(sample.recordStatus, "source_event");
    }
  }

  // Related-event clusters + Boston / Philadelphia regression
  {
    const {
      buildRelatedTransactionEventClusters,
      buildOffseasonFeedItems,
    } = await import(
      "../src/data/providers/transactions/transaction-event-clusters"
    );

    const bosPhi: CanonicalTransaction[] = [
      tx({
        id: "espn-tx-06d295f8e48f2709",
        date: "2026-07-06",
        season: "2026-27",
        type: "trade",
        teamIds: ["2"],
        parties: [{ teamId: "2", teamAbbr: "BOS" }],
        description:
          "Re-signed G Ron Harper Jr. to a contract. Re-signed C Neemias Queta to a veteran extension. Acquired F Paul George from the Philadelphia 76ers in exchange for draft considerations. Signed C Mitchell Robinson to a contract. Signed G Mike Conley to a contract.",
      }),
      tx({
        id: "espn-tx-d088aa46c3eef731",
        date: "2026-07-06",
        season: "2026-27",
        type: "signing",
        teamIds: ["20"],
        parties: [{ teamId: "20", teamAbbr: "PHI" }],
        description:
          "Signed G Anfernee Simons and F Dean Wade to contracts. Acquired G Jaylen Brown from the Boston Celtics. Signed C Ariel Hukporti to a contract.",
      }),
      // Unrelated same-day signing — must NOT cluster
      tx({
        id: "espn-tx-unrelated-ny",
        date: "2026-07-06",
        season: "2026-27",
        type: "signing",
        teamIds: ["18"],
        parties: [{ teamId: "18", teamAbbr: "NY" }],
        description: "Signed C Andre Drummond to a contract.",
      }),
      // One-sided trade note with no reciprocal — stays source event
      tx({
        id: "espn-tx-mia-one-side",
        date: "2026-07-06",
        season: "2026-27",
        type: "trade",
        teamIds: ["14"],
        parties: [{ teamId: "14", teamAbbr: "MIA" }],
        description:
          "Acquired Fs Giannis Antetokounmpo and Bobby Portis from the Milwaukee Bucks in exchange for draft considerations.",
      }),
      tx({
        id: "espn-tx-mil-signing",
        date: "2026-07-06",
        season: "2026-27",
        type: "signing",
        teamIds: ["15"],
        parties: [{ teamId: "15", teamAbbr: "MIL" }],
        description: "Signed G Kam Jones to a two-way contract.",
      }),
    ];

    await withTempArchive(bosPhi, async (cwd) => {
      const index = await buildTransactionEventIndex({ force: true, cwd });
      assert.equal(index.events.length, 5);

      // Source event status + no invented assets
      for (const e of index.events) {
        assert.equal(e.recordStatus, "source_event");
        assert.equal((e as { assets?: unknown[] }).assets, undefined);
      }

      const bos = index.byId.get("espn-tx-06d295f8e48f2709")!;
      const phi = index.byId.get("espn-tx-d088aa46c3eef731")!;
      assert.ok(bos.description.includes("Paul George"));
      assert.ok(phi.description.includes("Jaylen Brown"));
      // No inference: BOS blurb must not invent Jaylen Brown
      assert.equal(bos.description.includes("Jaylen Brown"), false);

      const clusters = index.clusters.clusters;
      assert.equal(clusters.length, 1);
      const cluster = clusters[0]!;
      assert.equal(cluster.status, "related_event_cluster");
      assert.equal(cluster.structuredLedgerAvailable, false);
      assert.ok(cluster.eventIds.includes(bos.id));
      assert.ok(cluster.eventIds.includes(phi.id));
      assert.equal(cluster.eventIds.includes("espn-tx-unrelated-ny"), false);
      assert.equal(cluster.eventIds.includes("espn-tx-mia-one-side"), false);

      // Duplicate safety — rebuild yields same single cluster
      const again = buildRelatedTransactionEventClusters(index.events);
      assert.equal(again.clusters.length, 1);
      assert.equal(again.clusters[0]!.id, cluster.id);

      // Feed collapses to cluster + leftover source events
      const feed = buildOffseasonFeedItems(
        index.events,
        index.clusters,
        index.byId
      );
      const clusterItems = feed.filter(
        (i) => i.kind === "related_event_cluster"
      );
      assert.equal(clusterItems.length, 1);
      assert.equal(
        feed.filter((i) => i.kind === "source_event").length,
        3
      );

      // Search Jaylen Brown finds PHI side; feed still surfaces cluster siblings
      const hit = filterTransactionEvents(index, { q: "Jaylen Brown" });
      assert.equal(hit.length, 1);
      assert.equal(hit[0]!.id, phi.id);
      const feedFromSearch = buildOffseasonFeedItems(
        hit,
        index.clusters,
        index.byId
      );
      assert.equal(feedFromSearch[0]?.kind, "related_event_cluster");
      if (feedFromSearch[0]?.kind === "related_event_cluster") {
        assert.equal(feedFromSearch[0].events.length, 2);
      }

      const coverage = await buildTransactionEventCoverage(index);
      assert.equal(coverage.sourceEventCount, 5);
      assert.equal(coverage.relatedClusterCount, 1);
      assert.equal(coverage.structuredTransactionCount, 0);
      assert.equal(coverage.ownershipEdgeCount, 0);
      assert.equal(coverage.genealogyUiReady, false);
    });
  }

  console.log("conservative clustering: same day ≠ same transaction…");
  {
    const {
      buildRelatedTransactionEventClusters,
      buildOffseasonFeedItems,
      areReciprocalSameTransactionCandidates,
    } = await import(
      "../src/data/providers/transactions/transaction-event-clusters"
    );

    const day = "2026-07-01";
    const mk = (
      partial: Partial<NbaTransactionEvent> &
        Pick<NbaTransactionEvent, "id" | "teamId" | "description" | "sourceTextCategory">
    ): NbaTransactionEvent => ({
      date: day,
      season: "2026-27",
      teamAbbr: partial.teamAbbr,
      source: "espn-site-v2-transactions",
      recordStatus: "source_event",
      ...partial,
    });

    // Same team, same day: trade + signing + signing + waiver → 4 independent events
    const bosBusyDay = [
      mk({
        id: "bos-trade",
        teamId: "2",
        teamAbbr: "BOS",
        sourceTextCategory: "trade",
        description:
          "Acquired F Paul George from the Philadelphia 76ers in exchange for draft considerations.",
      }),
      mk({
        id: "bos-sign-a",
        teamId: "2",
        teamAbbr: "BOS",
        sourceTextCategory: "signing",
        description: "Signed G Mike Conley to a contract.",
      }),
      mk({
        id: "bos-sign-b",
        teamId: "2",
        teamAbbr: "BOS",
        sourceTextCategory: "signing",
        description: "Signed C Mitchell Robinson to a contract.",
      }),
      mk({
        id: "bos-waive",
        teamId: "2",
        teamAbbr: "BOS",
        sourceTextCategory: "waive",
        description: "Waived F Torrey Craig.",
      }),
    ];
    const busyClusters = buildRelatedTransactionEventClusters(bosBusyDay);
    assert.equal(busyClusters.clusters.length, 0);
    const busyFeed = buildOffseasonFeedItems(
      bosBusyDay,
      busyClusters,
      new Map(bosBusyDay.map((e) => [e.id, e]))
    );
    assert.equal(busyFeed.length, 4);
    assert.ok(busyFeed.every((i) => i.kind === "source_event"));

    // Same day, different types across teams — never merge on date alone
    const mixedTypes = [
      mk({
        id: "den-trade",
        teamId: "7",
        teamAbbr: "DEN",
        sourceTextCategory: "trade",
        description:
          "Acquired G Jamal Murray from the Oklahoma City Thunder in exchange for draft considerations.",
      }),
      mk({
        id: "okc-sign",
        teamId: "25",
        teamAbbr: "OKC",
        sourceTextCategory: "signing",
        description: "Signed G Free Agent to a contract.",
      }),
      mk({
        id: "okc-waive",
        teamId: "25",
        teamAbbr: "OKC",
        sourceTextCategory: "waive",
        description: "Waived F Bench Player.",
      }),
      mk({
        id: "okc-draft",
        teamId: "25",
        teamAbbr: "OKC",
        sourceTextCategory: "draft",
        description: "Selected F Prospect in the NBA Draft.",
      }),
    ];
    assert.equal(
      buildRelatedTransactionEventClusters(mixedTypes).clusters.length,
      0
    );

    // Reciprocal trade sides → one transaction event with 2 source records
    const bosTrade = mk({
      id: "bos-phi-a",
      teamId: "2",
      teamAbbr: "BOS",
      sourceTextCategory: "trade",
      description:
        "Acquired F Paul George from the Philadelphia 76ers in exchange for draft considerations.",
    });
    const phiTrade = mk({
      id: "bos-phi-b",
      teamId: "20",
      teamAbbr: "PHI",
      sourceTextCategory: "trade",
      description:
        "Acquired G Jaylen Brown from the Boston Celtics in exchange for F Paul George.",
    });
    assert.equal(
      areReciprocalSameTransactionCandidates(bosTrade, phiTrade),
      true
    );
    const reciprocal = buildRelatedTransactionEventClusters([
      bosTrade,
      phiTrade,
      ...bosBusyDay.slice(1), // same-day BOS signings stay out
    ]);
    assert.equal(reciprocal.clusters.length, 1);
    assert.equal(reciprocal.clusters[0]!.eventIds.length, 2);
    assert.ok(reciprocal.clusters[0]!.eventIds.includes("bos-phi-a"));
    assert.ok(reciprocal.clusters[0]!.eventIds.includes("bos-phi-b"));
    assert.equal(reciprocal.byEventId.has("bos-sign-a"), false);

    // Ambiguous: one BOS note reciprocally pairs with both PHI and MIA → under-group
    const bosHub = mk({
      id: "bos-hub",
      teamId: "2",
      teamAbbr: "BOS",
      sourceTextCategory: "trade",
      description:
        "Acquired F Paul George from the Philadelphia 76ers in exchange for draft considerations. Acquired F Jimmy Butler from the Miami Heat in exchange for draft considerations.",
    });
    const phiOnly = mk({
      id: "phi-side",
      teamId: "20",
      teamAbbr: "PHI",
      sourceTextCategory: "trade",
      description:
        "Acquired draft considerations from the Boston Celtics in exchange for F Paul George.",
    });
    const miaOnly = mk({
      id: "mia-side",
      teamId: "14",
      teamAbbr: "MIA",
      sourceTextCategory: "trade",
      description:
        "Acquired draft considerations from the Boston Celtics in exchange for F Jimmy Butler.",
    });
    assert.equal(
      areReciprocalSameTransactionCandidates(bosHub, phiOnly),
      true
    );
    assert.equal(
      areReciprocalSameTransactionCandidates(bosHub, miaOnly),
      true
    );
    const ambiguous = buildRelatedTransactionEventClusters([
      bosHub,
      phiOnly,
      miaOnly,
    ]);
    // BOS hub degree=2 → prefer under-grouping; no false mega-cluster
    assert.equal(ambiguous.clusters.length, 0);

    // One-sided trade note alone → no cluster
    assert.equal(
      buildRelatedTransactionEventClusters([bosTrade]).clusters.length,
      0
    );
  }

  console.log("trade-related presentation normalization…");
  {
    const {
      presentationForSourceEvent,
      presentationForRelatedCluster,
      presentationForOffseasonFeedItem,
      isTradeRelatedSourceCategory,
    } = await import("../src/lib/transaction-event-presentation");
    const { isTransactionGenealogyUiReady } = await import(
      "../src/data/queries/transaction-lineage"
    );

    const minCha: import("../src/data/types/transaction-event").NbaTransactionEvent =
      {
        id: "min-cha-1",
        date: "2025-07-01",
        season: "2025-26",
        teamId: "16",
        teamAbbr: "MIN",
        description:
          "Acquired Gs LaMelo Ball and Josh Green from Charlotte in exchange for Naz Reid and draft considerations.",
        sourceTextCategory: "trade",
        source: "espn-site-v2-transactions",
        recordStatus: "source_event",
      };
    const single = presentationForSourceEvent(minCha);
    assert.equal(single.kind, "trade_related_transaction");
    assert.equal(single.title, "Trade-related transaction");
    assert.equal(single.sourceCount, 1);
    assert.equal(single.hasSourceCluster, false);
    assert.equal(single.sourceCountLabel, "1 ESPN source event");

    const bos: typeof minCha = {
      ...minCha,
      id: "bos-1",
      teamId: "2",
      teamAbbr: "BOS",
      description: "Traded Guerschon Yabusele to Philadelphia.",
    };
    const phi: typeof minCha = {
      ...minCha,
      id: "phi-1",
      teamId: "20",
      teamAbbr: "PHI",
      description: "Acquired Guerschon Yabusele from Boston.",
    };
    const cluster = presentationForRelatedCluster([bos, phi]);
    assert.equal(cluster.kind, "trade_related_transaction");
    assert.equal(cluster.title, "Trade-related transaction");
    assert.equal(cluster.sourceCount, 2);
    assert.equal(cluster.hasSourceCluster, true);
    assert.equal(cluster.sourceCountLabel, "2 ESPN source events");

    const signing: typeof minCha = {
      ...minCha,
      id: "sign-1",
      sourceTextCategory: "signing",
      description: "Signed F Free Agent.",
    };
    const nonTrade = presentationForSourceEvent(signing);
    assert.equal(nonTrade.kind, "source_event");
    assert.equal(nonTrade.title, "Source event");
    assert.equal(isTradeRelatedSourceCategory("signing"), false);
    assert.equal(isTradeRelatedSourceCategory("trade"), true);

    const feedSingle = presentationForOffseasonFeedItem({
      kind: "source_event",
      event: minCha,
      status: "source_event",
    });
    assert.equal(feedSingle.kind, "trade_related_transaction");
    assert.equal(feedSingle.sourceCount, 1);

    const feedCluster = presentationForOffseasonFeedItem({
      kind: "related_event_cluster",
      cluster: {
        id: "c1",
        date: "2025-07-01",
        eventIds: [bos.id, phi.id],
        teamIds: ["2", "20"],
        evidence: ["same date", "reciprocal teams"],
        status: "related_event_cluster",
        structuredLedgerAvailable: false,
        methodologyVersion: "1.0",
      },
      events: [bos, phi],
      status: "related_event_cluster",
    });
    assert.equal(feedCluster.kind, "trade_related_transaction");
    assert.equal(feedCluster.sourceCount, 2);
    assert.equal(feedCluster.hasSourceCluster, true);

    assert.equal(await isTransactionGenealogyUiReady(), false);
  }

  console.log("offseason-tracker checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
