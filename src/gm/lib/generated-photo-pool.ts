import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { isFictionalGmPlayer } from "@/gm/lib/player-portrait-ids";

/**
 * Hand-reviewed starting cohort of FLUX.2 Dev fictional player photographs.
 * Paths are immutable across saves. The pool is intentionally small for this
 * first release: everyone without an available slot keeps the SVG portrait.
 */
export const GENERATED_PHOTO_POOL_VERSION = 1;
export const GENERATED_PHOTO_POOL_IDS: readonly string[] = Array.from(
  { length: 50 },
  (_, index) => "v3-" + String(index + 1).padStart(2, "0"),
);
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
 * Persist a unique portrait mapping in the save.
 *
 * Previous reservations stay occupied even if a player retires or is removed
 * from the active player array. This deliberately favors avoiding reused faces
 * over the 50-photo pilot pool's coverage. Save upgrades never rewrite an
 * existing valid portrait assignment. Once more assets are curated, the pool
 * can be expanded without changing any earlier IDs.
 */
export function assignGeneratedPhotoPool(league: GmLeagueState): GmLeagueState {
  const originalReservations = league.portraitPoolReservations ?? {};
  const reservations: Record<string, string> = {};
  const claimed = new Set<string>();

  // First retain existing mappings, sorted to resolve corrupt duplicate claims
  // deterministically. Historical absent-player reservations also remain held.
  for (const playerId of Object.keys(originalReservations).sort()) {
    const portraitId = originalReservations[playerId];
    if (!portraitId || !VALID_PHOTO_IDS.has(portraitId) || claimed.has(portraitId)) continue;
    reservations[playerId] = portraitId;
    claimed.add(portraitId);
  }
  // Old saves may contain player-level portrait IDs but no reservation ledger.
  for (const player of [...league.players].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!isFictionalGmPlayer(player) || !player.identity) continue;
    const portraitId = player.identity.portraitPoolId;
    if (portraitId && VALID_PHOTO_IDS.has(portraitId) && !claimed.has(portraitId)) {
      reservations[player.id] = portraitId;
      claimed.add(portraitId);
    }
  }

  const available = GENERATED_PHOTO_POOL_IDS.filter(id => !claimed.has(id));
  // Selection order only affects newly eligible players; existing mappings
  // remain unchanged. A stable sorted order makes migrations deterministic.
  const draftIds = new Set(league.draftPool);
  const priority = (player: GmPlayer): number =>
    player.teamId === league.userTeamId ? 0
    : player.teamId ? 1
    : draftIds.has(player.id) ? 3 : 2;
  // Make the local team's fictional players visible first in a small pilot
  // pool; distribute remaining slots stably across the rest of the league.
  // Priority affects new allocations only and never rewrites existing saves.
  const awaiting = league.players
    .filter(player => isFictionalGmPlayer(player) && player.identity && !reservations[player.id])
    .sort((a,b) => priority(a) - priority(b) ||
      hashId(a.id) - hashId(b.id) || a.id.localeCompare(b.id));
  for (const player of awaiting) {
    const id = available.shift();
    if (!id) break;
    reservations[player.id] = id;
  }

  const hasLedger = Boolean(league.portraitPoolReservations);
  const isSameLedger = hasLedger &&
    Object.keys(reservations).length === Object.keys(originalReservations).length &&
    Object.entries(reservations).every(([id, slot]) => originalReservations[id] === slot);

  let changed = false;
  const players = league.players.map((player: GmPlayer) => {
    if (!isFictionalGmPlayer(player) || !player.identity) return player;
    const assigned = reservations[player.id];
    if (player.identity.portraitPoolId === assigned) return player;
    changed = true;
    const { portraitPoolId: _old, ...identity } = player.identity;
    return { ...player, identity: assigned ? { ...identity, portraitPoolId: assigned } : identity };
  });

  return !changed && isSameLedger ? league : { ...league, players, portraitPoolReservations: reservations };
}
