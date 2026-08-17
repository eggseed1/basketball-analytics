/**
 * Reserved-test access guard (M16b). Research discipline, not security theater.
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { SplitBundle, SplitGame } from "./splits";

export class ReservedTestAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservedTestAccessError";
  }
}

export interface ReservedAccessRequest {
  allowReservedTest: boolean;
  experimentId?: string;
  modelFreezeId?: string;
  reason?: string;
  command?: string;
  gitCommit?: string;
  includePlayerLevelOutput?: boolean;
}

export async function logReservedTestAccess(
  entry: Record<string, unknown>
): Promise<void> {
  const dir = path.join(process.cwd(), "reports", "m16b");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "reserved_test_access_log.jsonl");
  await appendFile(file, JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + "\n");
}

/**
 * Load RESERVED_TEST games only when explicitly allowed and identified.
 */
export async function loadReservedTestGames(
  bundle: SplitBundle,
  req: ReservedAccessRequest
): Promise<{ games: SplitGame[]; playerLevelAllowed: boolean }> {
  if (!req.allowReservedTest) {
    throw new ReservedTestAccessError(
      "RESERVED_TEST access denied. Pass --allow-reserved-test with --experiment-id and --model-freeze."
    );
  }
  if (!req.experimentId || !req.modelFreezeId) {
    throw new ReservedTestAccessError(
      "RESERVED_TEST requires --experiment-id and --model-freeze."
    );
  }
  await logReservedTestAccess({
    event: "reserved_test_access",
    experimentId: req.experimentId,
    modelFreezeId: req.modelFreezeId,
    reason: req.reason ?? "unspecified",
    command: req.command ?? "",
    gitCommit: req.gitCommit ?? "",
    includePlayerLevelOutput: !!req.includePlayerLevelOutput,
    gameCount: bundle.reservedTest.length,
  });
  return {
    games: bundle.reservedTest,
    playerLevelAllowed: !!req.includePlayerLevelOutput,
  };
}

/** Default experiment surface: TRAIN + VALIDATION only. */
export function developmentGames(bundle: SplitBundle): {
  train: SplitGame[];
  validation: SplitGame[];
} {
  return { train: bundle.train, validation: bundle.validation };
}
