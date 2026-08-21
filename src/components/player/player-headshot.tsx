"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  nbaPlayerHeadshotUrl,
  playerInitials,
} from "@/lib/nba-media";

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
  const src = nbaPlayerHeadshotUrl(
    playerId,
    size === "lg" || size === "md" ? "large" : "small"
  );
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
      alt=""
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
