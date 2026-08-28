/**
 * Lightweight player name search for the global header combobox.
 * GET /api/players/search?q=jokic&season=2024-25&scope=season|all
 *
 * Cloudflare path uses a ~155KB baked name index only (no live ESPN / fat BRef).
 * Vercel can enrich with live boards + master registry + draft class.
 */

import { NextResponse } from "next/server";

import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import { defaultCanonicalSeasons } from "@/data/providers/nba/season";
import {
  getPlayerSearchIndex,
  getPlayerSearchIndexForSeason,
} from "@/data/runtime/player-search-snapshot";
import { getBundledCurrentRosterEntry } from "@/data/runtime/current-roster-snapshot";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { resolveTeamBrand } from "@/lib/nba-brand";

export const dynamic = "force-dynamic";

type SearchResult = {
  id: string;
  name: string;
  team: string;
  position: string | null;
  season: string;
  careerSpan?: string;
  current?: boolean;
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
const isVercel = () => process.env.VERCEL === "1";

function normalizeSearchText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchQuality(nameLower: string, id: string, q: string): number {
  const name = normalizeSearchText(nameLower);
  const query = normalizeSearchText(q);
  const idNorm = normalizeSearchText(id);
  if (!query) return 9;
  if (idNorm === query || id.toLowerCase() === q) return 0;
  if (name === query) return 1;
  const tokens = name.split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? name;
  const last = tokens[tokens.length - 1] ?? name;
  if (last === query) return 2;
  if (name.startsWith(query)) return 3;
  if (first === query || first.startsWith(query)) return 4;
  if (last.startsWith(query)) return 5;
  if (tokens.some((t) => t.startsWith(query))) return 6;
  if (name.includes(query)) return 7;
  if (idNorm.startsWith(query) || id.toLowerCase().startsWith(q)) return 8;
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

function currentTeamAbbrForSearch(playerId: string, fallback: string): string {
  const hit = getBundledCurrentRosterEntry(playerId);
  if (!hit?.teamId) return fallback;
  const brand = resolveTeamBrand(hit.teamId);
  if (brand?.abbr) return brand.abbr;
  if (hit.teamAbbr && !/^\d+$/.test(hit.teamAbbr)) return hit.teamAbbr;
  return nbaTeamAbbr(hit.teamId, hit.teamAbbr || fallback);
}

function bundledSeasonRows(season: string): SearchRow[] {
  let bundled = getPlayerSearchIndexForSeason(season);
  let boardSeason = season;
  if (!bundled.length) {
    boardSeason = shiftCanonicalSeason(season, -1);
    bundled = getPlayerSearchIndexForSeason(boardSeason);
  }
  return bundled.map((row) => ({
    id: row.id,
    name: row.name,
    nameLower: row.nameLower,
    team: currentTeamAbbrForSearch(row.id, nbaTeamAbbr(row.team, row.team)),
    position: null,
    season: boardSeason,
    minutes: row.minutes ?? 0,
  }));
}

async function getSearchIndex(season: string): Promise<SearchRow[]> {
  const now = Date.now();
  const cached = searchIndex.get(season);
  if (cached && cached.freshUntil > now && cached.rows.length > 0) {
    return cached.rows;
  }

  let rows: SearchRow[] = [];

  if (isVercel()) {
    try {
      const {
        hasPlayerUniverseSeason,
        getSeasonPlayerUniverse,
      } = await import("@/data/history/player-universe");
      if (hasPlayerUniverseSeason(season)) {
        rows = getSeasonPlayerUniverse(season).map((row) => ({
          id: row.playerId,
          name: row.playerName,
          nameLower: row.playerName.toLowerCase(),
          team: currentTeamAbbrForSearch(
            row.playerId,
            nbaTeamAbbr(row.primaryTeamId)
          ),
          position: null,
          season: row.season,
          minutes: row.minutes ?? 0,
        }));
      } else {
        const { getPlayersBySeason } = await import("@/data/queries/players");
        const { withBudget } = await import("@/data/queries/budget");
        const live = await withBudget(
          getPlayersBySeason(season).catch(() => []),
          8_000,
          [] as Awaited<ReturnType<typeof getPlayersBySeason>>
        );
        rows = live.value.map((row) => ({
          id: row.playerId,
          name: row.playerName,
          nameLower: row.playerName.toLowerCase(),
          team: currentTeamAbbrForSearch(
            row.playerId,
            nbaTeamAbbr(row.teamId, row.teamAbbreviation)
          ),
          position: row.position ?? null,
          season: row.season,
          minutes: row.minutes ?? 0,
        }));
      }
    } catch {
      rows = [];
    }

    if (rows.length > 0) {
      try {
        const {
          draftYearsForSeasonSearch,
          getDraftClassPlayers,
        } = await import("@/data/providers/nba/draft-history");
        const seen = new Set(rows.map((r) => r.id));
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
    }
  }

  if (rows.length === 0) {
    rows = bundledSeasonRows(season);
  }

  if (rows.length > 0) {
    searchIndex.set(season, { rows, freshUntil: now + INDEX_TTL_MS });
  }
  return rows;
}

function pastFromBundledIndex(
  q: string,
  currentSeason: string,
  excludeIds: Set<string>,
  limit: number
): SearchResult[] {
  const rows: SearchRow[] = getPlayerSearchIndex()
    .filter((row) => row.season !== currentSeason && !excludeIds.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      nameLower: row.nameLower,
      team: currentTeamAbbrForSearch(row.id, nbaTeamAbbr(row.team, row.team)),
      position: null,
      season: row.season,
      minutes: row.minutes,
      careerSpan:
        row.firstSeason && row.firstSeason !== row.season
          ? `${row.firstSeason} → ${row.season}`
          : undefined,
    }));
  return matchRows(rows, q)
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      name: row.name,
      team: row.team,
      position: null,
      season: row.season,
      careerSpan: row.careerSpan ?? `Last ${row.season}`,
      current: false,
    }));
}

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

  current.sort((a, b) => {
    const ap = a.draftProspect ? 1 : 0;
    const bp = b.draftProspect ? 1 : 0;
    if (ap !== bp) return ap - bp;
    return 0;
  });

  const seen = new Set(current.map((r) => r.id));
  const pastReserve = Math.min(3, Math.max(0, limit - 1));
  let pastPool: SearchResult[] = [];
  let universe = "bundled-player-search";

  if (isVercel()) {
    try {
      const { searchMasterPlayers, getMasterPlayerRegistry } = await import(
        "@/data/history/player-universe"
      );
      getMasterPlayerRegistry();
      const fromMaster = searchMasterPlayers(q, { limit: limit * 2 })
        .filter((r) => !seen.has(r.playerId))
        .map((row) => ({
          id: row.playerId,
          name: row.displayName,
          team: "",
          position: null,
          season: row.lastSeason,
          careerSpan: `${row.firstSeason} → ${row.lastSeason}`,
          current: false,
        }));
      if (fromMaster.length > 0) {
        pastPool = fromMaster;
        universe = "provider-season-board+master";
      }
    } catch {
      /* fall through */
    }
  }

  if (pastPool.length === 0) {
    pastPool = pastFromBundledIndex(q, season, seen, limit * 2);
    if (pastPool.length > 0) universe = `${universe}+career-index`;
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
    if (scope === "all" || scope === "career" || scope === "master") {
      const { results, universe } = await searchPrioritized(
        q,
        season,
        RESULT_LIMIT
      );
      return NextResponse.json({
        results,
        season,
        scope: "all",
        universe,
      });
    }

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

    return NextResponse.json({
      results,
      season,
      universe: results.some((r) => r.draftProspect)
        ? "bundled-player-search+draft-class"
        : "bundled-player-search",
    });
  } catch (error) {
    console.error("player search failed", error);
    return NextResponse.json(
      { results: [], season, error: "Search failed" },
      { status: 500 }
    );
  }
}
