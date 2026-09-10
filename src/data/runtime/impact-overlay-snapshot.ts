/**
 * Bundled DARKO + RAPTOR overlays for Cloudflare Workers (no live scrape / fs).
 *
 * DARKO row: [nbaId, name, dpm, oDpm, dDpm]
 * RAPTOR row: [playerId, name, raptor, oRaptor, dRaptor, war]
 */
import snapshot from "./impact-overlay-snapshot.json";
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

const data = snapshot as unknown as ImpactOverlayFile;
const darkoSeasons =
  data?.darko && typeof data.darko === "object" ? data.darko : {};
const raptorSeasons =
  (data?.raptor && typeof data.raptor === "object" ? data.raptor : null) ??
  (data?.lebron && typeof data.lebron === "object" ? data.lebron : {});

const darkoCache = new Map<string, DarkoRating[]>();
const raptorCache = new Map<string, RaptorRating[]>();

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

export function getBundledDarkoSeason(season: string): DarkoRating[] {
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

export function getBundledRaptorSeason(season: string): RaptorRating[] {
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
export function findBundledDarkoPlayer(
  season: string,
  opts: {
    nbaId?: string | null;
    playerId?: string | null;
    playerName?: string | null;
  }
): DarkoRating | null {
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
export function findBundledRaptorPlayer(
  season: string,
  opts: {
    nbaId?: string | null;
    playerId?: string | null;
    playerName?: string | null;
  }
): RaptorRating | null {
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

export function listBundledDarkoSeasons(): string[] {
  return Object.keys(darkoSeasons).sort((a, b) => a.localeCompare(b));
}

export function listBundledRaptorSeasons(): string[] {
  return Object.keys(raptorSeasons).sort((a, b) => a.localeCompare(b));
}

export function isBundledDarkoSeason(season: string): boolean {
  const key = String(season ?? "").trim();
  return Boolean(key && (darkoSeasons[key]?.length ?? 0) > 0);
}

export function isBundledRaptorSeason(season: string): boolean {
  const key = String(season ?? "").trim();
  return Boolean(key && (raptorSeasons[key]?.length ?? 0) > 0);
}

export function bundledImpactOverlayMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    darkoSeasons: listBundledDarkoSeasons(),
    raptorSeasons: listBundledRaptorSeasons(),
  };
}
