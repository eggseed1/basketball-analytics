"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { nbaTeamLogoUrl } from "@/lib/nba-media";

const SIZE_PX = {
  xs: 24,
  sm: 36,
  md: 56,
  lg: 88,
} as const;

export function TeamLogo({
  teamId,
  abbreviation,
  size = "sm",
  className,
}: {
  teamId: string;
  abbreviation: string;
  size?: keyof typeof SIZE_PX;
  className?: string;
}) {
  const px = SIZE_PX[size];
  const src = nbaTeamLogoUrl(teamId);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-medium uppercase text-muted-foreground",
          className
        )}
        style={{ width: px, height: px }}
        aria-hidden
      >
        {abbreviation.slice(0, 3)}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={px}
      height={px}
      className={cn("shrink-0 object-contain", className)}
      onError={() => setFailed(true)}
      unoptimized
    />
  );
}
