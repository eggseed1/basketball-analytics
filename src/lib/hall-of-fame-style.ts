import type { PlayerAccoladeBadge } from "@/data/queries/player-awards";
import { HOF_HISTORY } from "@/content/awards/history";
import { remapLegendNbaIdToBref } from "@/data/runtime/legend-nba-to-bref";

export const HOF_OUTLINE_CLASS = "hof-outline";
export const HOF_PAGE_FRAME_CLASS = "hof-page-frame";

/**
 * NBA person ids that collide with unrelated ESPN athletes on CF routes —
 * keep both the public route id and the remapped bref slug as HOF keys.
 */
const HOF_ROUTE_ALIASES: Record<string, string[]> = {
  "893": ["bref:jordami01"],
  "787": ["bref:barklch01"],
  "708": ["bref:garneke01", "1563", "261"],
  // 1712 is Antawn Jamison — never alias Billups onto that PERSON_ID.
  "1497": ["bref:billuch01", "63"],
};

/** Player route ids from curated HOF history (ESPN / NBA ids in href). */
const HOF_PLAYER_IDS: Set<string> = (() => {
  const ids = new Set<string>();
  for (const row of HOF_HISTORY) {
    const href = row.href?.trim();
    if (!href) continue;
    const match = /^\/players\/([^/?#]+)/.exec(href);
    if (!match?.[1]) continue;
    const id = match[1];
    ids.add(id);
    for (const alias of HOF_ROUTE_ALIASES[id] ?? []) ids.add(alias);
    const remapped = remapLegendNbaIdToBref(id);
    if (remapped) ids.add(remapped);
  }
  for (const [nbaId, aliases] of Object.entries(HOF_ROUTE_ALIASES)) {
    ids.add(nbaId);
    for (const alias of aliases) ids.add(alias);
  }
  return ids;
})();

export function isHallOfFamePlayer(
  badges: Pick<PlayerAccoladeBadge, "award">[]
): boolean {
  return badges.some((badge) => badge.award.id === "hof");
}

/** Sync HOF check from curated history + optional related identity ids. */
export function isHallOfFamePlayerId(
  ...ids: Array<string | null | undefined>
): boolean {
  for (const id of ids) {
    const key = String(id ?? "").trim();
    if (!key) continue;
    if (HOF_PLAYER_IDS.has(key)) return true;
    try {
      const decoded = decodeURIComponent(key);
      if (decoded !== key && HOF_PLAYER_IDS.has(decoded)) return true;
    } catch {
      /* keep */
    }
  }
  return false;
}
