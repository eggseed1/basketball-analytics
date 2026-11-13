import type { GmPlayer } from "@/gm/types";

/** Only verified league identities may resolve real NBA/ESPN portraits. */
export function gmPlayerPortraitIds(player: GmPlayer): {
  playerId?: string;
  nbaId?: string;
} {
  const nbaId = player.nbaPlayerId?.trim() || undefined;
  // Legacy saves can have a confirmed real NBA season but no NBA crosswalk.
  // The original id can then be used as an ESPN candidate, not an NBA person id.
  const entryId =
    player.nbaSeason && /^\d+$/.test(player.id) ? player.id : undefined;
  return { playerId: nbaId ?? entryId, nbaId };
}

/**
 * Keep generated characters out of live NBA/ESPN image lookups, including
 * legacy generated saves with no portrait metadata yet.
 */
export function isFictionalGmPlayer(player: GmPlayer): boolean {
  // Generated-player identifiers win over stale NBA crosswalk fields found
  // in old/imported saves. Never look up a synthetic ID on ESPN.
  if (player.draftModel === 2 ||
      player.id.startsWith("prospect-") || player.id.startsWith("p_")) return true;
  if (player.nbaPlayerId || player.nbaSeason) return false;
  return Boolean(player.identity);
}
