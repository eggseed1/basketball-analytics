"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  HistoricalLogoSource,
  HistoricalTeamBrandPalette,
} from "@/lib/historical-team-brand";
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

function isTextMarkSource(source?: HistoricalLogoSource): boolean {
  return source === "text_fallback" || source === "historical_text";
}

export function TeamLogo({
  teamKey,
  size = "sm",
  className,
  priority = false,
  /** Explicit URL from historical brand resolver (local or CDN). */
  logoUrl,
  /** When text mark source / null URL, skip modern CDN lookup. */
  logoSource,
  textAbbr,
  /** Historical era palette for monograms (Game Lab / TM). */
  logoPalette,
}: {
  teamKey?: string | null;
  size?: Size;
  className?: string;
  priority?: boolean;
  logoUrl?: string | null;
  logoSource?: HistoricalLogoSource;
  textAbbr?: string | null;
  logoPalette?: HistoricalTeamBrandPalette | null;
}) {
  const [failed, setFailed] = useState(false);
  const brand = resolveTeamBrand(teamKey);
  const forceText = isTextMarkSource(logoSource) || logoUrl === null;
  const src = forceText
    ? undefined
    : logoUrl ??
      (logoSource === "historical_verified" ? undefined : teamLogoUrl(teamKey));
  const px = PX[size];
  const markAbbr = (textAbbr ?? brand?.abbr ?? teamKey ?? "?")
    .toString()
    .slice(0, 3)
    .toUpperCase();

  if (!src || failed) {
    const fallbackLabel = markAbbr || "?";
    const historicalPalette =
      logoSource === "historical_text" ? logoPalette : null;

    if (historicalPalette) {
      return (
        <span
          className={cn(
            "historical-team-mark inline-flex shrink-0 items-center justify-center rounded-md font-bold tracking-wide",
            className
          )}
          style={{
            width: px,
            height: px,
            fontSize: Math.max(8, Math.round(px * 0.3)),
            lineHeight: 1,
            background: historicalPalette.primary,
            color: historicalPalette.foreground,
            borderColor: historicalPalette.secondary,
            borderWidth: 2,
            borderStyle: "solid",
          }}
          aria-hidden
        >
          {fallbackLabel}
        </span>
      );
    }

    return (
      <span
        className={cn(
          "historical-team-mark inline-flex shrink-0 items-center justify-center rounded-md border border-border/70 bg-secondary font-bold tracking-wide text-secondary-foreground",
          className
        )}
        style={{
          width: px,
          height: px,
          fontSize: Math.max(8, Math.round(px * 0.3)),
          lineHeight: 1,
          ...(!isTextMarkSource(logoSource) && brand?.primary
            ? {
                background: brand.primary,
                color: "#ffffff",
                borderColor: "transparent",
              }
            : null),
        }}
        aria-hidden
      >
        {fallbackLabel}
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
