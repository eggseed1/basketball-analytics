/**
 * Asset ledger smoke tests.
 * Run: npm run test:asset-ledger
 */
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";

import { loadAssetLedger } from "../src/data/asset-ledger/load-asset-ledger";
import { buildTransactionLineageIndex } from "../src/data/providers/transactions/transaction-lineage-index";
import { getTeamDraftPicksFromLedger } from "../src/data/asset-ledger/load-asset-ledger";

const ROOT = process.cwd();

async function main() {
  await access(path.join(ROOT, "data", "asset-ledger", "v1", "manifest.json"));

  const ledger = await loadAssetLedger({ cwd: ROOT, preferBundled: false });
  assert.ok(ledger, "ledger loads from disk");
  assert.ok(ledger!.structuredTransactions.length >= 3, "seed trades present");
  assert.ok(ledger!.ownershipEdges.length >= 10, "ownership edges emitted");
  assert.ok(ledger!.contracts.length > 100, "multi-year contracts built");
  assert.ok(ledger!.draftPicks.length >= 300, "baseline draft picks");

  const pierceTx = ledger!.structuredTransactions.find((t) =>
    t.id.includes("bos-bkn-2013")
  );
  assert.ok(pierceTx, "Pierce/Garnett trade present");
  assert.equal(pierceTx!.teamIds.length, 2, "multi-team transaction");
  assert.ok(
    pierceTx!.assets.some((a) => a.asset.playerId === "662"),
    "Paul Pierce asset id"
  );

  const index = await buildTransactionLineageIndex({
    cwd: ROOT,
    force: true,
  });
  assert.ok(
    index.assets.has("player:662"),
    "lineage index admits structured player assets"
  );
  assert.ok(
    index.ownershipEdges.some((e) => e.assetId === "player:662"),
    "Pierce ownership edge"
  );

  const bosPicks = getTeamDraftPicksFromLedger(ledger!, "2");
  assert.ok(bosPicks.length > 0, "BOS draft capital from ledger");

  console.log("asset-ledger tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
