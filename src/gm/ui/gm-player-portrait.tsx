"use client";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { displayPlayerName } from "@/gm/lib/selectors";
import { gmPlayerPortraitIds } from "@/gm/lib/player-portrait-ids";
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
  const ids = gmPlayerPortraitIds(player);
  return (
    <PlayerHeadshot
      playerId={ids.playerId}
      nbaId={ids.nbaId}
      name={displayPlayerName(player)}
      teamKey={player.teamId}
      size={size}
      priority={priority}
      className={className}
    />
  );
}
