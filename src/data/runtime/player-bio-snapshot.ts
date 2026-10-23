/**
 * Deploy-baked player vitals for Cloudflare (height, weight, DOB/age, draft, college).
 * Lives under public/runtime (ASSETS) so the ~240KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 */
import type { Player } from "@/data/types";

type CompactBio = {
  fn?: string;
  p?: string;
  bd?: string;
  bp?: string;
  h?: number;
  w?: number;
  c?: string;
  d?: string;
  j?: string;
};

type BioSnapshotFile = {
  version?: number;
  generatedAt?: string;
  playerCount?: number;
  players?: Record<string, CompactBio>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/player-bio-snapshot.json";

let data: BioSnapshotFile | null | undefined;
let players: Record<string, CompactBio> = {};

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

function loadFromPublicDir(): BioSnapshotFile | null {
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
      "player-bio-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as BioSnapshotFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<BioSnapshotFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as BioSnapshotFile;
  } catch {
    return null;
  }
}

function apply(file: BioSnapshotFile | null): boolean {
  data = file;
  players =
    file?.players && typeof file.players === "object" ? file.players : {};
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensurePlayerBio(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

function expand(compact: CompactBio | null | undefined): Player | null {
  if (!compact) return null;
  const id = "bundled";
  return {
    id,
    fullName: compact.fn ?? id,
    firstName: compact.fn?.split(" ")[0] ?? compact.fn ?? id,
    lastName: compact.fn?.split(" ").slice(1).join(" ") ?? "",
    position: compact.p as Player["position"],
    birthDate: compact.bd,
    birthPlace: compact.bp,
    heightInches: compact.h,
    weightLbs: compact.w,
    college: compact.c,
    draftInfo: compact.d,
    jersey: compact.j,
  };
}

function lookup(id: string | null | undefined): Player | null {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return expand(players[key]);
}

export function bundledHeightInches(
  playerId: string | null | undefined
): number | null {
  tryPrimeFromDisk();
  const key = String(playerId ?? "").trim();
  const height = key ? players[key]?.h : undefined;
  return height != null && Number.isFinite(height) && height > 0 ? height : null;
}

export function getBundledPlayerBio(
  playerId: string,
  relatedIds: Array<string | null | undefined> = []
): Player | null {
  tryPrimeFromDisk();
  const candidates = [playerId, ...relatedIds]
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  for (const id of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    const hit = lookup(id);
    if (hit) {
      return { ...hit, id: playerId };
    }
  }
  return null;
}

/** Name and draft line for every baked bio (keys repeat across ESPN/NBA/BRef ids). */
export function bundledPlayerDraftLines(): Array<{
  id: string;
  name: string;
  draft: string;
}> {
  tryPrimeFromDisk();
  return Object.entries(players)
    .filter(([, bio]) => bio.fn && bio.d)
    .map(([id, bio]) => ({ id, name: bio.fn!, draft: bio.d! }));
}

/** Every baked bio with its key, for joining rows that only carry a name. */
export function bundledPlayerBioEntries(): Array<{
  id: string;
  name: string;
  position?: string;
  birthDate?: string;
}> {
  tryPrimeFromDisk();
  return Object.entries(players)
    .filter(([, bio]) => bio.fn)
    .map(([id, bio]) => ({
      id,
      name: bio.fn!,
      position: bio.p,
      birthDate: bio.bd,
    }));
}

export function bundledPlayerBioMeta() {
  tryPrimeFromDisk();
  return {
    version: data?.version ?? 0,
    generatedAt: data?.generatedAt ?? null,
    playerCount: data?.playerCount ?? Object.keys(players).length,
  };
}
