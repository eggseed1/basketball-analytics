/**
 * Historical product data loaders (P18A).
 * Reads compact precomputed artifacts — never walks the raw archive at request time.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { HISTORY_VERSION } from "@/lib/history/capabilities";
import type {
  HistoricalGameArtifact,
  HistoricalGameSummary,
} from "@/data/history/types";

export type {
  HistoricalGameArtifact,
  HistoricalGameSummary,
  HistoricalPlayerGame,
} from "@/data/history/types";

const HISTORY_ROOT = path.join(
  process.cwd(),
  "data",
  "drbl",
  "history",
  HISTORY_VERSION
);

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

const SUMMARY_CACHE_MAX = 8;
const GAME_CACHE_MAX = 48;
const summariesBySeason = new Map<string, HistoricalGameSummary[]>();
const productGameByKey = new Map<string, HistoricalGameArtifact | null>();

function rememberSummary(season: string, games: HistoricalGameSummary[]) {
  if (summariesBySeason.size >= SUMMARY_CACHE_MAX) {
    const oldest = summariesBySeason.keys().next().value;
    if (oldest !== undefined) summariesBySeason.delete(oldest);
  }
  summariesBySeason.set(season, games);
}

function rememberProductGame(key: string, game: HistoricalGameArtifact | null) {
  if (productGameByKey.size >= GAME_CACHE_MAX) {
    const oldest = productGameByKey.keys().next().value;
    if (oldest !== undefined) productGameByKey.delete(oldest);
  }
  productGameByKey.set(key, game);
}

export function listHistoryProductSeasons(): string[] {
  if (!existsSync(HISTORY_ROOT)) return [];
  return readdirSync(HISTORY_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function getHistorySeasonManifest(season: string) {
  return readJsonFile<Record<string, unknown>>(
    path.join(HISTORY_ROOT, season, "season-manifest.json")
  );
}

export function getHistoricalGameSummaries(
  season: string
): HistoricalGameSummary[] {
  const cached = summariesBySeason.get(season);
  if (cached) return cached;
  const data = readJsonFile<{ games: HistoricalGameSummary[] }>(
    path.join(HISTORY_ROOT, season, "game-summaries.json")
  );
  const games = data?.games ?? [];
  rememberSummary(season, games);
  return games;
}

export function getHistoricalProductGame(
  gameId: string,
  seasonHint?: string
): HistoricalGameArtifact | null {
  const cacheKey = `${seasonHint ?? ""}:${gameId}`;
  if (productGameByKey.has(cacheKey)) {
    return productGameByKey.get(cacheKey) ?? null;
  }

  if (seasonHint) {
    const p = path.join(HISTORY_ROOT, seasonHint, "games", `${gameId}.json`);
    const hit = readJsonFile<HistoricalGameArtifact>(p);
    rememberProductGame(cacheKey, hit);
    return hit;
  }
  const m = /^002(\d{2})/.exec(gameId);
  if (m) {
    const yy = Number(m[1]);
    const start = yy >= 50 ? 1900 + yy : 2000 + yy;
    const season = `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
    const p = path.join(HISTORY_ROOT, season, "games", `${gameId}.json`);
    const hit = readJsonFile<HistoricalGameArtifact>(p);
    if (hit) {
      rememberProductGame(cacheKey, hit);
      return hit;
    }
  }
  for (const season of listHistoryProductSeasons()) {
    const p = path.join(HISTORY_ROOT, season, "games", `${gameId}.json`);
    const hit = readJsonFile<HistoricalGameArtifact>(p);
    if (hit) {
      rememberProductGame(cacheKey, hit);
      return hit;
    }
  }
  rememberProductGame(cacheKey, null);
  return null;
}

export function searchHistoricalProductGames(params: {
  season: string;
  teamId?: string;
  playerId?: string;
  date?: string;
}): HistoricalGameSummary[] {
  const { season, teamId, playerId, date } = params;
  let ids: string[] | null = null;

  if (teamId) {
    const idx = readJsonFile<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-team.json")
    );
    ids = idx?.[teamId] ?? [];
  }
  if (playerId) {
    const idx = readJsonFile<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-player.json")
    );
    const playerIds = idx?.[playerId] ?? [];
    ids = ids ? ids.filter((id) => playerIds.includes(id)) : playerIds;
  }
  if (date) {
    const idx = readJsonFile<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-date.json")
    );
    const dateIds = idx?.[date] ?? [];
    ids = ids ? ids.filter((id) => dateIds.includes(id)) : dateIds;
  }

  const all = getHistoricalGameSummaries(season);
  if (ids) {
    const set = new Set(ids);
    return all.filter((g) => set.has(g.gameId));
  }
  return all;
}
