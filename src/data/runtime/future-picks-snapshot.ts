/**
 * Future first- and second-round picks per team, with Spotrac's terms.
 * Written by scripts/import-spotrac-future-picks.mjs from a saved page read.
 * Lives under public/runtime (ASSETS) so the ~56KB JSON stays off the Worker.
 */

export type FuturePick = {
  year: number;
  round: 1 | 2;
  /** Team whose pick it originally is. */
  origin: string;
  /** Team holding it now (abbreviation). */
  holder: string;
  /** The other team in a swap. */
  swapWith?: string;
  /** Changed hands at least once. */
  moved?: true;
  /** Can't be traded while the team is over the second apron. */
  frozen?: true;
  terms?: string;
};

type SnapshotFile = {
  sourceUrl?: string;
  retrievedAt?: string;
  teams?: Record<string, { abbr: string; picks: FuturePick[] }>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/future-picks-snapshot.json";

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
      "future-picks-snapshot.json"
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

export async function ensureFuturePicks(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    data = fromDisk;
    return true;
  }
  data = await loadFromAssets();
  return data != null;
}

/** The draft runs in late June, so from July on that year's picks are used. */
function nextDraftYear(now: Date): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export function bundledFuturePicks(teamId: string, now = new Date()): {
  abbr: string;
  picks: FuturePick[];
  retrievedAt: string | null;
  sourceUrl: string | null;
} | null {
  tryPrimeFromDisk();
  const team = data?.teams?.[teamId];
  if (!team) return null;
  const firstYear = nextDraftYear(now);
  return {
    ...team,
    picks: team.picks.filter((pick) => pick.year >= firstYear),
    retrievedAt: data?.retrievedAt ?? null,
    sourceUrl: data?.sourceUrl ?? null,
  };
}
