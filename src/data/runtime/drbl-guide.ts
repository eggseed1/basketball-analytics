/**
 * Numbers behind the DRBL guide at /learn/drbl, baked from the published
 * season artifacts and the outcome test by scripts/build-drbl-guide.ts.
 * Lives under public/runtime (ASSETS) so the ~34KB JSON stays off the Worker.
 */

export type DrblGuidePlayer = {
  id: string;
  name: string;
  teamId: string;
  possessions: number;
  drbl100: number;
  pbp100: number | null;
  offense: number | null;
  defense: number | null;
  war1: number | null;
};

/** [id, name, teamId, possessions, DRBL/100, WAR1] */
export type DrblGuideScatterPoint = readonly [string, string, string, number, number, number];

export type DrblCarryoverBucket = {
  label: string;
  pairs: number;
  pbpToNextPbp: number;
  blendToNextPbp: number;
  blendToNextBlend: number;
};

export type DrblOutcomeTest = {
  kind: "season-ahead" | "within-season";
  label: string;
  games: number;
  homeRmse: number;
  pbpRmse: number;
  blendRmse: number;
  pbpR2: number;
  blendR2: number;
};

export type DrblGuideSnapshot = {
  generatedAt: string;
  latestSeason: string;
  coverage: Array<{ season: string; games: number; players: number }>;
  distribution: {
    season: string;
    minPossessions: number;
    players: number;
    belowZero: number;
    weightedMean: number;
    weightedSd: number;
    bins: Array<{ from: number; to: number; players: number }>;
  };
  leaders: DrblGuidePlayer[];
  movers: { up: DrblGuidePlayer[]; down: DrblGuidePlayer[] };
  scatter: { season: string; minPossessions: number; points: DrblGuideScatterPoint[] };
  carryover: { minPossessions: number; seasons: string; buckets: DrblCarryoverBucket[] };
  outcome: { generatedAt: string; tests: DrblOutcomeTest[] };
  /** reports/contract-basis-study/latest.json: contract projections scored on next-season games (frozen). */
  contractBasis?: {
    generatedAt: string;
    seasons: string[];
    games: number;
    teamSeasons: number | null;
    drblBetterSeasons: number;
    rows: Array<{ key: "war1" | "mix" | "drbl"; r2: number; teamR: number | null }>;
  } | null;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/drbl-guide-snapshot.json";

let data: DrblGuideSnapshot | null | undefined;

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

function loadFromPublicDir(): DrblGuideSnapshot | null {
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
      "drbl-guide-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as DrblGuideSnapshot;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<DrblGuideSnapshot | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as DrblGuideSnapshot;
  } catch {
    return null;
  }
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) data = file;
}

export async function ensureDrblGuide(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    data = fromDisk;
    return true;
  }
  data = await loadFromAssets();
  return data != null;
}

const EMPTY: DrblGuideSnapshot = {
  generatedAt: "",
  latestSeason: "",
  coverage: [],
  distribution: {
    season: "",
    minPossessions: 0,
    players: 0,
    belowZero: 0,
    weightedMean: 0,
    weightedSd: 0,
    bins: [],
  },
  leaders: [],
  movers: { up: [], down: [] },
  scatter: { season: "", minPossessions: 0, points: [] },
  carryover: { minPossessions: 0, seasons: "", buckets: [] },
  outcome: { generatedAt: "", tests: [] },
  contractBasis: null,
};

export function drblGuide(): DrblGuideSnapshot {
  tryPrimeFromDisk();
  return data ?? EMPTY;
}
