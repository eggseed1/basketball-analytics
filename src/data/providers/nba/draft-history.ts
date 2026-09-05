/**
 * NBA Stats draft history → playerId → draft pick details.
 * One league-wide snapshot; cache for hours (the table changes once a year).
 */

import { CACHE_TTL_MS } from "@/data/providers/nba/cache-policy";
import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "@/data/providers/nba/stats-nba-client";
import type { PlayerSeason } from "@/data/types";

export type DraftPickRecord = {
  year: number;
  round: number;
  pick: number;
  overallPick: number;
  teamAbbr: string | null;
  teamId: string | null;
  organization: string | null;
};

/** Named draft pick for search (rookies before they appear on season boards). */
export type DraftClassPlayer = DraftPickRecord & {
  playerId: string;
  playerName: string;
};

let cached: {
  freshUntil: number;
  map: Map<string, DraftPickRecord>;
  byYear: Map<number, DraftClassPlayer[]>;
} | null = null;
const FRESH_MS = CACHE_TTL_MS.historicalSeasonStats;
const EMPTY = new Map<string, DraftPickRecord>();

async function loadDraftHistory(): Promise<NonNullable<typeof cached>> {
  const now = Date.now();
  if (cached && cached.freshUntil > now && cached.map.size > 0) {
    return cached;
  }
  try {
    const response = await statsNbaFetch(
      "drafthistory",
      { LeagueID: "00" },
      { ttlMs: FRESH_MS, staleMs: FRESH_MS * 2, retries: 2 }
    );
    const set = getResultSet(response);
    if (!set) {
      return (
        cached ?? {
          freshUntil: 0,
          map: EMPTY,
          byYear: new Map(),
        }
      );
    }
    const map = new Map<string, DraftPickRecord>();
    const byYear = new Map<number, DraftClassPlayer[]>();
    for (const row of resultSetToObjects(set)) {
      const id = String(row.PERSON_ID ?? "").trim();
      const year = Number(row.SEASON);
      const name = String(row.PLAYER_NAME ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (!id || !Number.isFinite(year) || year < 1947) continue;
      const round = Number(row.ROUND_NUMBER);
      const pick = Number(row.OVERALL_PICK);
      const roundPick = Number(row.ROUND_PICK);
      const abbr = String(row.TEAM_ABBREVIATION ?? "")
        .trim()
        .toUpperCase();
      const record: DraftPickRecord = {
        year,
        round: Number.isFinite(round) && round > 0 ? round : 0,
        pick:
          Number.isFinite(pick) && pick > 0
            ? pick
            : Number.isFinite(roundPick) && roundPick > 0
              ? roundPick
              : 0,
        overallPick: Number.isFinite(pick) && pick > 0 ? pick : 0,
        teamAbbr: abbr || null,
        teamId: row.TEAM_ID != null ? String(row.TEAM_ID) : null,
        organization:
          row.ORGANIZATION != null ? String(row.ORGANIZATION).trim() : null,
      };
      map.set(id, record);
      if (name) {
        const list = byYear.get(year) ?? [];
        list.push({ playerId: id, playerName: name, ...record });
        byYear.set(year, list);
      }
    }
    if (map.size > 0) {
      cached = { map, byYear, freshUntil: now + FRESH_MS };
      return cached;
    }
    return (
      cached ?? {
        freshUntil: 0,
        map: EMPTY,
        byYear: new Map(),
      }
    );
  } catch {
    return (
      cached ?? {
        freshUntil: 0,
        map: EMPTY,
        byYear: new Map(),
      }
    );
  }
}

export async function getDraftPickByPlayerId(): Promise<
  Map<string, DraftPickRecord>
> {
  const data = await loadDraftHistory();
  return data.map.size > 0 ? data.map : EMPTY;
}

/**
 * Draft classes searchable before rookies appear on season stats boards.
 * `years` are NBA draft calendar years (SEASON on drafthistory).
 */
export async function getDraftClassPlayers(
  years: number[]
): Promise<DraftClassPlayer[]> {
  if (!years.length) return [];
  const data = await loadDraftHistory();
  const want = new Set(years);
  const out: DraftClassPlayer[] = [];
  for (const year of want) {
    const list = data.byYear.get(year);
    if (list) out.push(...list);
  }
  return out;
}

/**
 * Draft years to surface for a season board search: this class, last year’s
 * holdovers, and the next class once summer drafts land.
 * Example: 2025-26 → 2024, 2025, 2026.
 */
export function draftYearsForSeasonSearch(season: string): number[] {
  const match = /^(\d{4})-\d{2}$/.exec(season.trim());
  if (!match) return [];
  const start = Number(match[1]);
  if (!Number.isFinite(start)) return [];
  return [start - 1, start, start + 1];
}

/** @deprecated Prefer getDraftPickByPlayerId — kept for existing call sites. */
export async function getDraftYearByPlayerId(): Promise<Map<string, number>> {
  const picks = await getDraftPickByPlayerId();
  const years = new Map<string, number>();
  for (const [id, pick] of picks) {
    years.set(id, pick.year);
  }
  return years;
}

export function formatDraftPickDisplay(pick: DraftPickRecord): string {
  if (!pick.round || !pick.pick) {
    return `Year: ${pick.year}`;
  }
  const team = pick.teamAbbr ? ` (${pick.teamAbbr})` : "";
  return `${pick.year}: Rd ${pick.round}, Pk ${pick.pick}${team}`;
}

export function overlayDraftYears(
  rows: PlayerSeason[],
  draftById: Map<string, number>
): PlayerSeason[] {
  if (!draftById.size) return rows;
  return rows.map((row) => {
    if (row.draftYear != null) return row;
    const draftYear =
      draftById.get(row.playerId) ??
      draftById.get(`espn:${row.playerId}`);
    return draftYear != null ? { ...row, draftYear } : row;
  });
}

/** Test helper — clears memoized draft history. */
export function clearDraftHistoryCache() {
  cached = null;
}
