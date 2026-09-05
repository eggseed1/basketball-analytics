/**
 * Slim player name index for header / explore search on Cloudflare.
 * Built from modern BRef boards + all-era BRef letter index in
 * build-runtime-cf-assets.mjs — keep off the 10MB advanced module.
 *
 * Row: [id, name, team, lastSeason, minutes, firstSeason?]
 */
import snapshot from "./player-search-snapshot.json";

type SearchSlimRow =
  | [string, string, string, string, number]
  | [string, string, string, string, number, string];

type SearchSnapshotFile = {
  version?: number;
  generatedAt?: string;
  players?: SearchSlimRow[];
};

export type PlayerSearchIndexRow = {
  id: string;
  name: string;
  nameLower: string;
  team: string;
  season: string;
  minutes: number;
  /** Earliest known season when present (all-era index). */
  firstSeason?: string;
};

const data = snapshot as SearchSnapshotFile;
const raw = Array.isArray(data.players) ? data.players : [];

let cached: PlayerSearchIndexRow[] | null = null;
const bySeasonCache = new Map<string, PlayerSearchIndexRow[]>();

function toRow(row: SearchSlimRow): PlayerSearchIndexRow {
  const [id, name, team, season, minutes, firstSeason] = row;
  return {
    id: String(id ?? ""),
    name: String(name ?? ""),
    nameLower: String(name ?? "").toLowerCase(),
    team: String(team ?? ""),
    season: String(season ?? ""),
    minutes: Number(minutes) || 0,
    ...(firstSeason ? { firstSeason: String(firstSeason) } : {}),
  };
}

export function getPlayerSearchIndex(): PlayerSearchIndexRow[] {
  if (cached) return cached;
  cached = raw
    .filter((row) => row?.[0] && row?.[1])
    .map((row) => toRow(row));
  return cached;
}

export function getPlayerSearchIndexForSeason(
  season: string
): PlayerSearchIndexRow[] {
  const key = String(season ?? "").trim();
  if (!key) return [];
  const hit = bySeasonCache.get(key);
  if (hit) return hit;
  // Prefer players whose last recorded season matches; fall back to full index
  // filtered in the route when empty (upcoming empty season).
  const rows = getPlayerSearchIndex().filter((row) => row.season === key);
  bySeasonCache.set(key, rows);
  return rows;
}

export function playerSearchSnapshotMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    playerCount: raw.length,
  };
}
