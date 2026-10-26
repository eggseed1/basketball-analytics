/**
 * Bundled DARKO + RAPTOR overlays.
 *
 * JSON is copied to public/runtime for Workers Static Assets — do not
 * static-import (inlines into the origin script).
 *
 * DARKO row: [nbaId, name, dpm, oDpm, dDpm]
 * RAPTOR row: [playerId, name, raptor, oRaptor, dRaptor, war]
 */
import type { DarkoRating, RaptorRating } from "@/data/types";
import { normalizePlayerName } from "@/lib/player-name";

import { loadRuntimeJson } from "./load-runtime-json";

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

type Loaded = {
  data: ImpactOverlayFile;
  darkoSeasons: Record<string, DarkoSlimRow[]>;
  raptorSeasons: Record<string, RaptorSlimRow[]>;
};

let loaded: Loaded | null = null;
let loadPromise: Promise<Loaded> | null = null;

const darkoCache = new Map<string, DarkoRating[]>();
const raptorCache = new Map<string, RaptorRating[]>();

async function ensureLoaded(): Promise<Loaded> {
  if (loaded) return loaded;
  if (!loadPromise) {
    loadPromise = (async () => {
      const data =
        (await loadRuntimeJson<ImpactOverlayFile>(
          "impact-overlay-snapshot.json"
        )) ?? {};
      const darkoSeasons =
        data?.darko && typeof data.darko === "object" ? data.darko : {};
      const raptorSeasons =
        (data?.raptor && typeof data.raptor === "object"
          ? data.raptor
          : null) ??
        (data?.lebron && typeof data.lebron === "object" ? data.lebron : {});
      loaded = { data, darkoSeasons, raptorSeasons };
      return loaded;
    })();
  }
  return loadPromise;
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
  const { darkoSeasons } = await ensureLoaded();
  return Object.keys(darkoSeasons);
}

export async function bundledRaptorSeasonIds(): Promise<string[]> {
  const { raptorSeasons } = await ensureLoaded();
  return Object.keys(raptorSeasons);
}

export async function getBundledDarkoSeason(
  season: string
): Promise<DarkoRating[]> {
  const key = String(season ?? "").trim();
  if (!key) return [];
  const cached = darkoCache.get(key);
  if (cached) return cached;
  const { darkoSeasons } = await ensureLoaded();
  const rows = (darkoSeasons[key] ?? [])
    .filter((row) => row?.[0] && Number.isFinite(row[2] ?? Number.NaN))
    .map((row) => toDarkoRating(key, row));
  darkoCache.set(key, rows);
  return rows;
}

export async function getBundledRaptorSeason(
  season: string
): Promise<RaptorRating[]> {
  const key = String(season ?? "").trim();
  if (!key) return [];
  const cached = raptorCache.get(key);
  if (cached) return cached;
  const { raptorSeasons } = await ensureLoaded();
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
  const key = String(season ?? "").trim();
  if (!key) return null;
  const { darkoSeasons } = await ensureLoaded();
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
  const key = String(season ?? "").trim();
  if (!key) return null;
  const { raptorSeasons } = await ensureLoaded();
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
  const { darkoSeasons } = await ensureLoaded();
  return Object.keys(darkoSeasons).sort((a, b) => a.localeCompare(b));
}

export async function listBundledRaptorSeasons(): Promise<string[]> {
  const { raptorSeasons } = await ensureLoaded();
  return Object.keys(raptorSeasons).sort((a, b) => a.localeCompare(b));
}

export async function isBundledDarkoSeason(season: string): Promise<boolean> {
  const key = String(season ?? "").trim();
  if (!key) return false;
  const { darkoSeasons } = await ensureLoaded();
  return Boolean((darkoSeasons[key]?.length ?? 0) > 0);
}

export async function isBundledRaptorSeason(season: string): Promise<boolean> {
  const key = String(season ?? "").trim();
  if (!key) return false;
  const { raptorSeasons } = await ensureLoaded();
  return Boolean((raptorSeasons[key]?.length ?? 0) > 0);
}

export async function bundledImpactOverlayMeta() {
  const { data } = await ensureLoaded();
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    darkoSeasons: await listBundledDarkoSeasons(),
    raptorSeasons: await listBundledRaptorSeasons(),
  };
}
