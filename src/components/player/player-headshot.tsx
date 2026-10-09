"use client";

import Image from "next/image";
import { useState } from "react";

import { cdnImageProps } from "@/lib/cdn-image";
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
        data-avatar={size}
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
      {...cdnImageProps(src)}
      alt=""
      width={Math.ceil(px * 1.4)}
      height={px}
      data-avatar={size}
      className={cn(
        "shrink-0 rounded-full bg-muted object-cover object-top",
        className
      )}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
