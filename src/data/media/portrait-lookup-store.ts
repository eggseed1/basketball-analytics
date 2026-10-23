/**
 * Approved portrait URL maps for Cloudflare.
 * Lives under public/runtime (ASSETS) so ~1.15MB of JSON stays off the
 * Worker isolate; Node reads the same files from disk.
 *
 * Keys: NBA PERSON_ID and ESPN athlete id → verified asset URL.
 */
export type PortraitLookupFile = {
  version: string;
  portraits: Record<string, string>;
  count: number;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const LOOKUP_PATH = "/runtime/portrait-lookup.json";
const FALLBACKS_PATH = "/runtime/portrait-fallbacks.json";
const LEGENDS_PATH = "/runtime/legend-portraits.json";

/** Basketball-Reference's headshots aren't ours to hotlink; those players show initials instead. */
const BLOCKED_PORTRAIT_HOST = /^https?:\/\/(?:www\.)?basketball-reference\.com\//;

let primed: boolean | undefined;
let portraits: Record<string, string> = {};
let fallbacks: Record<string, string> = {};
let legends: Record<string, string> = {};
let lookupVersion = "bundled";

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

function allowedPortraits(
  map: Record<string, string> | undefined
): Record<string, string> {
  if (!map || typeof map !== "object") return {};
  return Object.fromEntries(
    Object.entries(map).filter(
      ([, url]) => typeof url === "string" && !BLOCKED_PORTRAIT_HOST.test(url)
    )
  );
}

function readPublicJson(name: string): unknown | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(process.cwd(), "public", "runtime", name);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function fetchAssetJson(assetPath: string): Promise<unknown | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${assetPath}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function applyMaps(
  lookup: PortraitLookupFile | null,
  fallbackFile: { portraits?: Record<string, string> } | null,
  legendFile: { portraits?: Record<string, string> } | null
): boolean {
  portraits = allowedPortraits(lookup?.portraits);
  fallbacks = allowedPortraits(fallbackFile?.portraits);
  legends = allowedPortraits(legendFile?.portraits);
  lookupVersion = lookup?.version ?? "assets";
  primed = Object.keys(portraits).length > 0 || Object.keys(fallbacks).length > 0;
  return primed;
}

function tryPrimeFromDisk(): void {
  if (primed !== undefined) return;
  const lookup = readPublicJson("portrait-lookup.json") as PortraitLookupFile | null;
  const fallbackFile = readPublicJson("portrait-fallbacks.json") as {
    portraits?: Record<string, string>;
  } | null;
  const legendFile = readPublicJson("legend-portraits.json") as {
    portraits?: Record<string, string>;
  } | null;
  if (lookup || fallbackFile || legendFile) {
    applyMaps(lookup, fallbackFile, legendFile);
  }
}

export async function ensurePortraitMaps(): Promise<boolean> {
  if (primed !== undefined) return primed;
  const fromDiskLookup = readPublicJson(
    "portrait-lookup.json"
  ) as PortraitLookupFile | null;
  const fromDiskFallbacks = readPublicJson("portrait-fallbacks.json") as {
    portraits?: Record<string, string>;
  } | null;
  const fromDiskLegends = readPublicJson("legend-portraits.json") as {
    portraits?: Record<string, string>;
  } | null;
  if (fromDiskLookup || fromDiskFallbacks || fromDiskLegends) {
    return applyMaps(fromDiskLookup, fromDiskFallbacks, fromDiskLegends);
  }
  const [lookup, fallbackFile, legendFile] = await Promise.all([
    fetchAssetJson(LOOKUP_PATH) as Promise<PortraitLookupFile | null>,
    fetchAssetJson(FALLBACKS_PATH) as Promise<{
      portraits?: Record<string, string>;
    } | null>,
    fetchAssetJson(LEGENDS_PATH) as Promise<{
      portraits?: Record<string, string>;
    } | null>,
  ]);
  return applyMaps(lookup, fallbackFile, legendFile);
}

export function loadPortraitLookup(): PortraitLookupFile | null {
  tryPrimeFromDisk();
  if (!Object.keys(portraits).length) return null;
  return {
    version: lookupVersion,
    portraits,
    count: Object.keys(portraits).length,
  };
}

/** Clear memo (tests / rebuild). */
export function clearPortraitLookupCache() {
  primed = undefined;
  portraits = {};
  fallbacks = {};
  legends = {};
}

function lookupIn(
  map: Record<string, string>,
  ids: Array<string | null | undefined>
): string | null {
  for (const id of ids) {
    if (!id) continue;
    const key = String(id);
    const url = map[key] ?? map[`espn:${key}`] ?? null;
    if (url) return url;
  }
  return null;
}

/** Main registry only (what scripts/build-player-photo-fallbacks.ts fills around). */
export function lookupRegistryPortraitUrl(
  ...ids: Array<string | null | undefined>
): string | null {
  tryPrimeFromDisk();
  return lookupIn(portraits, ids);
}

export function lookupApprovedPortraitUrl(
  ...ids: Array<string | null | undefined>
): string | null {
  tryPrimeFromDisk();
  return (
    lookupIn(legends, ids) ??
    lookupIn(portraits, ids) ??
    lookupIn(fallbacks, ids)
  );
}

/** All legend + fallback portrait URLs (for /sources photo credits). */
export function allCreditPortraitUrls(): string[] {
  tryPrimeFromDisk();
  return [...Object.values(legends), ...Object.values(fallbacks)];
}
