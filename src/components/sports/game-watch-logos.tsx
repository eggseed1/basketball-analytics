"use client";

import { useMemo } from "react";

import { AppLink } from "@/components/ui/app-link";
import { type } from "@/lib/design-system";
import type { GameBroadcastOption } from "@/lib/game-status";
import {
  broadcastLogoMark,
  broadcastNetworkKey,
  officialWatchUrlForLabel,
} from "@/lib/nba-streaming";
import { cn } from "@/lib/utils";

export type WatchLogoItem = {
  key: string;
  mark: string;
  label: string;
  href: string;
};

/**
 * Deduped game networks with a known official URL — one outlet per family.
 */
export function watchLogosForBroadcasts(
  broadcasts: GameBroadcastOption[] | undefined,
  season?: string | null
): WatchLogoItem[] {
  const out: WatchLogoItem[] = [];
  const seen = new Set<string>();
  for (const row of broadcasts ?? []) {
    if (row.medium === "radio") continue;
    const href = row.watchUrl ?? officialWatchUrlForLabel(row.label, season);
    if (!href) continue;
    const key = broadcastNetworkKey(row.label) || row.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      mark: broadcastLogoMark(row.label),
      label: row.label,
      href,
    });
  }
  return out;
}

/**
 * Plain “Where to watch:” line with linked outlet names on the game meta row.
 */
export function GameWatchLogos({
  broadcasts,
  season,
  className,
}: {
  broadcasts?: GameBroadcastOption[];
  season?: string | null;
  className?: string;
}) {
  const logos = useMemo(
    () => watchLogosForBroadcasts(broadcasts, season),
    [broadcasts, season]
  );
  if (!logos.length) return null;

  return (
    <p
      className={cn(
        type.caption,
        "flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-muted-foreground",
        className
      )}
    >
      <span>Where to watch:</span>
      {logos.map((logo, index) => (
        <span key={logo.key} className="inline-flex items-baseline gap-x-1.5">
          {index > 0 ? (
            <span aria-hidden className="text-muted-foreground/50">
              ·
            </span>
          ) : null}
          <AppLink
            href={logo.href}
            aria-label={`Watch on ${logo.label}`}
            title={`Watch on ${logo.label}`}
            className="font-semibold text-foreground underline decoration-foreground/35 underline-offset-2 transition-colors hover:decoration-foreground"
          >
            {logo.mark}
          </AppLink>
        </span>
      ))}
    </p>
  );
}
