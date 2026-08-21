/**
 * Map ESPN broadcast payloads → legal watch options.
 * Does not invent URLs or blackout decisions.
 */

import type { GameBroadcastOption } from "@/lib/game-status";

export type EspnBroadcastRaw = {
  market?: string;
  names?: string[];
  type?: { shortName?: string; type?: string };
};

export type EspnGeoBroadcastRaw = {
  type?: { shortName?: string; type?: string };
  market?: { type?: string; id?: string };
  media?: { shortName?: string; longName?: string };
  lang?: string;
  region?: string;
};

function mediumFrom(type?: string | null): GameBroadcastOption["medium"] {
  const t = (type ?? "").toLowerCase();
  if (t.includes("radio")) return "radio";
  if (t.includes("stream") || t.includes("internet")) return "streaming";
  if (t.includes("tv") || t === "television") return "tv";
  return "unknown";
}

function marketFrom(raw?: string | null): GameBroadcastOption["market"] {
  const m = (raw ?? "").toLowerCase();
  if (m.includes("national")) return "national";
  if (m.includes("local") || m.includes("home") || m.includes("away")) {
    return "local";
  }
  return "unknown";
}

/**
 * Prefer geoBroadcasts when present; fall back to broadcasts.names.
 */
export function mapEspnBroadcasts(options: {
  broadcasts?: EspnBroadcastRaw[] | null;
  geoBroadcasts?: EspnGeoBroadcastRaw[] | null;
}): GameBroadcastOption[] {
  const out: GameBroadcastOption[] = [];
  const seen = new Set<string>();

  const push = (opt: GameBroadcastOption) => {
    const key = `${opt.label}|${opt.market}|${opt.medium}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(opt);
  };

  for (const g of options.geoBroadcasts ?? []) {
    const label =
      g.media?.shortName?.trim() ||
      g.media?.longName?.trim() ||
      "";
    if (!label) continue;
    push({
      id: `espn-geo-${label}-${g.market?.type ?? "unk"}`,
      label,
      market: marketFrom(g.market?.type),
      medium: mediumFrom(g.type?.shortName ?? g.type?.type),
      watchUrl: null,
      source: "espn",
    });
  }

  for (const b of options.broadcasts ?? []) {
    for (const name of b.names ?? []) {
      const label = name.trim();
      if (!label) continue;
      push({
        id: `espn-bc-${label}-${b.market ?? "unk"}`,
        label,
        market: marketFrom(b.market),
        medium: mediumFrom(b.type?.shortName ?? b.type?.type),
        watchUrl: null,
        source: "espn",
      });
    }
  }

  return out;
}

export type WatchAvailability =
  | "available"
  | "subscription"
  | "blackout_possible"
  | "location_required"
  | "unknown"
  | "unavailable";

export type ResolvedWatchRow = {
  option: GameBroadcastOption;
  availability: WatchAvailability;
  note: string;
};

/**
 * Resolve display rows for a viewer location.
 * Without a verified blackout API we never claim League Pass is available locally.
 */
export function resolveWatchAvailability(options: {
  broadcasts: GameBroadcastOption[];
  locationLabel?: string | null;
}): ResolvedWatchRow[] {
  const location = options.locationLabel?.trim() || null;
  const rows: ResolvedWatchRow[] = options.broadcasts.map((option) => {
    if (option.market === "national") {
      return {
        option,
        availability: "available" as const,
        note: "National broadcast",
      };
    }
    if (option.market === "local") {
      if (!location) {
        return {
          option,
          availability: "location_required" as const,
          note: "Local broadcast - set location for market context",
        };
      }
      return {
        option,
        availability: "unknown" as const,
        note: `Local broadcast (availability in ${location} not verified here)`,
      };
    }
    return {
      option,
      availability: "unknown" as const,
      note: "Broadcast listed by provider",
    };
  });

  // League Pass is never an unconditional Watch - blackouts apply.
  rows.push({
    option: {
      id: "nba-league-pass",
      label: "NBA League Pass",
      market: "unknown",
      medium: "streaming",
      watchUrl: "https://www.nba.com/watch/league-pass",
      source: "espn",
    },
    availability: location ? "blackout_possible" : "location_required",
    note: location
      ? `Out-of-market streaming may apply in ${location}; local and national blackouts can block League Pass`
      : "Out-of-market streaming - set location; blackouts may apply",
  });

  return rows;
}
