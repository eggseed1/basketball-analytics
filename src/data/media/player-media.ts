/**
 * Server-side player media registry loader.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  BLOCKED_NBA_LATEST_PLAYER_IDS,
  validatePlayerMedia,
  type MediaValidationResult,
} from "@/lib/player-media-resolve";

export const PLAYER_MEDIA_VERSION = "drbl-player-media-v1";

export type PlayerMediaRecord = {
  playerId: string;
  mediaId: string;
  source: string;
  sourcePlayerId: string;
  mediaType: string;
  roleContext: "PLAYER" | "COACH" | "STAFF" | "UNKNOWN";
  sourceUrl: string;
  identityVerified: boolean;
  roleVerified: boolean;
  productUseStatus: "APPROVED" | "QUARANTINED" | "MISSING";
  qualityStatus: string;
  isCanonicalCareerPortrait: boolean;
  quarantineReason?: string;
};

type MediaRegistryFile = {
  version: string;
  byPlayerId: Record<string, PlayerMediaRecord>;
  blockedNbaLatestPlayerIds?: string[];
  coachRoleBlockedPlayerIds?: string[];
};

let cache: MediaRegistryFile | null | undefined;

function registryPath() {
  return path.join(
    process.cwd(),
    "data",
    "drbl",
    "player-media",
    PLAYER_MEDIA_VERSION,
    "registry.json"
  );
}

export function loadPlayerMediaRegistry(): MediaRegistryFile | null {
  if (cache !== undefined) return cache;
  const p = registryPath();
  if (!existsSync(p)) {
    cache = null;
    return null;
  }
  try {
    cache = JSON.parse(readFileSync(p, "utf8")) as MediaRegistryFile;
    return cache;
  } catch {
    cache = null;
    return null;
  }
}

export function getApprovedPlayerPortraitUrl(
  playerId: string
): string | null {
  const reg = loadPlayerMediaRegistry();
  const rec = reg?.byPlayerId[playerId];
  if (!rec) return null;
  const v = validatePlayerMedia({
    canonicalPlayerId: playerId,
    media: rec,
  });
  if (v === "VALID_EXACT_ERA" || v === "VALID_PLAYER_FALLBACK") {
    return rec.sourceUrl || null;
  }
  return null;
}

export { validatePlayerMedia, BLOCKED_NBA_LATEST_PLAYER_IDS };
export type { MediaValidationResult };
