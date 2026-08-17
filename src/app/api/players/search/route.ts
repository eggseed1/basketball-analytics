import { NextResponse } from "next/server";

import { getPlayersBySeason } from "@/data/queries";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import { defaultCanonicalSeasons } from "@/data/providers/nba/season";

export const dynamic = "force-dynamic";

type SearchRow = {
  id: string;
  name: string;
  nameLower: string;
  team: string;
  position: string | null;
  season: string;
  minutes: number;
};

type IndexEntry = {
  freshUntil: number;
  rows: SearchRow[];
};

const searchIndex = new Map<string, IndexEntry>();
const INDEX_TTL_MS = 10 * 60 * 1000;

async function getSearchIndex(season: string): Promise<SearchRow[]> {
  const now = Date.now();
  const cached = searchIndex.get(season);
  if (cached && cached.freshUntil > now && cached.rows.length > 0) {
    return cached.rows;
  }
  const seasonRows = await getPlayersBySeason(season);
  const rows = seasonRows.map((row) => ({
    id: row.playerId,
    name: row.playerName,
    nameLower: row.playerName.toLowerCase(),
    team: nbaTeamAbbr(row.teamId, row.teamAbbreviation),
    position: row.position ?? null,
    season: row.season,
    minutes: row.minutes,
  }));
  if (rows.length > 0) {
    searchIndex.set(season, { rows, freshUntil: now + INDEX_TTL_MS });
  }
  return rows;
}

/**
 * Lightweight player name search for the global header combobox.
 * GET /api/players/search?q=jokic&season=2024-25
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const season =
    searchParams.get("season")?.trim() || defaultCanonicalSeasons(1)[0];

  if (q.length < 1) {
    return NextResponse.json({ results: [], season });
  }

  try {
    const rows = await getSearchIndex(season);
    const results = rows
      .filter((row) => {
        const id = row.id.toLowerCase();
        return row.nameLower.includes(q) || id === q || id.startsWith(q);
      })
      .sort((a, b) => {
        const aStarts = a.nameLower.startsWith(q) ? 0 : 1;
        const bStarts = b.nameLower.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return b.minutes - a.minutes;
      })
      .slice(0, 10)
      .map((row) => ({
        id: row.id,
        name: row.name,
        team: row.team,
        position: row.position,
        season: row.season,
      }));

    return NextResponse.json({ results, season });
  } catch (error) {
    console.error("player search failed", error);
    return NextResponse.json(
      { results: [], season, error: "Search failed" },
      { status: 500 }
    );
  }
}
