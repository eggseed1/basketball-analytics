/**
 * Build award history pages from the baked player-awards snapshot
 * (All-NBA / All-Defense season selections + All-Star career counts).
 */

import type { AwardHistoryRow } from "@/content/awards/history";
import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import snapshot from "@/data/runtime/player-awards-snapshot.json";

type AwardsFile = {
  players?: Record<string, Array<[string, string]>>;
};

const data = snapshot as unknown as AwardsFile;
const players =
  data.players && typeof data.players === "object" ? data.players : {};

function displayNameForNbaId(nbaId: string): string {
  const alias = getBundledPlayerIdAliasIndex().byNba.get(nbaId);
  if (alias?.playerName?.trim()) return alias.playerName.trim();
  return `Player ${nbaId}`;
}

function hrefForNbaId(nbaId: string): string {
  const alias = getBundledPlayerIdAliasIndex().byNba.get(nbaId);
  const espn = alias?.espnPlayerId?.trim();
  return `/players/${espn || nbaId}`;
}

/** Season-keyed team awards (All-NBA, All-Defense) — one row per selection. */
export function awardHistoryFromSnapshotDescription(
  description: string
): AwardHistoryRow[] {
  const rows: AwardHistoryRow[] = [];
  for (const [nbaId, awards] of Object.entries(players)) {
    for (const row of awards) {
      if (!Array.isArray(row) || row[0] !== description) continue;
      const season = String(row[1] ?? "").trim();
      // Skip synthetic All-Star placeholders (AS-01 …).
      if (!season || !/^\d{4}-\d{2}$/.test(season)) continue;
      rows.push({
        season,
        winner: displayNameForNbaId(nbaId),
        href: hrefForNbaId(nbaId),
      });
    }
  }
  return rows.sort((a, b) => {
    const seasonCmp = b.season.localeCompare(a.season);
    if (seasonCmp !== 0) return seasonCmp;
    return a.winner.localeCompare(b.winner);
  });
}

/**
 * All-Star pages: career selection counts (BRef bake stores AS-NN placeholders,
 * not calendar seasons).
 */
export function allStarCareerHistoryFromSnapshot(): AwardHistoryRow[] {
  const counts = new Map<string, number>();
  for (const [nbaId, awards] of Object.entries(players)) {
    let n = 0;
    for (const row of awards) {
      if (Array.isArray(row) && row[0] === "NBA All-Star") n += 1;
    }
    if (n > 0) counts.set(nbaId, n);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([nbaId, count]) => ({
      season: `${count}×`,
      winner: displayNameForNbaId(nbaId),
      href: hrefForNbaId(nbaId),
    }));
}
