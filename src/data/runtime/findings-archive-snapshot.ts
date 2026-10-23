/**
 * Saved findings archive for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the ~61KB JSON stays off the Worker.
 */
import type { FindingsArchive } from "@/lib/findings-archive";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/findings-archive.json";

let data: FindingsArchive | null | undefined;

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

function loadFromPublicDir(): FindingsArchive | null {
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
      "findings-archive.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as FindingsArchive;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<FindingsArchive | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as FindingsArchive;
  } catch {
    return null;
  }
}

function apply(file: FindingsArchive | null): boolean {
  data = file;
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensureFindingsArchive(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

export function getFindingsArchive(): FindingsArchive {
  tryPrimeFromDisk();
  return data ?? { updatedAt: null, findings: [] };
}
