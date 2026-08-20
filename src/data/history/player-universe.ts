/**
 * Historical player universe — factual membership independent of DRBL.
 *
 * Join direction (invariant):
 *   ALL SEASON PLAYERS  LEFT JOIN  DRBL
 * never:
 *   DRBL  INNER JOIN  PLAYERS
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  getHistoryCareerSummaries,
  getHistoryPlayerSeasons,
  historySeasonSupportsDrbl,
  type HistoryCareerSummary,
  type HistoryPlayerSeason,
} from "@/data/history/player-career";
import { HISTORY_VERSION } from "@/lib/history/capabilities";
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";
import type { PlayerSeason } from "@/data/types";

const HISTORY_ROOT = path.join(
  process.cwd(),
  "data",
  "drbl",
  "history",
  HISTORY_VERSION
);

const ALL_ERA_ROOT = path.join(
  process.cwd(),
  "data",
  "drbl",
  "player-history",
  "drbl-player-history-v1"
);

export const PLAYER_UNIVERSE_SOURCE = "historical-player-game-box" as const;
export const PLAYER_MEMBERSHIP_TYPE = "APPEARED_IN_GAME" as const;

export type MasterPlayerRecord = {
  playerId: string;
  displayName: string;
  firstSeason: string;
  lastSeason: string;
  isActive?: boolean | null;
  teamHistory?: string[];
  teamIds?: string[];
  identityStatus: "RESOLVED" | "UNRESOLVED";
  careerSpanSource?: "player-season-membership";
  providerIds?: { nbaStats?: string };
  leagueHistory?: "NBA";
};

export type SeasonPlayerDirectoryRow = HistoryPlayerSeason & {
  membershipSource: typeof PLAYER_UNIVERSE_SOURCE;
  membershipType: typeof PLAYER_MEMBERSHIP_TYPE;
  boxAvailable: boolean;
  pbpAvailable: boolean | null;
  shotDataAvailable: boolean | null;
  drblAvailable: boolean;
  war1Available: boolean;
};

let bySeasonCache: Map<string, HistoryPlayerSeason[]> | null = null;
let masterCache: MasterPlayerRecord[] | null = null;

/** Historical box/precompute complete through this season (inclusive). */
export const HISTORICAL_COMPLETE_THROUGH = "2023-24";

/** Test / sync helper — clears memoized registry + season indexes. */
export function clearPlayerUniverseCaches() {
  bySeasonCache = null;
  masterCache = null;
}

function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readJson<T>(p: string): T | null {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

function buildBySeasonIndex(): Map<string, HistoryPlayerSeason[]> {
  if (bySeasonCache) return bySeasonCache;
  // Prefer compact per-season indexes when present.
  const dir = path.join(HISTORY_ROOT, "players", "by-season");
  const map = new Map<string, HistoryPlayerSeason[]>();
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const season = file.replace(/\.json$/, "");
      const data = readJson<{ rows: HistoryPlayerSeason[] }>(
        path.join(dir, file)
      );
      if (data?.rows?.length) map.set(season, data.rows);
    }
  }
  if (map.size === 0) {
    for (const row of getHistoryPlayerSeasons()) {
      const list = map.get(row.season) ?? [];
      list.push(row);
      map.set(row.season, list);
    }
  }

  // All-era pre-1996 seasons (drbl-player-history-v1) — do not overwrite 1996+.
  const allEraSeasons = path.join(ALL_ERA_ROOT, "seasons");
  if (existsSync(allEraSeasons)) {
    for (const file of readdirSync(allEraSeasons)) {
      if (!file.endsWith(".json")) continue;
      const season = file.replace(/\.json$/, "");
      if (map.has(season)) continue;
      const data = readJson<{ rows: HistoryPlayerSeason[] }>(
        path.join(allEraSeasons, file)
      );
      if (data?.rows?.length) {
        map.set(
          season,
          data.rows.map((r) => ({
            ...r,
            drbl100: null,
            war1: null,
            teamIds: r.teamIds ?? [],
            primaryTeamId: r.primaryTeamId ?? "",
            gs: r.gs ?? null,
            // Preserve null for era-unavailable stats (never coerce missing → 0).
            minutes: r.minutes ?? null,
            points: r.points ?? null,
            rebounds: r.rebounds ?? null,
            assists: r.assists ?? null,
            steals: r.steals ?? null,
            blocks: r.blocks ?? null,
            turnovers: r.turnovers ?? null,
            fgm: r.fgm ?? null,
            fga: r.fga ?? null,
            threePm: r.threePm ?? null,
            threePa: r.threePa ?? null,
            ftm: r.ftm ?? null,
            fta: r.fta ?? null,
          }))
        );
      }
    }
  }

  bySeasonCache = map;
  return map;
}

