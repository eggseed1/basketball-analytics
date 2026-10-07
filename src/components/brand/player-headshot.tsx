"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { faceCropBox, parsePortraitPhoto } from "@/lib/portrait-photo";
import {
  playerHeadshotCandidates,
  resolveTeamBrand,
} from "@/lib/nba-brand";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const BREF_HEADSHOT = /basketball-reference\.com\/.*\/headshots\//;

const PX: Record<Size, number> = {
  xs: 28,
  sm: 36,
  md: 56,
  lg: 96,
  xl: 140,
};

/** Tailwind size classes — allow call sites to override (e.g. denser mobile boards). */
const SIZE_CLASS: Record<Size, string> = {
  xs: "h-7 w-7",
  sm: "h-9 w-9",
  md: "h-14 w-14",
  lg: "h-24 w-24",
  xl: "h-[8.75rem] w-[8.75rem]",
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
  /** Precomputed verified URL from media registry - preferred. */
  portraitUrl,
  /** When set, do not probe CDN - use portraitUrl or initials only. */
  registryOnly = false,
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
  portraitUrl?: string | null;
  registryOnly?: boolean;
}) {
  const candidates = useMemo(
    () =>
      playerHeadshotCandidates({
        playerId,
        espnId,
        nbaId,
        approvedUrl: portraitUrl,
        registryOnly,
      }),
    [playerId, espnId, nbaId, portraitUrl, registryOnly]
  );
  // Failed-candidate count resets whenever the inputs (and so the list) change.
  const [failed, setFailed] = useState({ list: candidates, index: 0 });
  const index = failed.list === candidates ? failed.index : 0;

  const candidate = candidates[index];
  const brand = resolveTeamBrand(teamKey);
  const px = PX[size];

  if (!candidate) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide text-white ring-2 ring-white/80",
          SIZE_CLASS[size],
          className
        )}
        data-avatar
        style={{
          fontSize: Math.max(10, px * 0.32),
          background: `linear-gradient(145deg, ${brand?.primary ?? "#0b1f3a"}, ${brand?.secondary ?? "#e85d04"})`,
        }}
        aria-hidden
      >
        {initials(name)}
      </span>
    );
  }

  const photo = parsePortraitPhoto(candidate);
  const box = photo.crop ? faceCropBox(photo.crop) : null;
  // Basketball-Reference headshots are tight 2:3 portraits; covering the
  // circle cuts off the chin, so show them whole.
  const tallPortrait = !box && BREF_HEADSHOT.test(photo.src);
  const backdrop = tallPortrait || (box !== null && !box.covers);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-white/90",
        SIZE_CLASS[size],
        className
      )}
      data-avatar
      style={{
        boxShadow: brand ? `0 0 0 2px ${brand.primary}` : undefined,
      }}
      title={photo.credit ?? undefined}
    >
      {backdrop ? (
        <Image
          key={`${candidate}-backdrop`}
          src={photo.src}
          alt=""
          aria-hidden
          width={px}
          height={px}
          loading={priority ? undefined : "eager"}
          className="absolute inset-0 h-full w-full scale-125 object-cover"
          style={{ filter: `blur(${Math.max(2, Math.round(px * 0.06))}px)` }}
          unoptimized
        />
      ) : null}
      <Image
        key={candidate}
        src={photo.src}
        alt={name ? `${name} ${photo.crop ? "photo" : "headshot"}` : ""}
        width={px}
        height={px}
        priority={priority}
        // Small avatars sit in overflow boards; native lazy often never fires on
        // mobile Safari inside horizontal scrollers.
        loading={priority ? undefined : "eager"}
        className={
          box
            ? "absolute max-w-none"
            : tallPortrait
              ? "relative h-full w-full object-contain"
              : "h-full w-full object-cover object-top"
        }
        style={box?.style}
        onError={() => {
          setFailed((prev) => {
            const i = prev.list === candidates ? prev.index : 0;
            // Past the end → initials.
            return { list: candidates, index: Math.min(i + 1, candidates.length) };
          });
        }}
        unoptimized
      />
    </span>
  );
}
