import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { isFictionalGmPlayer } from "@/gm/lib/player-portrait-ids";

/** Small curated pilot. Expand this count only after assets and curation are shipped. */
export const GM_PHOTO_PORTRAIT_POOL_SIZE = 50;

/** No directory traversal, uncontrolled external URLs, or live image requests. */
export function gmPhotoPortraitPath(id: number | undefined): string | null {
  if (!Number.isInteger(id) || id == null || id < 1 || id > GM_PHOTO_PORTRAIT_POOL_SIZE) return null;
  return "/gm/generated-headshots/" + String(id).padStart(3, "0") + ".jpg";
}

/**
 * Allocate immutable photographic identities, while never allocating the same
 * portrait to two characters in the same save. Historical reservations survive
 * retirement/removal via league.portraitPoolReserved. The 51st+ invented player
 * uses the existing SVG portrait until more curated photos are published.
 *
 * The assignment order prioritizes the human user's team, followed by existing
 * signed players, free agents and draft prospects. No ratings or gameplay RNG
 * are touched. Re-running is idempotent.
 */
export function assignGmPhotoPortraits(league: GmLeagueState): GmLeagueState {
  const taken = new Set<number>((league.portraitPoolReserved ?? [])
    .filter(x => Number.isInteger(x) && x >= 1 && x <= GM_PHOTO_PORTRAIT_POOL_SIZE));
  const owners = new Map<number, string>();
  let changed = !league.portraitPoolReserved;
  const players = league.players.map(p => {
    if (!isFictionalGmPlayer(p) || !p.identity?.portraitPoolId) return p;
    const slot = p.identity.portraitPoolId;
    if (!Number.isInteger(slot) || slot < 1 || slot > GM_PHOTO_PORTRAIT_POOL_SIZE || owners.has(slot)) {
      changed = true;
      return { ...p, identity: { ...p.identity, portraitPoolId: undefined } };
    }
    owners.set(slot,p.id);
    taken.add(slot);
    return p;
  });
  // Preserve existing player slots and never recycle an existing historical slot.
  const eligible = players
    .filter(p => isFictionalGmPlayer(p) && p.identity && !p.identity.portraitPoolId)
    .sort((a,b) => {
      const priority = (p:GmPlayer) => p.teamId === league.userTeamId ? 0
        : p.teamId ? 1 : league.draftPool.includes(p.id) ? 3 : 2;
      return priority(a)-priority(b) || a.id.localeCompare(b.id);
    });
  const assignments = new Map<string,number>();
  for (const player of eligible) {
    let slot = 1;
    while(slot <= GM_PHOTO_PORTRAIT_POOL_SIZE && taken.has(slot)) slot++;
    if(slot > GM_PHOTO_PORTRAIT_POOL_SIZE) break;
    taken.add(slot);
    assignments.set(player.id,slot);
    changed=true;
  }
  if (!changed) return league;
  return {
    ...league,
    portraitPoolReserved:[...taken].sort((a,b)=>a-b),
    players: players.map(p => {
      const slot=assignments.get(p.id);
      return slot && p.identity ? {...p,identity:{...p.identity,portraitPoolId:slot}}:p;
    }),
  };
}
