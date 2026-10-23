/**
 * Cloudflare-safe baked play-by-play (Game Lab + Possession Explorer).
 * Per-game payloads live in public/runtime/play-by-play/{gameId}.json. That
 * folder is gitignored and CI doesn't rebake it, so Workers fall back to the
 * GAME_ARCHIVE R2 bucket (play-by-play/{gameId}.json).
 * The ~20KB index lives under public/runtime (ASSETS) too.
 */
import type { RawPlayByPlayPayload } from "@/data/providers/nba/play-by-play-client";
import { readArchivedPlayByPlay } from "@/data/runtime/game-archive-store";

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

const INDEX_ASSET_PATH = "/runtime/pbp-index.json";

let meta: PbpIndex | null | undefined;
let bakedIds = new Set<string>();

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

function loadIndexFromPublicDir(): PbpIndex | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "pbp-index.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as PbpIndex;
  } catch {
    return null;
  }
}

async function loadIndexFromAssets(): Promise<PbpIndex | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${INDEX_ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as PbpIndex;
  } catch {
    return null;
  }
}

function applyIndex(file: PbpIndex | null): boolean {
  meta = file;
  bakedIds = new Set(Object.keys(file?.games ?? {}));
  return file != null;
}

function tryPrimeIndexFromDisk(): void {
  if (meta !== undefined) return;
  const file = loadIndexFromPublicDir();
  if (file) applyIndex(file);
}

export async function ensurePbpIndex(): Promise<boolean> {
  if (meta !== undefined) return meta != null;
  const fromDisk = loadIndexFromPublicDir();
  if (fromDisk) return applyIndex(fromDisk);
  return applyIndex(await loadIndexFromAssets());
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
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const p = path.join(
      process.cwd(),
      "public",
      "runtime",
      "play-by-play",
      `${gameId}.json`
    );
    if (!fs.existsSync(p)) return null;
    const json = JSON.parse(fs.readFileSync(p, "utf8")) as BakedPbpFile;
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
  tryPrimeIndexFromDisk();
  const id = String(gameId ?? "").trim();
  if (!id) return null;
  if (bakedIds.has(id)) return id;
  for (const [espnId, row] of Object.entries(meta?.games ?? {})) {
    if (row.nbaGameId === id) return espnId;
  }
  return null;
}

export function pbpIndexMeta() {
  tryPrimeIndexFromDisk();
  return {
    generatedAt: meta?.generatedAt ?? null,
    gameCount: meta?.gameCount ?? 0,
    verifyGameId: meta?.verifyGameId ?? "",
  };
}

export function isBakedPlayByPlayGame(gameId: string): boolean {
  return resolveBakedRouteId(gameId) !== null;
}

/** Resolve deploy-baked PBP for CF / local public assets. */
export async function loadBakedPlayByPlay(
  gameId: string
): Promise<RawPlayByPlayPayload | null> {
  await ensurePbpIndex();
  const routeId = resolveBakedRouteId(gameId);
  if (!routeId) return null;

  const local = loadFromPublicDir(routeId);
  if (local) return local;

  const asset = await fetchPbpAsset(routeId);
  if (asset) return asset;

  const archived = await readArchivedPlayByPlay<BakedPbpFile>(routeId);
  return archived ? toPayload(archived) : null;
}
