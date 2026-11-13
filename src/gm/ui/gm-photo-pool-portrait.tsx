"use client";

import Image from "next/image";
import { useState } from "react";
import type { GmPlayer } from "@/gm/types";
import { generatedJerseyStyle } from "@/gm/lib/generated-player-jersey";
import {
  generatedPhotoCandidates,
  generatedPhotoJerseyMaskUrl,
  generatedPhotoUrl,
} from "@/gm/lib/generated-photo-pool";
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
 * If an asset is unavailable (older release/partial import), retry vetted
 * photographs instead of ever rendering the obsolete illustrated portrait.
 */
export function GmPhotoPoolPortrait({
  player, name, size = "xs", priority = false, className,
}: {
  player: GmPlayer; name: string; size?: Size; priority?: boolean; className?: string;
}) {
  const candidates = generatedPhotoCandidates(player);
  const [failed, setFailed] = useState<{ playerId: string; urls: string[] }>(
    { playerId: player.id, urls: [] }
  );
  const failedUrls = failed.playerId === player.id ? failed.urls : [];
  const photoId = candidates.find(id => {
    const candidateSrc = generatedPhotoUrl(id);
    return candidateSrc && !failedUrls.includes(candidateSrc);
  });
  const src = generatedPhotoUrl(photoId);
  const mask = generatedPhotoJerseyMaskUrl(photoId);
  const team = generatedJerseyStyle(player.teamId);
  const px = DIMENSIONS[size];
  const showJerseyNumber = size === "lg" || size === "xl";
  const jerseyNumber = player.jersey && /^[0-9]{1,2}$/.test(player.jersey)
    ? player.jersey : null;
  if (!src) {
    // A complete CDN/image outage is not fixable from a client component.
    // Use a neutral, identifiable placeholder rather than flashing old art.
    return <span data-avatar={size} data-generated-portrait="true"
      data-portrait-unavailable="true" title={name}
      aria-label={name + " portrait temporarily unavailable"}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-muted-foreground ring-1 ring-border", CLASSES[size], className)}>
      {name.split(/\\s+/).slice(0,2).map(word => word.slice(0,1)).join("").toUpperCase()}
    </span>;
  }
  return (
    <span
      data-avatar={size}
      data-generated-portrait="true"
      data-portrait-version="photo-v1"
      data-generated-photo="true"
      data-photo-pool-id={photoId}
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
        onError={() => setFailed(current => ({
          playerId: player.id,
          urls: [...new Set([...(current.playerId === player.id ? current.urls : []), src])],
        }))}
      />
      {mask ? <>
        {/* Generated masks contain an alpha cutout for the jersey fabric.
            A normal-opacity overlay gives a true team color even on the
            originally near-black navy shirt. CSS color blend mode preserved
            that navy luminance and made most jerseys look unchanged. */}
        <span
          aria-hidden="true"
          data-photo-jersey-tint="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: team.base,
            maskImage: "url('" + mask + "')",
            WebkitMaskImage: "url('" + mask + "')",
            maskMode: "alpha",
            maskSize: "100% 100%",
            WebkitMaskSize: "100% 100%",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            opacity: 0.88,
          }}
        />
        {/* No team-name abbreviations over the photograph. Keep optional uniform numbers. */}
        {showJerseyNumber && jerseyNumber ? <span
          aria-hidden="true"
          data-photo-jersey-number="true"
          className="pointer-events-none absolute bottom-[8%] left-1/2 -translate-x-1/2 font-black leading-none"
          style={{
            color: team.lettering,
            fontSize: size === "xl" ? 13 : 9,
            textShadow: "0 1px 2px rgba(0,0,0,.8), 0 -1px 1px rgba(0,0,0,.6)",
          }}
        >{jerseyNumber}</span> : null}
      </> : null}

    </span>
  );
}
