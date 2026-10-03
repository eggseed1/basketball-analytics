/**
 * Per-player daily sentiment history for the game-by-game view.
 * Baked by sentiment:build into public/runtime/sentiment-history/{id}.json
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { SentimentHistoryFile } from "@/sentiment/game-reaction";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => {
        env?: { ASSETS?: AssetsFetcher };
      };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function normalize(json: unknown): SentimentHistoryFile | null {
  const file = json as Partial<SentimentHistoryFile> | null;
  if (!file || !Array.isArray(file.fan) || !Array.isArray(file.media)) return null;
  return {
    playerIds: Array.isArray(file.playerIds) ? file.playerIds : [],
    builtAt: file.builtAt ?? "",
    fan: file.fan,
    media: file.media,
  };
}

function loadFromPublicDir(playerId: string): SentimentHistoryFile | null {
  try {
    const p = path.join(
      process.cwd(),
      "public",
      "runtime",
      "sentiment-history",
      `${playerId}.json`
    );
    if (!existsSync(p)) return null;
    return normalize(JSON.parse(readFileSync(p, "utf8")));
  } catch {
    return null;
  }
}

async function fetchHistoryAsset(playerId: string): Promise<SentimentHistoryFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(
      `https://assets.local/runtime/sentiment-history/${encodeURIComponent(playerId)}.json`
    );
    if (!response.ok) return null;
    return normalize(await response.json());
  } catch {
    return null;
  }
}

export async function resolvePlayerSentimentHistory(
  playerIds: Array<string | null | undefined>
): Promise<SentimentHistoryFile | null> {
  const ids = [...new Set(playerIds.filter((id): id is string => Boolean(id?.trim())))];
  for (const id of ids) {
    const local = loadFromPublicDir(id);
    if (local) return local;
  }
  for (const id of ids) {
    const asset = await fetchHistoryAsset(id);
    if (asset) return asset;
  }
  return null;
}
