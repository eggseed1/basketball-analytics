/**
 * Build award history pages from the baked player-awards snapshot
 * (All-NBA / All-Defense season selections + All-Star career counts).
 * Snapshot lives under public/runtime (ASSETS); call ensurePlayerAwards first
 * on Cloudflare.
 */

import type { AwardHistoryRow } from "@/content/awards/history";
import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { remapLegendNbaIdToBref } from "@/data/runtime/legend-nba-to-bref";
import {
  getBundledPlayerAwardsNameMaps,
  getBundledPlayerAwardsPlayers,
} from "@/data/runtime/player-awards-snapshot";

function displayNameForNbaId(nbaId: string): string {
  const { names } = getBundledPlayerAwardsNameMaps();
  const baked = names[nbaId]?.trim();
  if (baked) return baked;
  const alias = getBundledPlayerIdAliasIndex().byNba.get(nbaId);
  if (alias?.playerName?.trim()) return alias.playerName.trim();
  return `Player ${nbaId}`;
}

function hrefForNbaId(nbaId: string): string {
  const remapped = remapLegendNbaIdToBref(nbaId);
  if (remapped) return `/players/${remapped}`;
  const alias = getBundledPlayerIdAliasIndex().byNba.get(nbaId);
  const espn = alias?.espnPlayerId?.trim();
  if (espn) return `/players/${espn}`;
  const { slugs } = getBundledPlayerAwardsNameMaps();
  const slug = slugs[nbaId]?.trim();
  if (slug) return `/players/bref:${slug}`;
  return `/players/${nbaId}`;
}

/** Season-keyed team awards (All-NBA, All-Defense) — one row per selection. */
export function awardHistoryFromSnapshotDescription(
  description: string
): AwardHistoryRow[] {
  const players = getBundledPlayerAwardsPlayers();
  const rows: AwardHistoryRow[] = [];
  for (const [nbaId, awards] of Object.entries(players)) {
    for (const row of awards) {
      if (!Array.isArray(row) || row[0] !== description) continue;
      const season = String(row[1] ?? "").trim();
      if (!season || !/^\d{4}-\d{2}$/.test(season)) continue;
      const note = row[2] != null ? String(row[2]).trim() : "";
      rows.push({
        season,
        winner: displayNameForNbaId(nbaId),
        href: hrefForNbaId(nbaId),
        ...(note ? { note } : {}),
      });
    }
  }
  return rows.sort((a, b) => {
    const seasonCmp = b.season.localeCompare(a.season);
    if (seasonCmp !== 0) return seasonCmp;
    const noteRank = (note?: string) => {
      if (!note) return 9;
      if (/1st/i.test(note)) return 1;
      if (/2nd/i.test(note)) return 2;
      if (/3rd/i.test(note)) return 3;
      return 5;
    };
    const noteCmp = noteRank(a.note) - noteRank(b.note);
    if (noteCmp !== 0) return noteCmp;
    return a.winner.localeCompare(b.winner);
  });
}

/** All-Star pages: career selection counts. */
export function allStarCareerHistoryFromSnapshot(): AwardHistoryRow[] {
  const players = getBundledPlayerAwardsPlayers();
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
