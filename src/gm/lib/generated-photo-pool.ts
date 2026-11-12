import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { isFictionalGmPlayer } from "@/gm/lib/player-portrait-ids";
import { GM_PHOTO_POOL_CATALOG } from "@/gm/lib/generated-photo-pool-catalog";
import { generatedPhotoCastingScore } from "@/gm/lib/generated-photo-appearance";

/**
 * Hand-reviewed starting cohort of FLUX.2 Dev fictional player photographs.
 * Paths are immutable across saves. The pool is intentionally small for this
 * first release: everyone without an available slot keeps the SVG portrait.
 */
export const GENERATED_PHOTO_POOL_VERSION = 1;
export const GENERATED_PHOTO_POOL_IDS: readonly string[] = GM_PHOTO_POOL_CATALOG;
const VALID_PHOTO_IDS = new Set(GENERATED_PHOTO_POOL_IDS);

export function generatedPhotoUrl(portraitId: string | null | undefined): string | null {
  if (!portraitId || !VALID_PHOTO_IDS.has(portraitId)) return null;
  return "/gm/portraits/" + portraitId + ".webp";
}

export function generatedPhotoJerseyMaskUrl(portraitId: string | null | undefined): string | null {
  if (!portraitId || !VALID_PHOTO_IDS.has(portraitId)) return null;
  return "/gm/portraits/" + portraitId + "-jersey-mask.webp";
}

/** Cosmetic hash only; this function must never consume gameplay RNG. */
function hashId(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

/**
 * Assign a fictional portrait by the player's already-saved biography and
 * naming background. Use source-prompt casting tags (not face recognition).
 * Country is citizenship/birthplace, not ancestry: multicultural countries
 * intentionally have multiple compatible visual styles.
 *
 * Old saves keep names, countries, skills, and all existing compatible faces.
 * A visibly mismatched old face is replaced once with a compatible unclaimed
 * image, or the illustrated fallback when no compatible photo is available.
 * Historical retired-player reservations always remain taken.
 */
export function assignGeneratedPhotoPool(league: GmLeagueState): GmLeagueState {
  const oldReservations = league.portraitPoolReservations ?? {};
  const reservations: Record<string, string> = {};
  const claimed = new Set<string>();
  const active = new Map(league.players
    .filter(p => isFictionalGmPlayer(p) && p.identity)
    .map(p => [p.id, p]));

  // Historical claims stay immutable. Active claims survive only when the
  // photographic casting is coherent with the player's saved identity.
  for (const playerId of Object.keys(oldReservations).sort()) {
    const photo = oldReservations[playerId];
    if (!photo || !VALID_PHOTO_IDS.has(photo) || claimed.has(photo)) continue;
    const player = active.get(playerId);
    if (player && generatedPhotoCastingScore(player, photo) <= 0) continue;
    reservations[playerId] = photo;
    claimed.add(photo);
  }
  // Old saves sometimes stored portraitPoolId without a reservation ledger.
  for (const player of [...active.values()].sort((a,b) => a.id.localeCompare(b.id))) {
    if (reservations[player.id]) continue;
    const photo = player.identity?.portraitPoolId;
    if (!photo || !VALID_PHOTO_IDS.has(photo) || claimed.has(photo)) continue;
    if (generatedPhotoCastingScore(player, photo) <= 0) continue;
    reservations[player.id] = photo;
    claimed.add(photo);
  }

  const remaining = GENERATED_PHOTO_POOL_IDS.filter(photo => !claimed.has(photo));
  const draftIds = new Set(league.draftPool);
  const priority = (player: GmPlayer): number =>
    player.teamId === league.userTeamId ? 0
      : player.teamId ? 1 : draftIds.has(player.id) ? 3 : 2;
  const compatibleCount = (player: GmPlayer): number =>
    GENERATED_PHOTO_POOL_IDS.reduce((n, id) => n + Number(generatedPhotoCastingScore(player,id)>0), 0);
  // Within each roster priority, serve rarer cultural backgrounds before the
  // broad US/Canada pool. This reduces competition for small image groups.
  const awaiting = [...active.values()].filter(p => !reservations[p.id])
    .sort((a,b) => priority(a)-priority(b) ||
      compatibleCount(a)-compatibleCount(b) ||
      hashId(a.id)-hashId(b.id) || a.id.localeCompare(b.id));

  for (const player of awaiting) {
    let bestIndex = -1, bestScore = 0, bestHash = 0xffffffff;
    for (let i=0; i<remaining.length; i++) {
      const photo = remaining[i]!;
      const score = generatedPhotoCastingScore(player, photo);
      if (score <= 0) continue;
      const tie = hashId(player.id + "|" + photo);
      if (score > bestScore || (score === bestScore && tie < bestHash)) {
        bestIndex=i; bestScore=score; bestHash=tie;
      }
    }
    if (bestIndex < 0) continue;
    const photo = remaining.splice(bestIndex,1)[0]!;
    reservations[player.id]=photo;
  }

  const sameLedger = Boolean(league.portraitPoolReservations) &&
    Object.keys(reservations).length === Object.keys(oldReservations).length &&
    Object.entries(reservations).every(([id,photo]) => oldReservations[id] === photo);
  let changed = false;
  const players = league.players.map(player => {
    if (!isFictionalGmPlayer(player) || !player.identity) return player;
    const assigned = reservations[player.id];
    if (player.identity.portraitPoolId === assigned) return player;
    changed = true;
    const { portraitPoolId: _previous, ...identity } = player.identity;
    return { ...player, identity: assigned ? {...identity,portraitPoolId:assigned}:identity };
  });
  return !changed && sameLedger ? league :
    { ...league, players, portraitPoolReservations: reservations };
}
