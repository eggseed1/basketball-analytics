"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { resolveTeamBrand, teamLogoUrl } from "@/lib/nba-brand";

type Size = "2xs" | "xs" | "sm" | "md" | "lg" | "xl";

const PX: Record<Size, number> = {
  "2xs": 14,
  xs: 20,
  sm: 28,
  md: 40,
  lg: 64,
  xl: 96,
};

export function TeamLogo({
  teamKey,
  size = "sm",
  className,
  priority = false,
}: {
  teamKey?: string | null;
  size?: Size;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const brand = resolveTeamBrand(teamKey);
  const src = teamLogoUrl(teamKey);
  const px = PX[size];

  if (!src || failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight text-[0.65em] font-bold text-white",
          className
        )}
        style={{
          width: px,
          height: px,
          background: brand?.primary ?? "var(--court-navy)",
        }}
        aria-hidden
      >
        {(brand?.abbr ?? teamKey ?? "?").toString().slice(0, 3).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={px}
      height={px}
      priority={priority}
      className={cn("shrink-0 object-contain", className)}
      onError={() => setFailed(true)}
      unoptimized
    />
  );
}
