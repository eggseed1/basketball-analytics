/**
 * Bundled NBA hustle tracking for Cloudflare Workers.
 *
 * Row: [nbaId, teamId, contested, defl, charges, scrAst, loose, boxOuts, gp]
 */
import snapshot from "./hustle-overlay-snapshot.json";
import type { HustleSeasonPatch } from "@/data/transformers/hustle-stats";

type HustleSlimRow = [
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number,
];

type HustleOverlayFile = {
  version?: number;
  generatedAt?: string;
  seasons?: Record<string, HustleSlimRow[]>;
};

export type BundledHustlePlayerRow = {
  playerId: string;
  teamId: string;
  gamesPlayed: number;
  patch: Partial<HustleSeasonPatch>;
};

const data = snapshot as unknown as HustleOverlayFile;
const seasons =
  data?.seasons && typeof data.seasons === "object" ? data.seasons : {};

const seasonCache = new Map<string, BundledHustlePlayerRow[]>();

function rowToPlayer(row: HustleSlimRow): BundledHustlePlayerRow {
  const [
    playerId,
    teamId,
    contested,
    deflections,
    charges,
    screens,
    loose,
    boxOuts,
    gp,
  ] = row;
  const patch: Partial<HustleSeasonPatch> = {};
  if (contested != null) patch.hustleContestedShots = contested;
  if (deflections != null) patch.hustleDeflections = deflections;
  if (charges != null) patch.hustleChargesDrawn = charges;
  if (screens != null) patch.hustleScreenAssists = screens;
  if (loose != null) patch.hustleLooseBallsRecovered = loose;
  if (boxOuts != null) patch.hustleBoxOuts = boxOuts;
  return {
    playerId,
    teamId,
    gamesPlayed: gp,
    patch,
  };
}

export function getBundledHustleSeason(season: string): BundledHustlePlayerRow[] {
  const key = String(season ?? "").trim();
  if (!key) return [];
  const cached = seasonCache.get(key);
  if (cached) return cached;
  const rows = (seasons[key] ?? [])
    .filter((row) => row?.[0] && Object.keys(rowToPlayer(row).patch).length > 0)
    .map(rowToPlayer);
  seasonCache.set(key, rows);
  return rows;
}

export function bundledHustleOverlayMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    seasons: Object.keys(seasons),
  };
}
