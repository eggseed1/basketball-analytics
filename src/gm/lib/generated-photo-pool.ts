import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { isFictionalGmPlayer } from "@/gm/lib/player-portrait-ids";
import { GM_PHOTO_POOL_CATALOG } from "@/gm/lib/generated-photo-pool-catalog";
import { GENERATED_PHOTO_CASTING, generatedPhotoCastingScore, type PhotoCastingStyle } from "@/gm/lib/generated-photo-appearance";

/**
 * Hand-reviewed FLUX.2 Dev fictional player photographs. Asset paths are
 * immutable. Matching photo reuse is allowed only after the unique identities
 * are depleted: a real photograph always wins over obsolete illustrated art.
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
 * Old saves keep names, countries, skills, and compatible photos. Retired
 * mappings remain in history but no longer permanently consume a current
 * player's slot. When all suitable unique photos are claimed, reuse the least
 * frequently used compatible photograph; do not revert to illustrated faces.
 */
export function assignGeneratedPhotoPool(league: GmLeagueState): GmLeagueState {
  const oldReservations = league.portraitPoolReservations ?? {};
  const reservations: Record<string, string> = {};
  const claimed = new Set<string>();
  const active = new Map(league.players
    .filter(p => isFictionalGmPlayer(p) && p.identity)
    .map(p => [p.id, p]));
  // Cache the seven art-direction scores per player. Never repeat surname
  // matching hundreds of times inside the roster sort on mobile devices.
  const representative = new Map<PhotoCastingStyle, string>();
  const styleCounts = new Map<PhotoCastingStyle, number>();
  for (const photo of GENERATED_PHOTO_POOL_IDS) {
    const style = GENERATED_PHOTO_CASTING[photo];
    if (!style) continue;
    if (!representative.has(style)) representative.set(style, photo);
    styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
  }
  const affinities = new Map([...active.values()].map(player => {
    const scores = new Map<PhotoCastingStyle, number>();
    for (const [style, sample] of representative) {
      scores.set(style, generatedPhotoCastingScore(player, sample));
    }
    return [player.id, scores] as const;
  }));
  const scoreFor = (player: GmPlayer, photo: string): number => {
    const style = GENERATED_PHOTO_CASTING[photo];
    return style ? (affinities.get(player.id)?.get(style) ?? 0) : 0;
  };
  const matchCounts = new Map([...active.values()].map(player => [
    player.id,
    [...styleCounts].reduce((sum, [style, count]) =>
      (affinities.get(player.id)?.get(style) ?? 0) > 0 ? sum + count : sum, 0),
  ] as const));


  // Keep retired mappings in the ledger for historic identity, but only
  // active player claims occupy unique photographic slots.
  for (const playerId of Object.keys(oldReservations).sort()) {
    const photo = oldReservations[playerId];
    if (!photo || !VALID_PHOTO_IDS.has(photo)) continue;
    const player = active.get(playerId);
    if (!player) {
      reservations[playerId] = photo;
      continue;
    }
    if (scoreFor(player, photo) <= 0) continue;
    if (claimed.has(photo) && GENERATED_PHOTO_POOL_IDS.some(candidate =>
      !claimed.has(candidate) && scoreFor(player, candidate) > 0)) continue;
    reservations[playerId] = photo;
    claimed.add(photo);
  }
  // Old saves sometimes stored portraitPoolId without a reservation ledger.
  for (const player of [...active.values()].sort((a,b) => a.id.localeCompare(b.id))) {
    if (reservations[player.id]) continue;
    const photo = player.identity?.portraitPoolId;
    if (!photo || !VALID_PHOTO_IDS.has(photo)) continue;
    if (scoreFor(player, photo) <= 0) continue;
    if (claimed.has(photo) && GENERATED_PHOTO_POOL_IDS.some(candidate =>
      !claimed.has(candidate) && scoreFor(player, candidate) > 0)) continue;
    reservations[player.id] = photo;
    claimed.add(photo);
  }

  const remaining = GENERATED_PHOTO_POOL_IDS.filter(photo => !claimed.has(photo));
  const draftIds = new Set(league.draftPool);
  const priority = (player: GmPlayer): number =>
    player.teamId === league.userTeamId ? 0
      : player.teamId ? 1 : draftIds.has(player.id) ? 3 : 2;
  const compatibleCount = (player: GmPlayer): number => matchCounts.get(player.id) ?? 0;
  // Within each roster priority, serve rarer cultural backgrounds before the
  // broad US/Canada pool. This reduces competition for small image groups.
  const awaiting = [...active.values()].filter(p => !reservations[p.id])
    .sort((a,b) => priority(a)-priority(b) ||
      compatibleCount(a)-compatibleCount(b) ||
      hashId(a.id)-hashId(b.id) || a.id.localeCompare(b.id));

  const usage = new Map<string, number>();
  for (const player of active.values()) {
    const photo = reservations[player.id];
    if (photo) usage.set(photo, (usage.get(photo) ?? 0) + 1);
  }
  for (const player of awaiting) {
    let bestIndex = -1, bestScore = 0, bestHash = 0xffffffff;
    for (let i=0; i<remaining.length; i++) {
      const photo = remaining[i]!;
      const score = scoreFor(player, photo);
      if (score <= 0) continue;
      const tie = hashId(player.id + "|" + photo);
      if (score > bestScore || (score === bestScore && tie < bestHash)) {
        bestIndex=i; bestScore=score; bestHash=tie;
      }
    }
    if (bestIndex >= 0) {
      const photo = remaining.splice(bestIndex,1)[0]!;
      reservations[player.id] = photo;
      usage.set(photo, 1);
      continue;
    }
    // Capacity or a rare casting group can run out long before season 10.
    // Reuse the *least-used* compatible photo rather than showing old SVG art.
    let bestPhoto: string | undefined;
    let fewest = Infinity;
    bestScore = -1;
    bestHash = 0xffffffff;
    for (const photo of GENERATED_PHOTO_POOL_IDS) {
      const score = scoreFor(player, photo);
      if (score <= 0) continue;
      const count = usage.get(photo) ?? 0;
      const tie = hashId(player.id + "|" + photo);
      if (count < fewest || (count === fewest && (score > bestScore ||
          (score === bestScore && tie < bestHash)))) {
        bestPhoto = photo; fewest = count; bestScore = score; bestHash = tie;
      }
    }
    // A malformed legacy international identity may not match any prompt.
    // Use a neutral/mixed photographic source rather than an illustration.
    const photo = bestPhoto ?? GENERATED_PHOTO_POOL_IDS.find(id =>
      GENERATED_PHOTO_CASTING[id] === "mixed") ?? GENERATED_PHOTO_POOL_IDS[0]!;
    reservations[player.id] = photo;
    usage.set(photo, (usage.get(photo) ?? 0) + 1);
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
