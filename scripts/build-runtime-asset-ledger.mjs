/**
 * Bundle asset ledger for Cloudflare Workers.
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "data", "asset-ledger", "v1");
const OUT = path.join(ROOT, "src", "data", "runtime", "asset-ledger-snapshot.json");

function parseJsonl(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    out.push(JSON.parse(t));
  }
  return out;
}

function toTeamDraftPickAssets(picks) {
  return picks.map((p) => ({
    kind: "draft_pick",
    id: p.assetId,
    label: `${p.draftYear} round ${p.round ?? "?"} (${p.assetType})`,
    draftYear: p.draftYear,
    round: p.round ?? undefined,
    originalTeamId: p.originalFranchiseId,
    currentOwnerTeamId: p.currentOwnerFranchiseId,
    protected:
      p.protectionKind !== "UNPROTECTED" && p.protectionKind !== "UNKNOWN",
    protectionNotes:
      p.protectionKind && p.protectionKind !== "UNKNOWN"
        ? p.protectionKind
        : undefined,
    swap: p.swapFlag ?? false,
    status:
      p.ownershipStatus === "CONVEYED"
        ? "conveyed"
        : p.ownershipStatus === "CURRENTLY_OWNED"
          ? "owned"
          : "traded",
  }));
}

const manifest = JSON.parse(await fs.readFile(path.join(SRC, "manifest.json"), "utf8"));
const structuredTransactions = parseJsonl(
  await fs.readFile(path.join(SRC, "structured-transactions.jsonl"), "utf8")
);
const ownershipEdges = parseJsonl(
  await fs.readFile(path.join(SRC, "ownership-edges.jsonl"), "utf8")
);
const contracts = parseJsonl(await fs.readFile(path.join(SRC, "contracts.jsonl"), "utf8"));
const contractYears = parseJsonl(
  await fs.readFile(path.join(SRC, "contract-years.jsonl"), "utf8")
);
const draftPicks = parseJsonl(
  await fs.readFile(path.join(SRC, "draft-picks.jsonl"), "utf8")
);

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: "data/asset-ledger/v1",
  manifest,
  structuredTransactions,
  ownershipEdges,
  contracts,
  contractYears,
  draftPicks,
  teamDraftPickAssets: toTeamDraftPickAssets(draftPicks),
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
console.log(
  `[asset-ledger-snapshot] txs=${structuredTransactions.length} edges=${ownershipEdges.length} contracts=${contracts.length} → ${OUT}`
);
