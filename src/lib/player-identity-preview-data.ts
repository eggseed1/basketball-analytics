/**
 * Client-safe lookups for player identity hover cards (no network).
 */
import {
  matchAwardDefinition,
  type AwardDefinition,
} from "@/content/awards/catalog";
import { nbaPersonIdFromPlayerRoute } from "@/data/runtime/legend-nba-to-bref";
import {
  getBundledPlayerAwardsRaw,
  hasBundledPlayerAwards,
} from "@/data/runtime/player-awards-snapshot";
import {
  getPlayerSearchIndex,
  type PlayerSearchIndexRow,
} from "@/data/runtime/player-search-snapshot";

let byIdCache: Map<string, PlayerSearchIndexRow> | null = null;

function searchById(): Map<string, PlayerSearchIndexRow> {
  if (byIdCache) return byIdCache;
  const map = new Map<string, PlayerSearchIndexRow>();
  for (const row of getPlayerSearchIndex()) {
    if (!map.has(row.id)) map.set(row.id, row);
    const lower = row.id.toLowerCase();
    if (!map.has(lower)) map.set(lower, row);
  }
  byIdCache = map;
  return map;
}

export function lookupPlayerSearchRow(
  playerId: string | null | undefined
): PlayerSearchIndexRow | null {
  const id = String(playerId ?? "").trim();
  if (!id) return null;
  const map = searchById();
  return map.get(id) ?? map.get(id.toLowerCase()) ?? null;
}

export function careerSpanLabel(row: PlayerSearchIndexRow | null): string | null {
  if (!row) return null;
  if (row.firstSeason && row.season && row.firstSeason !== row.season) {
    return `${row.firstSeason} → ${row.season}`;
  }
  if (row.season) return `Last ${row.season}`;
  return null;
}

type PreviewBadge = {
  award: AwardDefinition;
  count: number;
};

function summarizeBundledAccolades(nbaId: string): PreviewBadge[] {
  const byId = new Map<string, { award: AwardDefinition; seasons: string[] }>();
  for (const row of getBundledPlayerAwardsRaw(nbaId)) {
    const award = matchAwardDefinition(row.description);
    if (!award) continue;
    const entry = byId.get(award.id) ?? { award, seasons: [] };
    if (row.season && !entry.seasons.includes(row.season)) {
      entry.seasons.push(row.season);
    } else if (!row.season && entry.seasons.length === 0) {
      entry.seasons.push("inducted");
    }
    byId.set(award.id, entry);
  }
  return [...byId.values()]
    .map(({ award, seasons }) => ({ award, count: seasons.length }))
    .filter((b) => b.count > 0);
}

function blingLabel(badge: PreviewBadge): string {
  const { award, count } = badge;
  if (award.id === "hof") return "Hall of Fame";
  if (award.id === "all_star") {
    return count > 1 ? `${count}x All Star` : "All Star";
  }
  if (award.id === "champion") {
    return count > 1 ? `${count}x Champ` : "Champ";
  }
  if (award.id === "finals_mvp") {
    return count > 1 ? `${count}x Finals MVP` : "Finals MVP";
  }
  if (award.id === "all_defense") {
    return count > 1 ? `${count}x All-Def` : "All-Def";
  }
  if (award.id === "all_nba") {
    return count > 1 ? `${count}x All-NBA` : "All-NBA";
  }
  return count > 1 ? `${count}x ${award.shortLabel}` : award.shortLabel;
}

export function lookupPlayerPreviewAccolades(
  playerId: string | null | undefined,
  limit = 3
): string[] {
  const nbaId = nbaPersonIdFromPlayerRoute(playerId);
  if (!nbaId || !hasBundledPlayerAwards(nbaId)) return [];
  const badges = summarizeBundledAccolades(nbaId);
  const rank = (id: string) => {
    if (id === "hof") return 0;
    if (id === "all_star") return 1;
    if (id === "mvp") return 2;
    if (id === "finals_mvp") return 3;
    if (id === "champion") return 4;
    return 10;
  };
  return [...badges]
    .sort((a, b) => {
      const ra = rank(a.award.id);
      const rb = rank(b.award.id);
      if (ra !== rb) return ra - rb;
      return a.award.sort - b.award.sort;
    })
    .slice(0, Math.max(0, limit))
    .map(blingLabel);
}
