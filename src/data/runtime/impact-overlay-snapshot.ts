/**
 * DARKO + RAPTOR overlays for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the ~1.3MB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 *
 * DARKO row: [nbaId, name, dpm, oDpm, dDpm]
 * RAPTOR row: [playerId, name, raptor, oRaptor, dRaptor, war]
 */
import type { DarkoRating, RaptorRating } from "@/data/types";
import { normalizePlayerName } from "@/lib/player-name";

type DarkoSlimRow = [
  string,
  string,
  number | null,
  number | null,
  number | null,
];

type RaptorSlimRow = [
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
];

type ImpactOverlayFile = {
  version?: number;
  generatedAt?: string;
  darko?: Record<string, DarkoSlimRow[]>;
  /** Primary key after RAPTOR rename. */
  raptor?: Record<string, RaptorSlimRow[]>;
  /** Legacy bake key — still read for older snapshots. */
  lebron?: Record<string, RaptorSlimRow[]>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/impact-overlay-snapshot.json";

type ImpactIndex = {
  version: number;
  generatedAt: string | null;
  darko: Record<string, DarkoSlimRow[]>;
  raptor: Record<string, RaptorSlimRow[]>;
};

let cachedIndex: ImpactIndex | null | undefined;
let darkoSeasons: Record<string, DarkoSlimRow[]> = {};
let raptorSeasons: Record<string, RaptorSlimRow[]> = {};
/** Dedupes concurrent first loads; null miss is not sticky (retry next request). */
let impactOverlayInflight: Promise<boolean> | null = null;

const darkoCache = new Map<string, DarkoRating[]>();
const raptorCache = new Map<string, RaptorRating[]>();

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

function loadFromPublicDir(): ImpactOverlayFile | null {
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
      "impact-overlay-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as ImpactOverlayFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<ImpactOverlayFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as ImpactOverlayFile;
  } catch {
    return null;
  }
}

export async function ensureImpactOverlay(): Promise<boolean> {
  if (cachedIndex != null) return true;
  if (impactOverlayInflight) return impactOverlayInflight;
  impactOverlayInflight = (async () => {
    try {
      const fromDisk = loadFromPublicDir();
      const file = fromDisk ?? (await loadFromAssets());
      if (!file) {
        // Transient ASSETS miss — leave unset so the next request retries.
        return false;
      }
      darkoSeasons =
        file.darko && typeof file.darko === "object" ? file.darko : {};
      raptorSeasons =
        (file.raptor && typeof file.raptor === "object" ? file.raptor : null) ??
        (file.lebron && typeof file.lebron === "object" ? file.lebron : {});
      cachedIndex = {
        version: file.version ?? 0,
        generatedAt: file.generatedAt ?? null,
        darko: darkoSeasons,
        raptor: raptorSeasons,
      };
      return true;
    } finally {
      impactOverlayInflight = null;
    }
  })();
  return impactOverlayInflight;
}

function toDarkoRating(season: string, row: DarkoSlimRow): DarkoRating {
  const [nbaId, playerName, impact, offensive, defensive] = row;
  return {
    playerId: nbaId,
    nbaPlayerId: nbaId,
    playerName: playerName ?? "",
    season,
    source: "darko",
    impact: impact ?? Number.NaN,
    offensive: offensive ?? undefined,
    defensive: defensive ?? undefined,
  };
}

function toRaptorRating(season: string, row: RaptorSlimRow): RaptorRating {
  const [nbaId, playerName, impact, offensive, defensive, winsAdded] = row;
  return {
    playerId: nbaId,
    nbaPlayerId: /^\d+$/.test(nbaId) ? nbaId : undefined,
    playerName: playerName ?? "",
    season,
    source: "raptor",
    impact: impact ?? Number.NaN,
    offensive: offensive ?? undefined,
    defensive: defensive ?? undefined,
    winsAdded: winsAdded ?? undefined,
  };
}

export async function bundledDarkoSeasonIds(): Promise<string[]> {
  await ensureImpactOverlay();
  return Object.keys(darkoSeasons);
}

export async function bundledRaptorSeasonIds(): Promise<string[]> {
  await ensureImpactOverlay();
  return Object.keys(raptorSeasons);
}

