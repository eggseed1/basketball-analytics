/**
 * Load versioned asset ledger from disk or bundled runtime snapshot.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AssetLedgerBundle, AssetLedgerLoadOptions } from "@/data/types/asset-ledger";
import type {
  CanonicalTransaction,
  OwnershipEdge,
} from "@/data/types/transaction-lineage";
import type {
  DraftAsset,
  DraftAssetType,
  DraftOwnershipStatus,
  PlayerContract,
  PlayerContractYear,
  ProtectionKind,
} from "@/data/types/front-office";
import type { TeamDraftPickAsset } from "@/data/types/team-assets";

export const ASSET_LEDGER_RELATIVE = path.join("data", "asset-ledger", "v1");

/** Wire shape written by sync-asset-ledger (may lag DraftAsset field names). */
type DraftPickWire = {
  assetId: string;
  draftYear: number;
  round?: number | null;
  originalFranchiseId?: string | null;
  currentOwnerFranchiseId?: string | null;
  currentHolderFranchiseId?: string | null;
  assetType?: string;
  ownershipStatus?: string;
  protectionKind?: string;
  protection?: string;
  protectionText?: string | null;
  swapFlag?: boolean;
  swap?: boolean;
  conveyance?: string | null;
  sourceTransactionId?: string | null;
  source?: string;
  lastVerified?: string;
};

function parseJsonl<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as T);
  }
  return out;
}

function asRound(value: unknown): 1 | 2 | null {
  return value === 1 || value === 2 ? value : null;
}

function normalizeDraftPick(raw: DraftPickWire): DraftAsset {
  const protection = String(
    raw.protection ?? raw.protectionKind ?? "UNKNOWN"
  ) as ProtectionKind;
  return {
    assetId: String(raw.assetId),
    draftYear: Number(raw.draftYear),
    round: asRound(raw.round),
    originalFranchiseId: raw.originalFranchiseId ?? null,
    currentHolderFranchiseId:
      raw.currentHolderFranchiseId ?? raw.currentOwnerFranchiseId ?? null,
    assetType: (raw.assetType ?? "OWN_PICK") as DraftAssetType,
    ownershipStatus: (raw.ownershipStatus ??
      "UNKNOWN") as DraftOwnershipStatus,
    protection,
    protectionText: raw.protectionText ?? null,
    swap: Boolean(raw.swap ?? raw.swapFlag),
    conveyance: raw.conveyance ?? null,
    sourceTransactionId: raw.sourceTransactionId ?? null,
    source: String(raw.source ?? "asset-ledger"),
    lastVerified: String(raw.lastVerified ?? ""),
  };
}

function toTeamDraftPickAssets(picks: DraftAsset[]): TeamDraftPickAsset[] {
  return picks
    .filter((p) => Boolean(p.currentHolderFranchiseId))
    .map((p) => ({
      kind: "draft_pick" as const,
      id: p.assetId,
      label: `${p.draftYear} round ${p.round ?? "?"} (${p.assetType})`,
      draftYear: p.draftYear,
      round: p.round ?? undefined,
      originalTeamId: p.originalFranchiseId ?? undefined,
      currentOwnerTeamId: p.currentHolderFranchiseId!,
      protected: p.protection !== "UNPROTECTED" && p.protection !== "UNKNOWN",
      protectionNotes:
        p.protectionText ??
        (p.protection && p.protection !== "UNKNOWN" ? p.protection : undefined),
      swap: p.swap,
      status:
        p.ownershipStatus === "CONVEYED"
          ? ("conveyed" as const)
          : p.ownershipStatus === "CURRENTLY_OWNED"
            ? ("owned" as const)
            : ("traded" as const),
    }));
}

let cached: AssetLedgerBundle | null = null;

export async function loadAssetLedger(
  options: AssetLedgerLoadOptions = {}
): Promise<AssetLedgerBundle | null> {
  if (cached && !options.cwd) return cached;

  if (options.preferBundled !== false) {
    try {
      const { getBundledAssetLedger } = await import(
        "@/data/runtime/asset-ledger-snapshot"
      );
      const bundled = getBundledAssetLedger();
      if (bundled?.manifest) {
        if (!options.cwd) cached = bundled;
        return bundled;
      }
    } catch {
      /* fall through to disk */
    }
  }

  const root = path.join(options.cwd ?? process.cwd(), ASSET_LEDGER_RELATIVE);
  try {
    const manifest = JSON.parse(
      await readFile(path.join(root, "manifest.json"), "utf8")
    );
    const structuredTransactions = parseJsonl<CanonicalTransaction>(
      await readFile(path.join(root, "structured-transactions.jsonl"), "utf8")
    );
    const ownershipEdges = parseJsonl<OwnershipEdge>(
      await readFile(path.join(root, "ownership-edges.jsonl"), "utf8")
    );
    const contracts = parseJsonl<PlayerContract>(
      await readFile(path.join(root, "contracts.jsonl"), "utf8")
    );
    const contractYears = parseJsonl<PlayerContractYear>(
      await readFile(path.join(root, "contract-years.jsonl"), "utf8")
    );
    const draftPicks = parseJsonl<DraftPickWire>(
      await readFile(path.join(root, "draft-picks.jsonl"), "utf8")
    ).map(normalizeDraftPick);

    const bundle: AssetLedgerBundle = {
      manifest,
      structuredTransactions,
      ownershipEdges,
      contracts,
      contractYears,
      draftPicks,
      tradeExceptions: [],
      teamDraftPickAssets: toTeamDraftPickAssets(draftPicks),
    };
    if (!options.cwd) cached = bundle;
    return bundle;
  } catch {
    return null;
  }
}

export function getContractYearsForPlayer(
  ledger: AssetLedgerBundle,
  playerId: string
): PlayerContractYear[] {
  const id = String(playerId).trim();
  return ledger.contractYears.filter((y) => y.playerId === id);
}

export function getTeamDraftPicksFromLedger(
  ledger: AssetLedgerBundle,
  teamId: string
): TeamDraftPickAsset[] {
  const id = String(teamId).trim();
  return ledger.teamDraftPickAssets.filter((p) => p.currentOwnerTeamId === id);
}

export function clearAssetLedgerCache(): void {
  cached = null;
}

export { normalizeDraftPick, toTeamDraftPickAssets };
export type { DraftPickWire };
