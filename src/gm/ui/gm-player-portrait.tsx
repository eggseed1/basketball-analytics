"use client";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { displayPlayerName } from "@/gm/lib/selectors";
import type { GmPlayer } from "@/gm/types";

/**
 * Franchise saves contain both real NBA players and invented future rookies.
 * Never send a generated simulation id to the NBA/ESPN portrait lookup:
 * numeric collisions could show an unrelated real player's face.
 * The site's headshot component supplies a branded initials fallback.
 */
export function GmPlayerPortrait({
  player,
  size = "xs",
  priority = false,
  className,
}: {
  player: GmPlayer;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  priority?: boolean;
  className?: string;
}) {
  const realId = player.nbaPlayerId?.trim() || undefined;
  // Older real-player saves may retain an ESPN id but no NBA crosswalk.
  const entryId = player.nbaSeason && /^\d+$/.test(player.id) ? player.id : undefined;
  return (
    <PlayerHeadshot
      playerId={realId ?? entryId}
      nbaId={realId}
      name={displayPlayerName(player)}
      teamKey={player.teamId}
      size={size}
      priority={priority}
      className={className}
    />
  );
}