/** Seasons with a factual player-season registry on disk. */
export function listPlayerUniverseSeasons(): string[] {
  return [...buildBySeasonIndex().keys()].sort();
}

export function hasPlayerUniverseSeason(season: string): boolean {
  return buildBySeasonIndex().has(season);
}

/**
 * Complete factual season-player universe (one row per player × season).
 * Multi-team seasons are already deduped to one player with teamIds[].
 */
export function getSeasonPlayerUniverse(
  season: string
): SeasonPlayerDirectoryRow[] {
  const rows = buildBySeasonIndex().get(season) ?? [];
  const drbl = historySeasonSupportsDrbl(season);
  return rows.map((r) => ({
    ...r,
    membershipSource: PLAYER_UNIVERSE_SOURCE,
    membershipType: PLAYER_MEMBERSHIP_TYPE,
    boxAvailable: true,
    pbpAvailable: null,
    shotDataAvailable: null,
    drblAvailable: drbl,
    war1Available: drbl,
    drbl100: null,
    war1: null,
  }));
}

export function countSeasonPlayerUniverse(season: string): number {
  return buildBySeasonIndex().get(season)?.length ?? 0;
}

/** Map factual history season rows → PlayerSeason for board/API (no invented DRBL). */
export function historyUniverseToPlayerSeasons(
  season: string
): PlayerSeason[] {
  return getSeasonPlayerUniverse(season).map((h) => {
    const fga = h.fga ?? 0;
    const fgm = h.fgm ?? 0;
    const threePa = h.threePa ?? 0;
    const threePm = h.threePm ?? 0;
    const fta = h.fta ?? 0;
    const ftm = h.ftm ?? 0;
    const fgPct = fga > 0 ? fgm / fga : 0;
    const tpPct = threePa > 0 ? threePm / threePa : 0;
    const ftPct = fta > 0 ? ftm / fta : 0;
    const multi = h.teamIds.length > 1;
    return withPlayerSeasonDefaults({
      playerId: h.playerId,
      playerName: h.playerName,
      teamId: multi ? "TOT" : h.primaryTeamId,
      teamName: multi ? "Multiple Teams" : h.primaryTeamId,
      providerTeamId: h.primaryTeamId,
      teamIdProvider: "nba",
      nbaTeamId: h.primaryTeamId,
      season: h.season,
      gamesPlayed: h.gp,
      gamesStarted: h.gs ?? 0,
      minutes: h.minutes ?? 0,
      points: h.points ?? 0,
      rebounds: h.rebounds ?? 0,
      assists: h.assists ?? 0,
      steals: h.steals ?? 0,
      blocks: h.blocks ?? 0,
      turnovers: h.turnovers ?? 0,
      fieldGoalsMade: fgm,
      fieldGoalsAttempted: fga,
      threePointersMade: threePm,
      threePointersAttempted: threePa,
      freeThrowsMade: ftm,
      freeThrowsAttempted: fta,
      fieldGoalPct: fgPct,
      threePointPct: tpPct,
      freeThrowPct: ftPct,
      r1Points: null,
      r1WinEquivalents: null,
    });
  });
}

/**
 * LEFT JOIN provider/overlay rows onto the factual universe.
 * Universe size never shrinks to the overlay set.
 */
