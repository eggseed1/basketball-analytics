/**
 * Lightweight player name search for the global header combobox.
 * GET /api/players/search?q=jokic&season=2024-25&scope=season|all
 *
 * Search universe: current season board + MASTER PLAYER REGISTRY (1996-97+),
 * with landmark historical season boards as a fallback when the registry is empty.
 * Current / active players are always ranked ahead of past careers.
 */

import { NextResponse } from "next/server";

import {
  getMasterPlayerRegistry,
  getSeasonPlayerUniverse,
  hasPlayerUniverseSeason,
  searchMasterPlayers,
} from "@/data/history/player-universe";
import { getPlayersBySeason } from "@/data/queries";
import {
  draftYearsForSeasonSearch,
  getDraftClassPlayers,
} from "@/data/providers/nba/draft-history";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import {
  availableCanonicalSeasons,
  defaultCanonicalSeasons,
  MODERN_LEAGUE_DASH_ESPN_YEAR,
} from "@/data/providers/nba/season";

export const dynamic = "force-dynamic";

type SearchResult = {
  id: string;
  name: string;
  team: string;
  position: string | null;
  season: string;
  careerSpan?: string;
  /** True when the player appears on the requested season board. */
  current?: boolean;
  /** Drafted into a recent class but not yet on the season board. */
  draftProspect?: boolean;
};

type SearchRow = {
  id: string;
  name: string;
  nameLower: string;
  team: string;
  position: string | null;
  season: string;
  minutes: number;
  careerSpan?: string;
  draftProspect?: boolean;
};

type IndexEntry = {
  freshUntil: number;
  rows: SearchRow[];
};

const searchIndex = new Map<string, IndexEntry>();
const INDEX_TTL_MS = 10 * 60 * 1000;
const RESULT_LIMIT = 10;

/** Landmark seasons for past-player fallback when master registry is empty. */
function landmarkHistoricalSeasons(currentSeason: string): string[] {
  const modern = availableCanonicalSeasons(MODERN_LEAGUE_DASH_ESPN_YEAR);
  const picks = new Set<string>();
  // Every other modern season — dense enough for multi-year stars, light enough
  // for parallel board loads on cold search.
  for (let i = 1; i < modern.length; i += 2) {
    const s = modern[i];
    if (s && s !== currentSeason) picks.add(s);
  }
  const floor = modern[modern.length - 1];
  if (floor && floor !== currentSeason) picks.add(floor);
  return [...picks];
}

async function getSearchIndex(season: string): Promise<SearchRow[]> {
  const now = Date.now();
  const cached = searchIndex.get(season);
  if (cached && cached.freshUntil > now && cached.rows.length > 0) {
    return cached.rows;
  }

  // Prefer factual historical universe when available.
  let rows: SearchRow[] = [];
  if (hasPlayerUniverseSeason(season)) {
    rows = getSeasonPlayerUniverse(season).map((row) => ({
      id: row.playerId,
      name: row.playerName,
      nameLower: row.playerName.toLowerCase(),
      team: nbaTeamAbbr(row.primaryTeamId),
      position: null as string | null,
      season: row.season,
      minutes: row.minutes ?? 0,
    }));
  } else {
    const seasonRows = await getPlayersBySeason(season);
    rows = seasonRows.map((row) => ({
      id: row.playerId,
      name: row.playerName,
      nameLower: row.playerName.toLowerCase(),
      team: nbaTeamAbbr(row.teamId, row.teamAbbreviation),
      position: row.position ?? null,
      season: row.season,
      minutes: row.minutes ?? 0,
    }));
  }

  // Rookies / recent draftees often have no board minutes yet — still searchable.
  const seen = new Set(rows.map((r) => r.id));
  try {
    const draftees = await getDraftClassPlayers(
      draftYearsForSeasonSearch(season)
    );
    for (const pick of draftees) {
      if (seen.has(pick.playerId)) continue;
      seen.add(pick.playerId);
      rows.push({
        id: pick.playerId,
        name: pick.playerName,
        nameLower: pick.playerName.toLowerCase(),
        team: pick.teamId
          ? nbaTeamAbbr(pick.teamId, pick.teamAbbr ?? undefined)
          : (pick.teamAbbr ?? ""),
        position: null,
        season,
        minutes: 0,
        draftProspect: true,
        careerSpan: pick.overallPick
          ? `Draft ${pick.year} · #${pick.overallPick}`
          : `Draft ${pick.year}`,
      });
    }
  } catch {
    /* draft overlay optional */
  }

  if (rows.length > 0) {
    searchIndex.set(season, { rows, freshUntil: now + INDEX_TTL_MS });
  }
  return rows;
}

function matchQuality(nameLower: string, id: string, q: string): number {
  if (id === q) return 0;
  if (nameLower === q) return 1;
  const tokens = nameLower.split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? nameLower;
  const last = tokens[tokens.length - 1] ?? nameLower;
  // Exact surname beats first-name prefix ("jordan" → Michael Jordan over Jordan Hall).
  if (last === q) return 2;
  if (nameLower.startsWith(q)) return 3;
  if (first === q || first.startsWith(q)) return 4;
  if (last.startsWith(q)) return 5;
  if (tokens.some((t) => t.startsWith(q))) return 6;
  if (nameLower.includes(q)) return 7;
  if (id.startsWith(q)) return 8;
  return 9;
}

function matchRows(rows: SearchRow[], q: string): SearchRow[] {
  return rows
    .filter((row) => matchQuality(row.nameLower, row.id.toLowerCase(), q) < 9)
    .sort((a, b) => {
      const aq = matchQuality(a.nameLower, a.id.toLowerCase(), q);
      const bq = matchQuality(b.nameLower, b.id.toLowerCase(), q);
      if (aq !== bq) return aq - bq;
      return b.minutes - a.minutes;
    });
}

