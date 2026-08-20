/**
 * Deterministic transaction lineage checks.
 * Production may load the ESPN free-text archive; genealogy UI must stay blocked.
 * Graph logic is validated with SYNTHETIC fixtures only.
 * Run: npx tsx scripts/test-transaction-lineage.ts
 */
import assert from "node:assert/strict";

import {
  TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
  type CanonicalAsset,
  type CanonicalTransaction,
  type OwnershipEdge,
} from "../src/data/types/transaction-lineage";
import {
  buildTransactionLineageCoverageReport,
  buildTransactionLineageIndex,
  traceAssetBackward,
  traceAssetForward,
} from "../src/data/providers/transactions/transaction-lineage-index";
import {
  getPlayerAcquisitionLineage,
  getTransactionLineageCoverage,
  isTransactionGenealogyUiReady,
  traceAssetLineageBackward,
} from "../src/data/queries/transaction-lineage";

function pickAsset(partial: Partial<CanonicalAsset> & Pick<CanonicalAsset, "id" | "type" | "label">): CanonicalAsset {
  return {
    methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
    ...partial,
  };
}

function tx(
  partial: Partial<CanonicalTransaction> &
    Pick<CanonicalTransaction, "id" | "date" | "type" | "teamIds" | "assets">
): CanonicalTransaction {
  return {
    season: "2016-17",
    status: "real",
    parties: [],
    methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
    source: "test-fixture",
    sourceVersion: "synthetic",
    ...partial,
  };
}

function edge(
  partial: Omit<OwnershipEdge, "confidence" | "source"> &
    Partial<Pick<OwnershipEdge, "confidence" | "source">>
): OwnershipEdge {
  return {
    confidence: "high",
    source: "test-fixture",
    ...partial,
  };
}

const pick = pickAsset({
  id: "pick:2017:1:bos",
  type: "draft_pick",
  label: "2017 1st (BOS original)",
  draftPick: {
    draftYear: 2017,
    round: 1,
    originalTeamId: "bos",
    currentOwnerTeamId: "bos",
  },
});

const player = pickAsset({
  id: "player:espn-tatum",
  type: "player",
  label: "Test Player",
  playerId: "espn-tatum",
  playerName: "Test Player",
});

const fixtures = {
  transactions: [
    tx({
      id: "tx-create-pick",
      date: "2016-06-01",
      type: "other",
      teamIds: ["bos"],
      assets: [{ asset: pick, direction: "incoming", teamId: "bos" }],
    }),
    tx({
      id: "tx-trade-1",
      date: "2017-06-20",
      season: "2016-17",
      type: "trade",
      teamIds: ["bos", "bkn"],
      assets: [
        { asset: pick, direction: "outgoing", teamId: "bkn" },
        { asset: pick, direction: "incoming", teamId: "bos" },
      ],
    }),
    tx({
      id: "tx-draft",
      date: "2017-06-22",
      season: "2016-17",
      type: "draft",
      teamIds: ["bos"],
      assets: [
        { asset: pick, direction: "outgoing", teamId: "bos" },
        { asset: player, direction: "incoming", teamId: "bos" },
      ],
    }),
    // Multi-team trade fixture (3 teams) - structure only
    tx({
      id: "tx-three-team",
      date: "2018-01-15",
      season: "2017-18",
      type: "trade",
      teamIds: ["bos", "cle", "sac"],
      assets: [
        {
          asset: pickAsset({
            id: "player:x",
            type: "player",
            label: "Player X",
            playerId: "x",
          }),
          direction: "involved",
          teamId: "cle",
        },
      ],
    }),
  ],
  ownershipEdges: [
    edge({
      id: "oe-1",
      assetId: pick.id,
      fromTeamId: null,
      toTeamId: "bkn",
      transactionId: "tx-create-pick",
      date: "2016-06-01",
      season: "2015-16",
      notes: "Synthetic origin",
    }),
    edge({
      id: "oe-2",
      assetId: pick.id,
      fromTeamId: "bkn",
      toTeamId: "bos",
      transactionId: "tx-trade-1",
      date: "2017-06-20",
      season: "2016-17",
    }),
    edge({
      id: "oe-3",
      assetId: pick.id,
      fromTeamId: "bos",
      toTeamId: null,
      transactionId: "tx-draft",
      date: "2017-06-22",
      season: "2016-17",
      notes: "Converted / conveyed at draft (synthetic)",
    }),
  ],
};