export async function getBundledDarkoSeason(
  season: string
): Promise<DarkoRating[]> {
  await ensureImpactOverlay();
  const key = String(season ?? "").trim();
  if (!key) return [];
  const cached = darkoCache.get(key);
  if (cached) return cached;
  const rows = (darkoSeasons[key] ?? [])
    .filter((row) => row?.[0] && Number.isFinite(row[2] ?? Number.NaN))
    .map((row) => toDarkoRating(key, row));
  darkoCache.set(key, rows);
  return rows;
}

export async function getBundledRaptorSeason(
  season: string
): Promise<RaptorRating[]> {
  await ensureImpactOverlay();
  const key = String(season ?? "").trim();
  if (!key) return [];
  const cached = raptorCache.get(key);
  if (cached) return cached;
  const rows = (raptorSeasons[key] ?? [])
    .filter((row) => row?.[0] && Number.isFinite(row[2] ?? Number.NaN))
    .map((row) => toRaptorRating(key, row));
  raptorCache.set(key, rows);
  return rows;
}

/**
 * Single-player DARKO lookup without materializing the full season array.
 * Career enrich on long careers used to index every season → CF 1102 risk.
 */
export async function findBundledDarkoPlayer(
  season: string,
  opts: {
    nbaId?: string | null;
    playerId?: string | null;
    playerName?: string | null;
  }
): Promise<DarkoRating | null> {
  await ensureImpactOverlay();
  const key = String(season ?? "").trim();
  if (!key) return null;
  const rows = darkoSeasons[key] ?? [];
  if (!rows.length) return null;
  const ids = new Set(
    [opts.nbaId, opts.playerId]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
  );
  const nameKey = opts.playerName
    ? normalizePlayerName(opts.playerName)
    : "";
  let nameHit: DarkoSlimRow | null = null;
  for (const row of rows) {
    if (!row?.[0] || !Number.isFinite(row[2] ?? Number.NaN)) continue;
    if (ids.has(row[0])) return toDarkoRating(key, row);
    if (
      nameKey &&
      !nameHit &&
      normalizePlayerName(row[1] ?? "") === nameKey
    ) {
      nameHit = row;
    }
  }
  return nameHit ? toDarkoRating(key, nameHit) : null;
}

/** Single-player RAPTOR lookup without materializing the full season array. */
export async function findBundledRaptorPlayer(
  season: string,
  opts: {
    nbaId?: string | null;
    playerId?: string | null;
    playerName?: string | null;
  }
): Promise<RaptorRating | null> {
  await ensureImpactOverlay();
  const key = String(season ?? "").trim();
  if (!key) return null;
  const rows = raptorSeasons[key] ?? [];
  if (!rows.length) return null;
  const ids = new Set(
    [opts.nbaId, opts.playerId]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
  );
  const nameKey = opts.playerName
    ? normalizePlayerName(opts.playerName)
    : "";
  let nameHit: RaptorSlimRow | null = null;
  for (const row of rows) {
    if (!row?.[0] || !Number.isFinite(row[2] ?? Number.NaN)) continue;
    if (ids.has(row[0])) return toRaptorRating(key, row);
    if (
      nameKey &&
      !nameHit &&
      normalizePlayerName(row[1] ?? "") === nameKey
    ) {
      nameHit = row;
    }
  }
  return nameHit ? toRaptorRating(key, nameHit) : null;
}

export async function listBundledDarkoSeasons(): Promise<string[]> {
  await ensureImpactOverlay();
  return Object.keys(darkoSeasons).sort((a, b) => a.localeCompare(b));
}

export async function listBundledRaptorSeasons(): Promise<string[]> {
  await ensureImpactOverlay();
  return Object.keys(raptorSeasons).sort((a, b) => a.localeCompare(b));
}

export async function isBundledDarkoSeason(season: string): Promise<boolean> {
  await ensureImpactOverlay();
  const key = String(season ?? "").trim();
  return Boolean(key && (darkoSeasons[key]?.length ?? 0) > 0);
}

export async function isBundledRaptorSeason(season: string): Promise<boolean> {
  await ensureImpactOverlay();
  const key = String(season ?? "").trim();
  return Boolean(key && (raptorSeasons[key]?.length ?? 0) > 0);
}

export async function bundledImpactOverlayMeta() {
  await ensureImpactOverlay();
  return {
    version: cachedIndex?.version ?? 0,
    generatedAt: cachedIndex?.generatedAt ?? null,
    darkoSeasons: await listBundledDarkoSeasons(),
    raptorSeasons: await listBundledRaptorSeasons(),
  };
}
