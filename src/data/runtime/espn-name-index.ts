/**
 * Bundled ESPN athlete id lookup by normalized player name.
 * Used when BRef peer boards lack live ESPN roster ids (Cloudflare).
 * Lives under public/runtime (ASSETS) so the ~22KB JSON stays off the Worker.
 */

type NameIndexFile = {
  version?: number;
  byName?: Record<string, string>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/espn-name-index.json";

let byName: Record<string, string> = {};
let byEspnId = new Map<string, string>();
let primed: boolean | undefined;

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

function loadFromPublicDir(): NameIndexFile | null {
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
      "espn-name-index.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as NameIndexFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<NameIndexFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as NameIndexFile;
  } catch {
    return null;
  }
}

function apply(file: NameIndexFile | null): boolean {
  primed = true;
  byName =
    file?.byName && typeof file.byName === "object" ? file.byName : {};
  byEspnId = new Map<string, string>();
  for (const [name, id] of Object.entries(byName)) {
    if (!byEspnId.has(id)) byEspnId.set(id, name);
  }
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (primed !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
  else primed = true;
}

export async function ensureEspnNameIndex(): Promise<boolean> {
  if (primed !== undefined) return Object.keys(byName).length > 0;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

export function normalizeEspnLookupName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKeys(name: string): string[] {
  const n = normalizeEspnLookupName(name);
  if (!n) return [];
  const stripped = n
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped && stripped !== n ? [n, stripped] : [n];
}

/** Resolve ESPN athlete id from a display name, if known. */
export function lookupEspnIdByPlayerName(
  playerName: string | null | undefined
): string | null {
  tryPrimeFromDisk();
  if (!playerName) return null;
  for (const key of nameKeys(playerName)) {
    const id = byName[key];
    if (id) return id;
  }
  return null;
}

/** Best-effort reverse lookup for bundled career matching. */
export function lookupPlayerNameByEspnId(
  espnId: string | null | undefined
): string | null {
  tryPrimeFromDisk();
  if (!espnId) return null;
  return byEspnId.get(String(espnId).trim()) ?? null;
}