async function main() {
  // --- Production: genealogy UI stays blocked (fixtures never unlock it) ---
  {
    const ready = await isTransactionGenealogyUiReady({ force: true });
    assert.equal(ready, false);
    const coverage = await getTransactionLineageCoverage({ force: true });
    assert.equal(coverage.genealogyUiReady, false);
    // Ownership edges / structured assets are required for UI - ESPN blurbs alone do not unlock.
    assert.equal(coverage.ownershipEdgeCount, 0);
    assert.equal(coverage.draftPickAssetCount, 0);
    assert.ok(coverage.readiness.failures.length > 0);
  }

  // --- Empty backward trace is honest ---
  {
    const path = await traceAssetLineageBackward("missing", { force: true });
    assert.equal(path.nodes.length, 0);
    assert.ok(path.truncatedReason?.includes("unavailable"));
  }

  // --- ESPN free-text normalizer (no invented player assets) ---
  {
    const { classifyEspnTransactionDescription, normalizeEspnTransactionRow, canonicalSeasonFromIsoDate } =
      await import("../src/data/transformers/espn-transactions");
    assert.equal(canonicalSeasonFromIsoDate("2017-06-22"), "2016-17");
    assert.equal(canonicalSeasonFromIsoDate("2017-07-01"), "2017-18");
    assert.equal(
      classifyEspnTransactionDescription(
        "Traded F Jalen McDaniels and draft considerations to San Antonio in exchange for draft considerations."
      ),
      "trade"
    );
    assert.equal(classifyEspnTransactionDescription("Waived G Ethan Thompson."), "waive");
    assert.equal(
      classifyEspnTransactionDescription("Signed C Mo Bamba to a rest-of-season contract."),
      "signing"
    );
    const { transaction, issues } = normalizeEspnTransactionRow(
      {
        date: "2024-10-02T07:00Z",
        description:
          "Traded F Jalen McDaniels and draft considerations to San Antonio in exchange for draft considerations.",
        team: { id: "2", abbreviation: "BOS" },
      },
      { espnCalendarYear: 2024, ingestedAt: "2026-01-01T00:00:00.000Z" }
    );
    assert.equal(issues.length, 0);
    assert.ok(transaction);
    assert.equal(transaction!.type, "trade");
    assert.equal(transaction!.teamIds[0], "2");
    assert.equal(transaction!.assets.length, 0);
    assert.equal(transaction!.status, "real");
    assert.ok(transaction!.provenance?.source);

    const bad = normalizeEspnTransactionRow(
      { date: "", description: "", team: {} },
      { espnCalendarYear: 2024, ingestedAt: "2026-01-01T00:00:00.000Z" }
    );
    assert.equal(bad.transaction, null);
    assert.ok(bad.issues.includes("missing_or_malformed_date"));
  }

  // --- Fixture: draft pick identity ---
  {
    const index = await buildTransactionLineageIndex({ fixtures });
    const asset = index.assets.get(pick.id);
    assert.ok(asset);
    assert.equal(asset!.draftPick?.draftYear, 2017);
    assert.equal(asset!.draftPick?.round, 1);
    assert.equal(asset!.draftPick?.originalTeamId, "bos");
  }

  // --- Fixture: ownership transfer chain forward ---
  {
    const index = await buildTransactionLineageIndex({ fixtures });
    const path = traceAssetForward(index, pick.id);
    assert.ok(path.nodes.length >= 3);
    assert.ok(path.edges.length >= 1);
    assert.ok(path.nodes.some((n) => n.kind === "transaction"));
  }

  // --- Fixture: backward lineage ---
  {
    const index = await buildTransactionLineageIndex({ fixtures });
    const path = traceAssetBackward(index, pick.id);
    assert.ok(path.nodes[0]?.assetId === pick.id);
    assert.ok(path.nodes.some((n) => n.transactionId === "tx-trade-1"));
  }

  // --- Multi-team transaction preserved ---
  {
    const index = await buildTransactionLineageIndex({ fixtures });
    const three = index.transactions.find((t) => t.id === "tx-three-team");
    assert.ok(three);
    assert.equal(three!.teamIds.length, 3);
  }

  // --- Duplicate transaction ids skipped ---
  {
    const dup = {
      transactions: [...fixtures.transactions, fixtures.transactions[1]!],
      ownershipEdges: fixtures.ownershipEdges,
    };
    const index = await buildTransactionLineageIndex({ fixtures: dup });
    assert.equal(index.duplicateTransactionIds, 1);
  }

  // --- Broken edge (unknown asset) counted ---
  {
    const broken = {
      transactions: fixtures.transactions,
      ownershipEdges: [
        ...fixtures.ownershipEdges,
        edge({
          id: "oe-broken",
          assetId: "no-such-asset",
          fromTeamId: "bos",
          toTeamId: "cle",
          transactionId: "tx-trade-1",
          date: "2017-06-21",
          season: "2016-17",
        }),
      ],
    };
    const index = await buildTransactionLineageIndex({ fixtures: broken });
    assert.ok(index.brokenEdgeCount >= 1);
  }

  // --- Player acquisition unavailable without matching asset ---
  {
    const result = await getPlayerAcquisitionLineage("unknown-player", {
      fixtures,
    });
    assert.equal(result.path, null);
    assert.ok(result.unavailableReason);
  }

  // --- Player acquisition when asset exists ---
  {
    const withPlayerEdge = {
      transactions: [
        ...fixtures.transactions,
        tx({
          id: "tx-sign",
          date: "2019-07-01",
          season: "2019-20",
          type: "signing",
          teamIds: ["bos"],
          assets: [{ asset: player, direction: "incoming", teamId: "bos" }],
        }),
      ],
      ownershipEdges: [
        ...fixtures.ownershipEdges,
        edge({
          id: "oe-player",
          assetId: player.id,
          fromTeamId: null,
          toTeamId: "bos",
          transactionId: "tx-sign",
          date: "2019-07-01",
          season: "2019-20",
        }),
      ],
    };
    const result = await getPlayerAcquisitionLineage("espn-tatum", {
      fixtures: withPlayerEdge,
    });
    assert.ok(result.path);
    assert.equal(result.unavailableReason, null);
  }

  // --- Fixtures exercise the graph; UI gate stays false for synthetic data ---
  {
    const index = await buildTransactionLineageIndex({ fixtures });
    const report = buildTransactionLineageCoverageReport(index);
    assert.equal(report.genealogyUiReady, false);
    assert.ok(report.transactionCount >= 3);
    assert.ok(report.draftPickAssetCount >= 1);
    assert.ok(report.ownershipEdgeCount >= 1);
  }

  // --- Missing lineage on asset with no edges ---
  {
    const lonely = pickAsset({
      id: "pick:lonely",
      type: "draft_pick",
      label: "Lonely pick",
      draftPick: { draftYear: 2020, round: 2 },
    });
    const index = await buildTransactionLineageIndex({
      fixtures: {
        transactions: [
          tx({
            id: "tx-lonely",
            date: "2020-01-01",
            type: "other",
            teamIds: ["bos"],
            assets: [{ asset: lonely, direction: "involved" }],
          }),
        ],
        ownershipEdges: [],
      },
    });
    const path = traceAssetBackward(index, lonely.id);
    assert.ok(path.truncatedReason?.includes("no ownership"));
  }

  console.log("transaction-lineage checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
