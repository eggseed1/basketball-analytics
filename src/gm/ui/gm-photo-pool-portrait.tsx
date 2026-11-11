"use client";

import Image from "next/image";
import { useState } from "react";
import type { GmPlayer } from "@/gm/types";
import { generatedJerseyStyle } from "@/gm/lib/generated-player-jersey";
import {
  generatedPhotoJerseyMaskUrl,
  generatedPhotoUrl,
} from "@/gm/lib/generated-photo-pool";
import { GmGeneratedPortrait } from "@/gm/ui/gm-generated-portrait";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg" | "xl";
const CLASSES: Record<Size, string> = {
  xs: "h-7 w-7", sm: "h-9 w-9", md: "h-14 w-14",
  lg: "h-24 w-24", xl: "h-[8.75rem] w-[8.75rem]",
};
const DIMENSIONS: Record<Size, number> = {
  xs: 28, sm: 36, md: 56, lg: 96, xl: 140,
};

/**
 * Photographic identities are saved by portraitPoolId, not team or season.
 * The source image never changes when a player is traded. A separately
 * generated jersey-only mask tints the uniform to the current team's primary
 * color while preserving highlights, skin, and the original jersey texture.
 *
 * If an asset is unavailable (older release/partial import), we fall back to
 * the existing procedural illustration instead of showing a broken image.
 */
export function GmPhotoPoolPortrait({
  player, name, size = "xs", priority = false, className,
}: {
  player: GmPlayer; name: string; size?: Size; priority?: boolean; className?: string;
}) {
  const portraitId = player.identity?.portraitPoolId;
  const src = generatedPhotoUrl(portraitId);
  const mask = generatedPhotoJerseyMaskUrl(portraitId);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const team = generatedJerseyStyle(player.teamId);
  const px = DIMENSIONS[size];
  if (!src || failedSrc === src) {
    return <GmGeneratedPortrait
      player={player} name={name} size={size} className={className}
    />;
  }
  return (
    <span
      data-avatar={size}
      data-generated-photo="true"
      data-photo-pool-id={portraitId}
      data-jersey-team={team.teamId ?? "free-agent"}
      data-jersey-color={team.base}
      title={name}
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border",
        CLASSES[size], className,
      )}
      style={{ boxShadow: "0 0 0 1px " + team.base }}
    >
      <Image
        src={src}
        alt={name + " fictional player portrait"}
        width={px}
        height={px}
        priority={priority}
        unoptimized
        loading={priority ? undefined : "eager"}
        className="absolute inset-0 h-full w-full object-cover object-top"
        onError={() => setFailedSrc(src)}
      />
      {mask ? <span
        aria-hidden="true"
        data-photo-jersey-tint="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: team.base,
          maskImage: "url('" + mask + "')",
          WebkitMaskImage: "url('" + mask + "')",
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          mixBlendMode: "color",
          opacity: 0.95,
        }}
      /> : null}
      {size === "lg" || size === "xl" ? (
        <span aria-hidden="true"
          className="pointer-events-none absolute bottom-0.5 right-0.5 rounded-sm px-1 text-[9px] font-bold text-white shadow-sm"
          style={{ backgroundColor: team.base, color: team.lettering }}>
          {team.abbreviation}
        </span>
      ) : null}
    </span>
  );
}
