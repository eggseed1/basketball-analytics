"use client";

import { useEffect, useMemo, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import type { GameBroadcastOption } from "@/lib/game-status";
import {
  resolveWatchAvailability,
  type ResolvedWatchRow,
} from "@/lib/game-watch";
import {
  STREAMING_COUNTRY_OPTIONS,
  streamingRegionForCountry,
} from "@/lib/nba-streaming";
import { cn } from "@/lib/utils";

const COUNTRY_KEY = "drbl-watch-country-v1";
const LOCATION_KEY = "drbl-watch-location-v1";

function loadStored(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function saveStored(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    if (value.trim()) window.localStorage.setItem(key, value.trim());
    else window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function availabilityLabel(row: ResolvedWatchRow): string {
  switch (row.availability) {
    case "available":
      return "Open";
    case "subscription":
      return "Subscribe";
    case "blackout_possible":
      return "Blackouts possible";
    case "location_required":
      return "Set location";
    case "unavailable":
      return "Not available";
    default:
      return "Check";
  }
}

/**
 * Legal "Streaming on" panel. Geo-aware regional partners + ESPN game listings.
 * Never invents pirate streams.
 */
export function GameWatchOptions({
  broadcasts = [],
  season,
  initialCountry,
  compact,
  className,
}: {
  broadcasts?: GameBroadcastOption[];
  /** Canonical season (e.g. 2025-26) so partner URLs follow the media deal era. */
  season?: string | null;
  /** ISO country from edge geo headers when available. */
  initialCountry?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const [country, setCountry] = useState(initialCountry?.toUpperCase() ?? "");
  const [location, setLocation] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftCountry, setDraftCountry] = useState(country || "US");
  const [draftLocation, setDraftLocation] = useState("");

  useEffect(() => {
    const savedCountry = loadStored(COUNTRY_KEY);
    const savedLocation = loadStored(LOCATION_KEY);
    const nextCountry = savedCountry || initialCountry?.toUpperCase() || "";
    setCountry(nextCountry);
    setDraftCountry(nextCountry || "US");
    setLocation(savedLocation);
    setDraftLocation(savedLocation);
  }, [initialCountry]);

  const region = useMemo(
    () => streamingRegionForCountry(country === "OTHER" ? null : country || null),
    [country]
  );

  const rows: ResolvedWatchRow[] = useMemo(
    () =>
      resolveWatchAvailability({
        broadcasts,
        countryCode: country || null,
        locationLabel: location || null,
        season,
      }),
    [broadcasts, country, location, season]
  );

  const hasProviderBroadcasts = broadcasts.some((b) => b.medium !== "radio");
  const titlePlace = country
    ? STREAMING_COUNTRY_OPTIONS.find((o) => o.code === country)?.label ??
      region.label
    : null;

  return (
    <section
      className={cn(
        "sports-card flex flex-col gap-3 p-4 sm:p-5",
        className
      )}
      aria-labelledby="streaming-on-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2
            id="streaming-on-heading"
            className={cn(
              "font-bold tracking-tight",
              compact ? "text-[13px] uppercase tracking-wide text-muted-foreground" : "text-[17px]"
            )}
          >
            {titlePlace ? `Streaming on · ${titlePlace}` : "Streaming on"}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Official destinations for this game. Partners change by country, and
            the listed networks update with the schedule.
          </p>
        </div>
        <button
          type="button"
          className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setEditing((v) => !v)}
        >
          {country || location ? "Change location" : "Set location"}
        </button>
      </div>

      {editing ? (
        <form
          className="flex flex-col gap-2 rounded-md border border-border/70 bg-background/60 p-3 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const nextCountry = draftCountry.trim().toUpperCase();
            const nextLocation = draftLocation.trim();
            saveStored(COUNTRY_KEY, nextCountry === "OTHER" ? "OTHER" : nextCountry);
            saveStored(LOCATION_KEY, nextLocation);
            setCountry(nextCountry);
            setLocation(nextLocation);
            setEditing(false);
          }}
        >
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
            Country
            <select
              value={draftCountry || "US"}
              onChange={(e) => setDraftCountry(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[14px] font-medium text-foreground"
            >
              {STREAMING_COUNTRY_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
            City or ZIP (optional)
            <input
              value={draftLocation}
              onChange={(e) => setDraftLocation(e.target.value)}
              placeholder="e.g. Boston, MA"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[14px] font-medium text-foreground"
              autoComplete="postal-code"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-foreground px-3 py-1.5 text-[12px] font-bold text-background"
          >
            Save
          </button>
        </form>
      ) : null}

      {!hasProviderBroadcasts ? (
        <p className="text-[13px] text-muted-foreground">
          This game’s TV assignment is not in the feed yet. Regional partners
          and League Pass are still listed for your location.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={`${row.kind}-${row.option.id}`}
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
                {row.kind === "guide"
                  ? "Open →"
                  : row.availability === "blackout_possible" ||
                      row.availability === "location_required"
                    ? "Check →"
                    : "Watch →"}
              </AppLink>
            ) : (
              <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">
                {availabilityLabel(row)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-muted-foreground">
        Legal destinations only. Blackouts and entitlements are decided by the
        rights holder, not this page. Game networks refresh from the live
        schedule; country partners follow the current media cycle.
      </p>
    </section>
  );
}
