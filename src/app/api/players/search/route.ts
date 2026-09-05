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
import {
  awardWinnerIdForQuery,
  awardWinnerSortRank,
} from "@/data/runtime/awards-search-boost";
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
/** Compare / career search — room for legends among common last names. */
const ALL_SCOPE_LIMIT = 24;
const isVercel = () => process.env.VERCEL === "1";

function normalizeSearchText(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Initials from name tokens, e.g. "shai gilgeous alexander" → "sga". */
function nameInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t[0]!)
    .join("");
}

/**
 * Lower is better. 0–8 match; 9 = no match.
 * Supports last-name-first, multi-token ("shai gil"), and initials ("sga").
 */
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
  const qTokens = query.split(/\s+/).filter(Boolean);

  if (last === query) return 2;
  if (name.startsWith(query)) return 3;
  if (first === query || first.startsWith(query)) return 4;
  if (last.startsWith(query)) return 5;

  // Multi-token: every query token prefixes some name token (order-flexible).
  if (qTokens.length > 1) {
    const unused = [...tokens];
    let allHit = true;
    for (const qt of qTokens) {
      const idx = unused.findIndex((t) => t === qt || t.startsWith(qt));
      if (idx < 0) {
        allHit = false;
        break;
      }
      unused.splice(idx, 1);
    }
    if (allHit) return 3;
  }

  // Initials: "sga", "lj", "kd" (2–4 letters, single token).
  const compactQ = query.replace(/\s+/g, "");
  if (
    qTokens.length === 1 &&
    compactQ.length >= 2 &&
    compactQ.length <= 4 &&
    /^[a-z]+$/.test(compactQ)
  ) {
    const initials = nameInitials(name);
    if (initials === compactQ) return 2;
    if (initials.startsWith(compactQ)) return 4;
  }

  if (tokens.some((t) => t.startsWith(query))) return 6;
  if (name.includes(query)) return 7;
  if (idNorm.startsWith(query) || id.toLowerCase().startsWith(q)) return 8;
  return 9;
}

/** Exact award/legend full-name hit → preferred route id (when query is full name). */
function awardExactIdForQuery(q: string): string | null {
  return awardWinnerIdForQuery(q);
}

function lastNameOf(nameLower: string): string {
  const tokens = normalizeSearchText(nameLower).split(/\s+/).filter(Boolean);
  return tokens[tokens.length - 1] ?? nameLower;
}

