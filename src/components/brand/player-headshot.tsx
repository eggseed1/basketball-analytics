"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { playerHeadshotCandidates, resolveTeamBrand } from "@/lib/nba-brand";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const PX: Record<Size, number> = {
  xs: 28,
  sm: 36,
  md: 56,
  lg: 96,
  xl: 140,
};

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function PlayerHeadshot({
  playerId,
  espnId,
  nbaId,
  name,
  teamKey,
  size = "sm",
  className,
  priority = false,
}: {
  /** Primary / route id (ESPN athlete or NBA person). */
  playerId?: string | null;
  espnId?: string | null;
  /** NBA.com person id - used for cdn.nba.com headshots (DARKO). */
  nbaId?: string | null;
  name?: string | null;
  teamKey?: string | null;
  size?: Size;
  className?: string;
  priority?: boolean;
}) {
  const candidates = useMemo(
    () => playerHeadshotCandidates({ playerId, espnId, nbaId }),
    [playerId, espnId, nbaId]
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [playerId, espnId, nbaId]);

  const src = candidates[index];
  const brand = resolveTeamBrand(teamKey);
  const px = PX[size];

  if (!src) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide text-white ring-2 ring-white/80",
          className
        )}
        style={{
          width: px,
          height: px,
          fontSize: Math.max(10, px * 0.32),
          background: `linear-gradient(145deg, ${brand?.primary ?? "#0b1f3a"}, ${brand?.secondary ?? "#e85d04"})`,
        }}
        aria-hidden
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-white/90",
        className
      )}
      style={{
        width: px,
        height: px,
        boxShadow: brand ? `0 0 0 2px ${brand.primary}` : undefined,
      }}
    >
      <Image
        key={src}
        src={src}
        alt={name ? `${name} headshot` : ""}
        width={px}
        height={px}
        priority={priority}
        className="object-cover object-top"
        onError={() => {
          setIndex((i) => {
            if (i + 1 < candidates.length) return i + 1;
            return candidates.length; // past end → initials
          });
        }}
        unoptimized
      />
    </span>
  );
}
