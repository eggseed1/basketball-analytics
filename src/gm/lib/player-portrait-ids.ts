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
