/**
 * Slim DRBL overlay for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the ~412KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 *
 * Row v2: [id, name, teamId, drbl100, raw, poss, O, D, P, Ln, B, r1, war1]
 * Row v1 (legacy): [id, drbl100, raw, poss, O, D, P, Ln, B, r1, war1]
 */
import type { DrblPlayerSeasonRow } from "../../../drbl/models/player-value";

type SlimRowV2 = [
  string, // playerId (NBA)
  string, // playerName
  string, // teamId
  number | null, // drbl100
  number | null, // rawAbilityRate
  number, // possessions
  number | null, // drblO
  number | null, // drblD
  number | null, // drblP
  number | null, // drblLn
  number | null, // drblB
  number | null, // r1Points
  number | null, // r1WinEquivalents
];

type SlimRowV1 = [
  string,
  number | null,
  number | null,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

type SlimRow = SlimRowV1 | SlimRowV2;

type OverlayFile = {
  version?: number;
  generatedAt?: string;
  seasons?: Record<string, SlimRow[]>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/drbl-overlay-snapshot.json";

let data: OverlayFile | null | undefined;
let seasons: Record<string, SlimRow[]> = {};
const seasonCache = new Map<string, DrblPlayerSeasonRow[]>();

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

function loadFromPublicDir(): OverlayFile | null {
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
      "drbl-overlay-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as OverlayFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<OverlayFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as OverlayFile;
  } catch {
    return null;
  }
}

function applyOverlay(file: OverlayFile | null): boolean {
  data = file;
  seasons =
    file?.seasons && typeof file.seasons === "object" ? file.seasons : {};
  return file != null;
}

/** Node/tests: prime from public/ without awaiting ASSETS. */
function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) applyOverlay(file);
}

export async function ensureDrblOverlay(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return applyOverlay(fromDisk);
  return applyOverlay(await loadFromAssets());
}

function isV2(row: SlimRow): row is SlimRowV2 {
  return typeof row[1] === "string";
}

function toDrblRow(row: SlimRow): DrblPlayerSeasonRow {
  if (isV2(row)) {
    const [
      playerId,
      playerName,
      teamId,
      drbl100,
      rawAbilityRate,
      possessions,
      drblO,
      drblD,
      drblP,
      drblLn,
      drblB,
      r1Points,
      r1WinEquivalents,
    ] = row;
    return {
      playerId,
      playerName: playerName ?? "",
      teamId: teamId ?? "",
      possessions,
      actualPossessions: possessions,
      drbl100: drbl100 ?? Number.NaN,
      rawAbilityRate: rawAbilityRate ?? Number.NaN,
      posteriorAbilityRate: rawAbilityRate ?? Number.NaN,
      fusedRateRaw: rawAbilityRate ?? Number.NaN,
      reliabilityWeight: 0,
      priorMean: 0,
      priorEquivalentPossessions: 0,
      drblP: drblP ?? Number.NaN,
      drblLn,
      drblB,
      drblO: drblO ?? Number.NaN,
      drblD: drblD ?? Number.NaN,
      r1Points: r1Points ?? null,
      r1WinEquivalents: r1WinEquivalents ?? null,
    } as DrblPlayerSeasonRow;
  }

  const [
    playerId,
    drbl100,
    rawAbilityRate,
    possessions,
    drblO,
    drblD,
    drblP,
    drblLn,
    drblB,
    r1Points,
    r1WinEquivalents,
  ] = row;
  return {
    playerId,
    playerName: "",
    teamId: "",
    possessions,
    actualPossessions: possessions,
    drbl100: drbl100 ?? Number.NaN,
    rawAbilityRate: rawAbilityRate ?? Number.NaN,
    posteriorAbilityRate: rawAbilityRate ?? Number.NaN,
    fusedRateRaw: rawAbilityRate ?? Number.NaN,
    reliabilityWeight: 0,
    priorMean: 0,
    priorEquivalentPossessions: 0,
    drblP: drblP ?? Number.NaN,
    drblLn,
    drblB,
    drblO: drblO ?? Number.NaN,
    drblD: drblD ?? Number.NaN,
    r1Points: r1Points ?? null,
    r1WinEquivalents: r1WinEquivalents ?? null,
  } as DrblPlayerSeasonRow;
}

/** Sync after ensureDrblOverlay() (or Node disk prime). Empty when not primed. */
export function getBundledDrblSeason(season: string): DrblPlayerSeasonRow[] {
  tryPrimeFromDisk();
  const key = String(season ?? "").trim();
  if (!key) return [];
  const cached = seasonCache.get(key);
  if (cached) return cached;
  const rows = (seasons[key] ?? [])
    .map(toDrblRow)
    .filter((r) => Number.isFinite(r.drbl100));
  seasonCache.set(key, rows);
  return rows;
}

export function bundledDrblOverlayMeta() {
  tryPrimeFromDisk();
  return {
    version: data?.version ?? 0,
    generatedAt: data?.generatedAt ?? null,
    seasons: Object.keys(seasons),
  };
}