function masterHits(q: string, limit: number): SearchResult[] {
  getMasterPlayerRegistry();
  return searchMasterPlayers(q, { limit }).map((row) => ({
    id: row.playerId,
    name: row.displayName,
    team: "",
    position: null,
    season: row.lastSeason,
    careerSpan: `${row.firstSeason} → ${row.lastSeason}`,
    current: false,
  }));
}

async function historicalBoardHits(
  q: string,
  currentSeason: string,
  excludeIds: Set<string>,
  limit: number
): Promise<SearchResult[]> {
  if (limit <= 0) return [];
  const seasons = landmarkHistoricalSeasons(currentSeason);
  const boards = await Promise.all(
    seasons.map(async (season) => {
      try {
        return await getSearchIndex(season);
      } catch {
        return [] as SearchRow[];
      }
    })
  );

  const byId = new Map<string, SearchRow>();
  for (const rows of boards) {
    for (const row of matchRows(rows, q)) {
      if (excludeIds.has(row.id)) continue;
      const existing = byId.get(row.id);
      if (!existing || row.season > existing.season) {
        byId.set(row.id, row);
      }
    }
  }

  return [...byId.values()]
    .sort((a, b) => {
      const aq = matchQuality(a.nameLower, a.id.toLowerCase(), q);
      const bq = matchQuality(b.nameLower, b.id.toLowerCase(), q);
      if (aq !== bq) return aq - bq;
      return b.season.localeCompare(a.season);
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      name: row.name,
      team: row.team,
      position: row.position,
      season: row.season,
      careerSpan: `Last ${row.season}`,
      current: false,
    }));
}

/**
 * Current-season matches first, then past careers (master registry, else
 * landmark historical boards). Dedupes by player id.
 * Reserves a few slots for past careers so legends are not crowded out
 * when many current names share the query (e.g. "jordan").
 */
async function searchPrioritized(
  q: string,
  season: string,
  limit: number
): Promise<{ results: SearchResult[]; universe: string }> {
  const currentRows = matchRows(await getSearchIndex(season), q);
  const current: SearchResult[] = currentRows.map((row) => ({
    id: row.id,
    name: row.name,
    team: row.team,
    position: row.position,
    season: row.season,
    current: !row.draftProspect,
    draftProspect: row.draftProspect,
    careerSpan: row.careerSpan,
  }));

  // Prefer players who already have board minutes, then recent draftees.
  current.sort((a, b) => {
    const ap = a.draftProspect ? 1 : 0;
    const bp = b.draftProspect ? 1 : 0;
    if (ap !== bp) return ap - bp;
    return 0;
  });

  const seen = new Set(current.map((r) => r.id));
  const pastReserve = Math.min(3, Math.max(0, limit - 1));

  let pastPool: SearchResult[] = [];
  let universe = hasPlayerUniverseSeason(season)
    ? "historical-player-season-registry+career"
    : "provider-season-board+career";

  const fromMaster = masterHits(q, limit * 2).filter((r) => !seen.has(r.id));
  if (fromMaster.length > 0) {
    pastPool = fromMaster;
    universe = `${universe}+master`;
  } else {
    pastPool = await historicalBoardHits(q, season, seen, limit * 2);
    if (pastPool.length > 0) universe = `${universe}+landmark-history`;
  }

  if (current.some((r) => r.draftProspect)) {
    universe = `${universe}+draft-class`;
  }

  const currentCap =
    pastPool.length > 0
      ? Math.min(current.length, Math.max(1, limit - pastReserve))
      : limit;
  const currentTake = current.slice(0, currentCap);
  for (const row of currentTake) seen.add(row.id);

  const pastTake = pastPool
    .filter((r) => !seen.has(r.id))
    .slice(0, limit - currentTake.length);

  return {
    results: [...currentTake, ...pastTake].slice(0, limit),
    universe,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const season =
    searchParams.get("season")?.trim() || defaultCanonicalSeasons(1)[0];
  const scope = (searchParams.get("scope") ?? "season").toLowerCase();

  if (q.length < 1) {
    return NextResponse.json({ results: [], season });
  }

  try {
    // Global / career search — current players first, then past careers.
    if (scope === "all" || scope === "career" || scope === "master") {
      const { results, universe } = await searchPrioritized(q, season, RESULT_LIMIT);
      return NextResponse.json({
        results,
        season,
        scope: "all",
        universe,
      });
    }

    // Season-scoped (explore filters): current board only, master fallback on miss.
    const rows = await getSearchIndex(season);
    const results = matchRows(rows, q)
      .slice(0, RESULT_LIMIT)
      .map((row) => ({
        id: row.id,
        name: row.name,
        team: row.team,
        position: row.position,
        season: row.season,
        current: !row.draftProspect,
        draftProspect: row.draftProspect,
        careerSpan: row.careerSpan,
      }));

    if (results.length === 0) {
      const { results: past, universe } = await searchPrioritized(
        q,
        season,
        RESULT_LIMIT
      );
      return NextResponse.json({
        results: past,
        season,
        scope: "master-fallback",
        universe,
      });
    }

    const hasDraft = results.some((r) => r.draftProspect);
    return NextResponse.json({
      results,
      season,
      universe: hasPlayerUniverseSeason(season)
        ? hasDraft
          ? "historical-player-season-registry+draft-class"
          : "historical-player-season-registry"
        : hasDraft
          ? "provider-season-board+draft-class"
          : "provider-season-board",
    });
  } catch (error) {
    console.error("player search failed", error);
    return NextResponse.json(
      { results: [], season, error: "Search failed" },
      { status: 500 }
    );
  }
}