function matchRows(rows: SearchRow[], q: string): SearchRow[] {
  const awardExactId = awardExactIdForQuery(q);
  return rows
    .filter((row) => matchQuality(row.nameLower, row.id.toLowerCase(), q) < 9)
    .sort((a, b) => {
      if (awardExactId) {
        const aHit =
          a.id === awardExactId ||
          a.id.toLowerCase() === awardExactId.toLowerCase();
        const bHit =
          b.id === awardExactId ||
          b.id.toLowerCase() === awardExactId.toLowerCase();
        if (aHit !== bHit) return aHit ? -1 : 1;
      }
      const aq = matchQuality(a.nameLower, a.id.toLowerCase(), q);
      const bq = matchQuality(b.nameLower, b.id.toLowerCase(), q);
      if (aq !== bq) return aq - bq;
      // Exact last-name + award/legend beats first-name board noise.
      const qNorm = normalizeSearchText(q);
      const aLastExact = lastNameOf(a.nameLower) === qNorm ? 0 : 1;
      const bLastExact = lastNameOf(b.nameLower) === qNorm ? 0 : 1;
      if (aLastExact !== bLastExact) return aLastExact - bLastExact;
      const aa = awardWinnerSortRank(a.name);
      const ba = awardWinnerSortRank(b.name);
      if (aa !== ba) return aa - ba;
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
  _currentSeason: string,
  excludeIds: Set<string>,
  limit: number
): SearchResult[] {
  void _currentSeason;
  // Search the full career index; callers dedupe by id against the season board.
  // Do not exclude `currentSeason` — that hid every active player when the board
  // merge mistakenly dropped current hits (and when the clock season is empty).
  const rows: SearchRow[] = getPlayerSearchIndex()
    .filter((row) => !excludeIds.has(row.id))
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

/**
 * Prefer a season that actually has a baked board. Calendar can flip to the next
 * league year (e.g. 2026-27 in Aug) before the snapshot catches up.
 */
function resolveSearchSeason(requested?: string | null): string {
  const preferred =
    requested?.trim() || defaultCanonicalSeasons(1)[0] || "2025-26";
  if (getPlayerSearchIndexForSeason(preferred).length > 0) return preferred;

  for (const season of defaultCanonicalSeasons(6)) {
    if (getPlayerSearchIndexForSeason(season).length > 0) return season;
  }

  // Last resort: newest season present in the career index.
  let best = preferred;
  for (const row of getPlayerSearchIndex()) {
    if (row.season && row.season > best) best = row.season;
  }
  return best;
}

async function searchPrioritized(
  q: string,
  season: string,
  limit: number
): Promise<{ results: SearchResult[]; universe: string }> {
  const boardSeason = resolveSearchSeason(season);
  const currentRows = matchRows(await getSearchIndex(boardSeason), q);
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

  // Ids already chosen for the response — start empty so current hits are kept.
  const seen = new Set<string>();
  const currentIds = new Set(current.map((r) => r.id));
  const pastReserve = Math.min(4, Math.max(0, limit - 1));
  let pastPool: SearchResult[] = [];
  let universe = "bundled-player-search";

  if (isVercel()) {
    try {
      const { searchMasterPlayers, getMasterPlayerRegistry } = await import(
        "@/data/history/player-universe"
      );
      getMasterPlayerRegistry();
      const fromMaster = searchMasterPlayers(q, { limit: limit * 2 })
        .filter((r) => !currentIds.has(r.playerId))
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
    pastPool = pastFromBundledIndex(q, boardSeason, currentIds, limit * 2);
    if (pastPool.length > 0) universe = `${universe}+career-index`;
  }

  if (current.some((r) => r.draftProspect)) {
    universe = `${universe}+draft-class`;
  }

  const awardExactId = awardExactIdForQuery(q);
  // Pull award/legend matches to the front of the past pool so they claim
  // reserved slots ahead of weak same-first-name modern board hits.
  pastPool.sort((a, b) => {
    if (awardExactId) {
      const aHit =
        a.id === awardExactId ||
        a.id.toLowerCase() === awardExactId.toLowerCase() ||
        normalizeSearchText(a.name) === normalizeSearchText(q);
      const bHit =
        b.id === awardExactId ||
        b.id.toLowerCase() === awardExactId.toLowerCase() ||
        normalizeSearchText(b.name) === normalizeSearchText(q);
      if (aHit !== bHit) return aHit ? -1 : 1;
    }
    const aq = matchQuality(a.name.toLowerCase(), a.id.toLowerCase(), q);
    const bq = matchQuality(b.name.toLowerCase(), b.id.toLowerCase(), q);
    if (aq !== bq) return aq - bq;
    const qNorm = normalizeSearchText(q);
    const aLastExact = lastNameOf(a.name.toLowerCase()) === qNorm ? 0 : 1;
    const bLastExact = lastNameOf(b.name.toLowerCase()) === qNorm ? 0 : 1;
    if (aLastExact !== bLastExact) return aLastExact - bLastExact;
    return awardWinnerSortRank(a.name) - awardWinnerSortRank(b.name);
  });

  const awardPast = pastPool.filter((r) => awardWinnerSortRank(r.name) === 0);
  const awardFront = awardPast.slice(0, Math.min(6, limit));
  for (const row of awardFront) seen.add(row.id);

  // Ensure exact award full-name is always reserved (id may be bref: while index uses ESPN/NBA id).
  if (awardExactId || normalizeSearchText(q).includes(" ")) {
    const qNorm = normalizeSearchText(q);
    const already = awardFront.some(
      (row) =>
        row.id === awardExactId ||
        row.id.toLowerCase() === String(awardExactId ?? "").toLowerCase() ||
        normalizeSearchText(row.name) === qNorm
    );
    if (!already) {
      const fromIndex = getPlayerSearchIndex().find((row) => {
        if (
          awardExactId &&
          (row.id === awardExactId ||
            row.id.toLowerCase() === awardExactId.toLowerCase())
        ) {
          return true;
        }
        return normalizeSearchText(row.name) === qNorm;
      });
      if (fromIndex && !seen.has(fromIndex.id) && !currentIds.has(fromIndex.id)) {
        awardFront.unshift({
          id: fromIndex.id,
          name: fromIndex.name,
          team: fromIndex.team,
          position: null,
          season: fromIndex.season,
          careerSpan: fromIndex.firstSeason
            ? `${fromIndex.firstSeason} → ${fromIndex.season}`
            : `Last ${fromIndex.season}`,
          current: false,
        });
        seen.add(fromIndex.id);
      }
    }
  }

  const currentCap =
    pastPool.length > 0 || awardFront.length > 0
      ? Math.min(
          current.length,
          Math.max(1, limit - Math.max(pastReserve, awardFront.length))
        )
      : limit;
  // Current board hits — only skip ids already claimed by awardFront.
  const currentTake = current
    .filter((r) => !seen.has(r.id))
    .slice(0, currentCap);
  for (const row of currentTake) seen.add(row.id);

  const pastTake = pastPool
    .filter((r) => !seen.has(r.id))
    .slice(0, limit - awardFront.length - currentTake.length);

  const merged = [...awardFront, ...currentTake, ...pastTake].slice(0, limit);
  // Final pass: keep award winners ahead when match quality ties.
  merged.sort((a, b) => {
    const aq = matchQuality(a.name.toLowerCase(), a.id.toLowerCase(), q);
    const bq = matchQuality(b.name.toLowerCase(), b.id.toLowerCase(), q);
    if (aq !== bq) return aq - bq;
    return awardWinnerSortRank(a.name) - awardWinnerSortRank(b.name);
  });

  return {
    results: merged.slice(0, limit),
    universe,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const season = resolveSearchSeason(searchParams.get("season"));
  const scope = (searchParams.get("scope") ?? "season").toLowerCase();

  if (q.length < 1) {
    return NextResponse.json({ results: [], season });
  }

  try {
    if (scope === "all" || scope === "career" || scope === "master") {
      const { results, universe } = await searchPrioritized(
        q,
        season,
        ALL_SCOPE_LIMIT
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