export function leftJoinPlayerUniverse(
  universe: PlayerSeason[],
  overlay: PlayerSeason[]
): PlayerSeason[] {
  if (!universe.length) return overlay;
  if (!overlay.length) return universe;
  const byId = new Map(overlay.map((r) => [r.playerId, r]));
  return universe.map((base) => {
    const o = byId.get(base.playerId);
    if (!o) return base;
    return {
      ...base,
      ...o,
      // Preserve factual membership / temporal team from universe.
      playerId: base.playerId,
      playerName: base.playerName || o.playerName,
      season: base.season,
      teamId: base.teamId,
      teamName: base.teamName,
      teamAbbreviation: base.teamAbbreviation ?? o.teamAbbreviation,
      providerTeamId: base.providerTeamId ?? o.providerTeamId,
      teamIdProvider: base.teamIdProvider ?? o.teamIdProvider,
      nbaTeamId: base.nbaTeamId ?? o.nbaTeamId,
      gamesPlayed: Math.max(base.gamesPlayed, o.gamesPlayed),
      minutes: base.minutes > 0 ? base.minutes : o.minutes,
      points: base.points > 0 ? base.points : o.points,
      rebounds: base.rebounds > 0 ? base.rebounds : o.rebounds,
      assists: base.assists > 0 ? base.assists : o.assists,
      r1Points: o.r1Points ?? null,
      r1WinEquivalents: o.r1WinEquivalents ?? null,
    };
  });
}

const CURRENT_ACTIVE_FLOOR = "2023-24";

export function getMasterPlayerRegistry(): MasterPlayerRecord[] {
  if (masterCache) return masterCache;
  const allEra = readJson<{ players: MasterPlayerRecord[] }>(
    path.join(ALL_ERA_ROOT, "master-registry.json")
  );
  if (allEra?.players?.length) {
    masterCache = allEra.players;
    return masterCache;
  }
  const disk = readJson<{ players: MasterPlayerRecord[] }>(
    path.join(HISTORY_ROOT, "players", "master-registry.json")
  );
  if (disk?.players?.length) {
    masterCache = disk.players;
    return masterCache;
  }
  masterCache = getHistoryCareerSummaries().map(careerToMaster);
  return masterCache;
}

export function getMasterPlayer(
  playerId: string
): MasterPlayerRecord | null {
  return getMasterPlayerRegistry().find((p) => p.playerId === playerId) ?? null;
}

/** Seasons across 1996+ history + pre-1996 all-era product. */
export function getUniverseSeasonsForPlayer(
  playerId: string
): HistoryPlayerSeason[] {
  const out: HistoryPlayerSeason[] = [];
  for (const rows of buildBySeasonIndex().values()) {
    for (const r of rows) {
      if (r.playerId === playerId) out.push(r);
    }
  }
  return out.sort((a, b) => b.season.localeCompare(a.season));
}

function careerToMaster(c: HistoryCareerSummary): MasterPlayerRecord {
  return {
    playerId: c.playerId,
    displayName: c.playerName,
    firstSeason: c.firstSeason,
    lastSeason: c.lastSeason,
    isActive: c.lastSeason >= CURRENT_ACTIVE_FLOOR ? true : false,
    teamHistory: c.teams,
    identityStatus: "RESOLVED",
    careerSpanSource: "player-season-membership",
  };
}

export function searchMasterPlayers(
  query: string,
  opts?: { limit?: number }
): MasterPlayerRecord[] {
  const q = normalizeSearchText(query);
  if (q.length < 1) return [];
  const limit = opts?.limit ?? 20;
  const scored: Array<{ row: MasterPlayerRecord; score: number }> = [];
  for (const row of getMasterPlayerRegistry()) {
    const name = normalizeSearchText(row.displayName);
    const id = row.playerId.toLowerCase();
    const tokens = name.split(/\s+/);
    const last = tokens[tokens.length - 1] ?? name;
    const idMatch = id === q || id.startsWith(q);
    const nameMatch =
      name.includes(q) || last.startsWith(q) || tokens.some((t) => t.startsWith(q));
    if (!nameMatch && !idMatch) continue;
    let score = 5;
    if (id === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (last.startsWith(q)) score = 2;
    else if (name.includes(` ${q}`)) score = 3;
    else if (id.startsWith(q)) score = 4;
    scored.push({ row, score });
  }
  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return b.row.lastSeason.localeCompare(a.row.lastSeason);
    })
    .slice(0, limit)
    .map((s) => s.row);
}

/** Sanity: NBA seasons should be hundreds of unique players, never teens. */
export function seasonPlayerUniverseLooksComplete(count: number): boolean {
  return count >= 200;
}
