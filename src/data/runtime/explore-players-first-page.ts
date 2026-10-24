/**
 * Baked default Explore Players first page for Cloudflare cold MISS.
 * Avoids season-tables + overlay work when the request matches the bake key.
 * Lives under public/runtime (ASSETS) so the ~35KB JSON stays off the Worker.
 */
import type { BasketballFilters } from "@/data/types";
import type { PlayerBoardRate, PlayerBoardView } from "@/lib/explore-players-display";
import type { PlayerSeasonSortKey } from "@/lib/player-season-sort";

export type ExplorePlayersFirstPageKey = {
  season: string;
  minimumMinutes: number;
  sortKey: PlayerSeasonSortKey;
  sortDir: "asc" | "desc";
  pageSize: number;
  rate: PlayerBoardRate;
  boardViews: PlayerBoardView[];
};

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  key: ExplorePlayersFirstPageKey;
  // Keep loose so this module never imports the board query (cycle risk).
  view: {
    rows: unknown[];
    totalCount: number;
    page: number;
    pageSize: number;
    pageCount: number;
    sortKey: PlayerSeasonSortKey;
    sortDir: "asc" | "desc";
    [key: string]: unknown;
  };
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/explore-players-first-page.json";

let data: SnapshotFile | null | undefined;

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

function loadFromPublicDir(): SnapshotFile | null {
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
      "explore-players-first-page.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SnapshotFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<SnapshotFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as SnapshotFile;
  } catch {
    return null;
  }
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) data = file;
}

export async function ensureExplorePlayersFirstPage(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    data = fromDisk;
    return true;
  }
  data = await loadFromAssets();
  return data != null;
}

export function explorePlayersFirstPageMeta() {
  tryPrimeFromDisk();
  return {
    generatedAt: data?.generatedAt ?? null,
    key: data?.key,
  };
}

export function getExplorePlayersFirstPageSnapshot(): {
  key: ExplorePlayersFirstPageKey;
  view: SnapshotFile["view"];
} | null {
  tryPrimeFromDisk();
  if (!data?.key?.season || !data?.view || !Array.isArray(data.view.rows)) {
    return null;
  }
  if (data.view.rows.length === 0) return null;
  return { key: data.key, view: data.view };
}

function sameViews(
  a: readonly PlayerBoardView[] | undefined,
  b: readonly PlayerBoardView[]
): boolean {
  const left = a?.length ? a : (["all"] as PlayerBoardView[]);
  if (left.length !== b.length) return false;
  return left.every((v, i) => v === b[i]);
}

function hasExtraFilters(filters: BasketballFilters): boolean {
  return (
    Boolean(filters.team) ||
    Boolean(filters.conference) ||
    Boolean(filters.draftClass) ||
    Boolean(filters.position) ||
    Boolean(filters.player) ||
    (filters.minimumGames != null && filters.minimumGames > 0)
  );
}

/**
 * True when the request is the default cold Explore first page this bake covers.
 */
export function matchesExplorePlayersFirstPage(options: {
  filters: BasketballFilters;
  sortKey?: PlayerSeasonSortKey;
  sortDir?: "asc" | "desc";
  rate?: PlayerBoardRate;
  page?: number;
  pageSize?: number;
  boardViews?: PlayerBoardView[];
}): boolean {
  const baked = getExplorePlayersFirstPageSnapshot();
  if (!baked) return false;
  const { key } = baked;
  if (hasExtraFilters(options.filters)) return false;
  if ((options.page ?? 1) !== 1) return false;
  if ((options.pageSize ?? key.pageSize) !== key.pageSize) return false;
  if ((options.filters.season ?? "") !== key.season) return false;
  const minutes = options.filters.minimumMinutes ?? key.minimumMinutes;
  if (minutes !== key.minimumMinutes) return false;
  // Default sort (no URL sort) or an explicit match to the baked sort.
  if (options.sortKey != null && options.sortKey !== key.sortKey) return false;
  if (
    options.sortKey != null &&
    options.sortDir != null &&
    options.sortDir !== key.sortDir
  ) {
    return false;
  }
  if ((options.rate ?? key.rate) !== key.rate) return false;
  if (!sameViews(options.boardViews, key.boardViews)) return false;
  return true;
}
