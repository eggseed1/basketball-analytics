/**
 * Deploy-baked draft year map for explore board draftClass filters on Cloudflare.
 * Keys: NBA PERSON_ID, ESPN athlete id, and espn:{id}.
 * Lives under public/runtime (ASSETS) so the ~126KB JSON stays off the Worker.
 */

type DraftYearFile = {
  version?: number;
  generatedAt?: string;
  count?: number;
  years?: Record<string, number>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/draft-year-snapshot.json";

let data: DraftYearFile | null | undefined;
let yearsRecord: Record<string, number> = {};
let cachedMap: Map<string, number> | null = null;

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

function loadFromPublicDir(): DraftYearFile | null {
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
      "draft-year-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as DraftYearFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<DraftYearFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as DraftYearFile;
  } catch {
    return null;
  }
}

function apply(file: DraftYearFile | null): boolean {
  data = file;
  yearsRecord =
    file?.years && typeof file.years === "object" ? file.years : {};
  cachedMap = null;
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensureDraftYearSnapshot(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

export function getBundledDraftYearMap(): Map<string, number> {
  tryPrimeFromDisk();
  if (cachedMap) return cachedMap;
  const map = new Map<string, number>();
  for (const [id, year] of Object.entries(yearsRecord ?? {})) {
    const y = Number(year);
    if (!id || !Number.isFinite(y) || y < 1947) continue;
    map.set(String(id), y);
  }
  cachedMap = map;
  return map;
}

export function getBundledDraftYear(
  ...ids: Array<string | null | undefined>
): number | undefined {
  const map = getBundledDraftYearMap();
  for (const id of ids) {
    const key = String(id ?? "").trim();
    if (!key) continue;
    const hit = map.get(key) ?? map.get(`espn:${key}`);
    if (hit != null) return hit;
  }
  return undefined;
}

export function bundledDraftYearMeta() {
  tryPrimeFromDisk();
  return {
    version: data?.version ?? 0,
    generatedAt: data?.generatedAt ?? null,
    count: data?.count ?? Object.keys(yearsRecord).length,
  };
}
