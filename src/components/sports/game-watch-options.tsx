"use client";

import { useEffect, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import type { GameBroadcastOption } from "@/lib/game-status";
import {
  resolveWatchAvailability,
  type ResolvedWatchRow,
} from "@/lib/game-watch";
import { cn } from "@/lib/utils";

const LOCATION_KEY = "drbl-watch-location-v1";

function loadLocation(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(LOCATION_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveLocation(value: string) {
  if (typeof window === "undefined") return;
  try {
    if (value.trim()) window.localStorage.setItem(LOCATION_KEY, value.trim());
    else window.localStorage.removeItem(LOCATION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Legal where-to-watch panel. Never invents pirate streams.
 * Location is optional; League Pass is never promised without blackout caveats.
 */
export function GameWatchOptions({
  broadcasts = [],
  compact,
  className,
}: {
  broadcasts?: GameBroadcastOption[];
  compact?: boolean;
  className?: string;
}) {
  const [location, setLocation] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const saved = loadLocation();
    setLocation(saved);
    setDraft(saved);
  }, []);

  const rows: ResolvedWatchRow[] = resolveWatchAvailability({
    broadcasts,
    locationLabel: location || null,
  });

  // If provider gave nothing, still show League Pass caveat + empty state.
  const hasProviderBroadcasts = broadcasts.length > 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          className={cn(
            "font-bold tracking-tight",
            compact ? "text-[12px] uppercase tracking-wide text-muted-foreground" : "text-[14px]"
          )}
        >
          {location
            ? `Where to watch in ${location}`
            : "Where to watch"}
        </h3>
        <button
          type="button"
          className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setEditing((v) => !v)}
        >
          {location ? "Change location" : "Set location"}
        </button>
      </div>

      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const next = draft.trim();
            saveLocation(next);
            setLocation(next);
            setEditing(false);
          }}
        >
          <label className="sr-only" htmlFor="watch-location">
            Watch location (city or ZIP)
          </label>
          <input
            id="watch-location"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="City or ZIP (e.g. Boston, MA)"
            className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[14px]"
            autoComplete="postal-code"
          />
          <button
            type="submit"
            className="rounded-md bg-foreground px-2.5 py-1.5 text-[12px] font-bold text-background"
          >
            Save
          </button>
        </form>
      ) : null}

      {!hasProviderBroadcasts ? (
        <p className="text-[12px] text-muted-foreground">
          Broadcast assignment not yet available from the provider for this
          game.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.option.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 frost-surface px-2.5 py-2"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">{row.option.label}</p>
              <p className="text-[12px] text-muted-foreground">{row.note}</p>
            </div>
            {row.option.watchUrl ? (
              <AppLink
                href={row.option.watchUrl}
                className="shrink-0 text-[12px] font-semibold underline-offset-2 hover:underline"
              >
                {row.availability === "blackout_possible" ||
                row.availability === "location_required"
                  ? "Check availability →"
                  : "Watch →"}
              </AppLink>
            ) : row.availability === "available" ? (
              <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">
                On {row.option.label}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground">
        Legal destinations only. League Pass is subject to local and national
        blackouts. Availability is not a blackout API verdict.
      </p>
    </div>
  );
}
