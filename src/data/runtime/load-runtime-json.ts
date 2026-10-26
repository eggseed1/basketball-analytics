/**
 * Load large runtime JSON from Workers Static Assets (or local disk in Node/dev).
 *
 * Do not static-import these files into the Worker module graph — that inlines
 * them into the script upload and blows past Cloudflare's size limit.
 * record-book proved node:fs alone fails on Workers; ASSETS.fetch works.
 *
 * server-only: node:fs must never enter a client webpack graph.
 */
import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const cache = new Map<string, unknown>();

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ASSETS?: AssetsFetcher } };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function readLocalFile(fileName: string): unknown | null {
  const roots = [
    path.join(process.cwd(), "public", "runtime", fileName),
    path.join(process.cwd(), "src", "data", "runtime", fileName),
  ];
  for (const file of roots) {
    try {
      if (!existsSync(file)) continue;
      return JSON.parse(readFileSync(file, "utf8")) as unknown;
    } catch {
      /* try next root */
    }
  }
  return null;
}

async function readAssets(fileName: string): Promise<unknown | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(
      `https://assets.local/runtime/${fileName}`
    );
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Load a runtime JSON snapshot by filename (e.g. `game-snapshot.json`).
 * Order: public/runtime → src/data/runtime (Node/dev) → ASSETS (Cloudflare).
 */
export async function loadRuntimeJson<T>(fileName: string): Promise<T | null> {
  const key = String(fileName ?? "").trim();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) as T;

  const local = readLocalFile(key);
  if (local != null) {
    cache.set(key, local);
    return local as T;
  }

  const fromAssets = await readAssets(key);
  if (fromAssets != null) {
    cache.set(key, fromAssets);
    return fromAssets as T;
  }

  return null;
}
