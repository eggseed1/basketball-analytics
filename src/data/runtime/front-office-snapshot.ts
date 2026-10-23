/**
 * Front-office team slices for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the ~264KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 */

type TeamSlice = {
  meta: Record<string, unknown>;
  cap: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  team: Record<string, unknown>;
};

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  source?: string;
  manifest?: Record<string, unknown>;
  teams?: Record<string, TeamSlice>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/front-office-snapshot.json";

let data: SnapshotFile | null | undefined;
let teams: Record<string, TeamSlice> = {};

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
      "front-office-snapshot.json"
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

function applySnapshot(file: SnapshotFile | null): boolean {
  data = file;
  teams = file?.teams ?? {};
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) applySnapshot(file);
}

export async function ensureFrontOffice(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return applySnapshot(fromDisk);
  return applySnapshot(await loadFromAssets());
}

export function runtimeFrontOfficeMeta() {
  tryPrimeFromDisk();
  return {
    generatedAt: data?.generatedAt ?? null,
    source: data?.source ?? null,
    teamCount: Object.keys(teams).length,
    manifest: data?.manifest ?? null,
  };
}

export function getRuntimeFrontOfficeSlice(
  franchiseId: string
): TeamSlice | null {
  tryPrimeFromDisk();
  const id = String(franchiseId ?? "").trim();
  if (!id) return null;
  return teams[id] ?? null;
}

export function getRuntimeFrontOfficeManifest() {
  tryPrimeFromDisk();
  return data?.manifest ?? null;
}

export function hasRuntimeFrontOffice(): boolean {
  tryPrimeFromDisk();
  return Object.keys(teams).length > 0;
}

export function listRuntimeFrontOfficeFranchiseIds(): string[] {
  tryPrimeFromDisk();
  return Object.keys(teams);
}
