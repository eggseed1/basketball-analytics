/**
 * Deterministic team-assets / player-link / cap-fit trust tests.
 * Run: npm run test:team-assets
 *
 * Never allows ESPN free text to invent players, picks, TPEs, or ownership.
 */
import assert from "node:assert/strict";

import {
  CAP_FIT_TIER_LABELS,
  EMPTY_TRADE_EXCEPTION_FIT,
  TEAM_ASSETS_METHODOLOGY_VERSION,
  TRADE_EXCEPTION_FIT_DISCLAIMER,
  type TeamAssetLedger,
} from "../src/data/types/team-assets";
import { getLearnConcept } from "../src/content/learn/registry";
import { getLearnTopic } from "../src/content/learn/topics";
import {
  canLinkTransactionPlayer,
  transactionPlayerHref,
} from "../src/lib/transaction-player-link";
import {
  playerPageHref,
  resolvePlayerDefaultSeason,
} from "../src/lib/player-season-resolve";
import {
  getTeamAssets,
  getTradeExceptionFits,
} from "../src/data/queries/team-assets";
import { getTransactionLineageCoverage } from "../src/data/queries/transaction-lineage";

function assertBlockedCategory(
  ledger: TeamAssetLedger,
  id: TeamAssetLedger["categories"][number]["id"]
) {
  const cat = ledger.categories.find((c) => c.id === id);
  assert.ok(cat, `missing category ${id}`);
  assert.equal(cat!.availability, "blocked_pending_structured_source");
  assert.equal(cat!.count, 0);
}

async function main() {
  // --- Player linking gate ---
  assert.equal(canLinkTransactionPlayer(undefined), false);
  assert.equal(canLinkTransactionPlayer(null), false);
  assert.equal(canLinkTransactionPlayer(""), false);
  assert.equal(canLinkTransactionPlayer("   "), false);
  assert.equal(canLinkTransactionPlayer("4065648"), true);

  assert.equal(transactionPlayerHref({ playerId: null }), null);
  assert.equal(transactionPlayerHref({ playerId: "" }), null);
  assert.equal(
    transactionPlayerHref({ playerId: "4065648", season: "2024-25" }),
    "/players/4065648?season=2024-25"
  );
  assert.equal(
    playerPageHref("4065648", "2023-24"),
    "/players/4065648?season=2023-24"
  );

  // Season resolver — newest-first list preferred; no forever-hardcoded season.
  assert.equal(
    resolvePlayerDefaultSeason([
      { season: "2024-25", gamesPlayed: 70 },
      { season: "2023-24", gamesPlayed: 74 },
    ]),
    "2024-25"
  );
  assert.equal(
    resolvePlayerDefaultSeason([
      { season: "2018-19", gamesPlayed: 10 },
    ]),
    "2018-19"
  );
  const fallback = resolvePlayerDefaultSeason([]);
  assert.ok(/^\d{4}-\d{2}$/.test(fallback));

  // --- Cap fit tiers stay distinct ---
  assert.equal(CAP_FIT_TIER_LABELS.salary_fit, "Salary fit");
  assert.ok(
    CAP_FIT_TIER_LABELS.legality_requires_validation.includes("validation")
  );
  assert.ok(TRADE_EXCEPTION_FIT_DISCLAIMER.includes("Salary fit only"));
  assert.ok(TRADE_EXCEPTION_FIT_DISCLAIMER.includes("does not treat fit"));

  const emptyFit = EMPTY_TRADE_EXCEPTION_FIT("tpe-1", "2", "no source");
  assert.equal(emptyFit.available, false);
  assert.equal(emptyFit.salaryFit.length, 0);
  assert.equal(emptyFit.potentiallyEligible.length, 0);
  assert.equal(emptyFit.legalityValidated.length, 0);

  // --- Learn concepts surfaced by Cap & assets UI ---
  for (const id of [
    "trade_exception",
    "salary_fit",
    "trade_legality",
    "draft_capital",
    "structured_transaction",
  ] as const) {
    const c = getLearnConcept(id);
    assert.ok(c, `missing Learn concept ${id}`);
    assert.equal(c!.showTooltip, true);
  }
  assert.ok(getLearnTopic("trade-exception"));
  assert.ok(getLearnTopic("salary-fit-vs-legality"));

  // --- Production ledger: players may exist; structured categories blocked ---
  const ledger = await getTeamAssets({
    teamId: "2",
    abbreviation: "BOS",
    season: "2024-25",
    minimumGames: 10,
  });

  assert.equal(ledger.methodologyVersion, TEAM_ASSETS_METHODOLOGY_VERSION);
  assert.equal(ledger.structuredLedgerAvailable, false);
  assert.equal(ledger.genealogyUiReady, false);
  assert.equal(ledger.draftCapital.length, 0);
  assert.equal(ledger.tradeExceptions.length, 0);
  assert.equal(ledger.draftRights.length, 0);

  assertBlockedCategory(ledger, "draft_capital");
  assertBlockedCategory(ledger, "trade_exceptions");
  assertBlockedCategory(ledger, "draft_rights");
  assertBlockedCategory(ledger, "other");

  // Every player asset must have a canonical id + href — never free-text-only.
  for (const p of ledger.players) {
    assert.ok(p.playerId.trim().length > 0);
    assert.ok(p.href.startsWith(`/players/${encodeURIComponent(p.playerId)}`));
    assert.ok(canLinkTransactionPlayer(p.playerId));
  }

  const fits = await getTradeExceptionFits({
    teamId: "2",
    exceptionId: "synthetic-tpe",
  });
  assert.equal(fits.available, false);
  assert.equal(fits.salaryFit.length, 0);
  assert.equal(fits.legalityValidated.length, 0);

  // --- Trust: structured ledger still empty; genealogy blocked ---
  const coverage = await getTransactionLineageCoverage();
  assert.equal(coverage.ownershipEdgeCount, 0);
  assert.equal(coverage.assetCount, 0);
  assert.equal(coverage.draftPickAssetCount, 0);
  assert.equal(coverage.genealogyUiReady, false);

  // Free-text ESPN events must not appear as fabricated asset rows.
  assert.equal(ledger.draftCapital.length, 0);
  assert.equal(ledger.tradeExceptions.length, 0);
  assert.equal(ledger.draftRights.length, 0);
  assert.equal(
    ledger.players.some((p) => !p.playerId),
    false
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        playerAssets: ledger.players.length,
        draftCapital: ledger.draftCapital.length,
        tradeExceptions: ledger.tradeExceptions.length,
        draftRights: ledger.draftRights.length,
        sourceEventLikeTransactionCount: coverage.transactionCount,
        ownershipEdgeCount: coverage.ownershipEdgeCount,
        structuredAssetCount: coverage.assetCount,
        genealogyUiReady: coverage.genealogyUiReady,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
