"use client";

import { useMemo } from "react";

import { AppLink } from "@/components/ui/app-link";
import type { GameBroadcastOption } from "@/lib/game-status";
import {
  broadcastBadgeColors,
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
  background: string;
  color: string;
};

/**
 * Deduped game networks with a known official URL — one badge per family.
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
    const colors = broadcastBadgeColors(row.label);
    out.push({
      key,
      mark: broadcastLogoMark(row.label),
      label: row.label,
      href,
      background: colors.background,
      color: colors.color,
    });
  }
  return out;
}

/**
 * Compact site-name badges on the game meta row. Each opens the official watch page.
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
    <ul
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      aria-label="Watch on"
    >
      {logos.map((logo) => (
        <li key={logo.key}>
          <AppLink
            href={logo.href}
            aria-label={`Watch on ${logo.label}`}
            title={`Watch on ${logo.label}`}
            className={cn(
              "inline-flex h-6 items-center rounded-md px-2 text-[10px] font-bold uppercase tracking-[0.06em]",
              "transition-opacity hover:opacity-90"
            )}
            style={{ backgroundColor: logo.background, color: logo.color }}
          >
            {logo.mark}
          </AppLink>
        </li>
      ))}
    </ul>
  );
}
