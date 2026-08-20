"use client";

import Image from "next/image";
import { useState } from "react";

import { resolvePlayerPortraitCandidates } from "@/lib/player-media-resolve";
import { playerInitials } from "@/lib/nba-media";
import { cn } from "@/lib/utils";

const SIZE_PX = {
  xs: 28,
  sm: 40,
  md: 64,
  lg: 112,
} as const;

export function PlayerHeadshot({
  playerId,
  name,
  size = "sm",
  className,
}: {
  playerId: string;
  name: string;
  size?: keyof typeof SIZE_PX;
  className?: string;
}) {
  const px = SIZE_PX[size];
  // NBA-person-id surface (dashboard/home) — never fall through to ESPN namespace.
  const candidates = resolvePlayerPortraitCandidates({
    playerId,
    nbaId: /^\d+$/.test(playerId) ? playerId : null,
    role: "PLAYER",
  });
  const src = candidates[0] ?? null;
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground",
          className
        )}
        style={{ width: px, height: px, fontSize: Math.max(10, px * 0.32) }}
        aria-hidden
      >
        {playerInitials(name)}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={name ? name : ""}
      width={px}
      height={px}
      className={cn(
        "shrink-0 rounded-full bg-muted object-cover object-top",
        className
      )}
      onError={() => setFailed(true)}
      unoptimized
      loading="lazy"
    />
  );
}
