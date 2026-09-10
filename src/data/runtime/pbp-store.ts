/**
 * Cloudflare-safe baked play-by-play (Game Lab + Possession Explorer).
 * Per-game payloads live in public/runtime/play-by-play/{gameId}.json
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RawPlayByPlayPayload } from "@/data/providers/nba/play-by-play-client";

import index from "./pbp-index.json";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

type PbpIndex = {
  version: number;
  generatedAt: string | null;
  verifyGameId: string;
  gameCount: number;
  games: Record<
    string,
    { eventCount?: number; season?: string; nbaGameId?: string }
  >;
};

type BakedPbpFile = {
  gameId?: string;
  source?: "espn" | "cdn" | "stats" | "disk";
  nbaGameId?: string;
  raw?: unknown;
  eventCount?: number;
};

const meta = index as PbpIndex;
const bakedIds = new Set(Object.keys(meta.games ?? {}));

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => {
        env?: { ASSETS?: AssetsFetcher };
      };
    };
    const ctx = getCloudflareContext();
    return ctx?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function hasActions(raw: unknown): boolean {
  const root = raw as { game?: { actions?: unknown[] } };
  return Array.isArray(root.game?.actions) && root.game!.actions!.length > 0;
}

function toPayload(file: BakedPbpFile): RawPlayByPlayPayload | null {
  if (!file.raw || !hasActions(file.raw)) return null;
  const source: RawPlayByPlayPayload["source"] =
    file.source === "cdn" ||
    file.source === "stats" ||
    file.source === "espn"
      ? file.source
      : "disk";
  return {
    raw: file.raw,
    source,
    nbaGameId: file.nbaGameId,
  };
}

function loadFromPublicDir(gameId: string): RawPlayByPlayPayload | null {
  try {
    const p = path.join(
      process.cwd(),
      "public",
      "runtime",
      "play-by-play",
      `${gameId}.json`
    );
    if (!existsSync(p)) return null;
    const json = JSON.parse(readFileSync(p, "utf8")) as BakedPbpFile;
    return toPayload(json);
  } catch {
    return null;
  }
}

async function fetchPbpAsset(gameId: string): Promise<RawPlayByPlayPayload | null> {
  const pathname = `/runtime/play-by-play/${encodeURIComponent(gameId)}.json`;
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${pathname}`);
    if (!response.ok) return null;
    const json = (await response.json()) as BakedPbpFile;
    return toPayload(json);
  } catch {
    return null;
  }
}

function resolveBakedRouteId(gameId: string): string | null {
  const id = String(gameId ?? "").trim();
  if (!id) return null;
  if (bakedIds.has(id)) return id;
  for (const [espnId, row] of Object.entries(meta.games ?? {})) {
    if (row.nbaGameId === id) return espnId;
  }
  return null;
}

export function pbpIndexMeta() {
  return {
    generatedAt: meta.generatedAt,
    gameCount: meta.gameCount,
    verifyGameId: meta.verifyGameId,
  };
}

export function isBakedPlayByPlayGame(gameId: string): boolean {
  return resolveBakedRouteId(gameId) !== null;
}

/** Resolve deploy-baked PBP for CF / local public assets. */
export async function loadBakedPlayByPlay(
  gameId: string
): Promise<RawPlayByPlayPayload | null> {
  const routeId = resolveBakedRouteId(gameId);
  if (!routeId) return null;

  const local = loadFromPublicDir(routeId);
  if (local) return local;

  return fetchPbpAsset(routeId);
}
