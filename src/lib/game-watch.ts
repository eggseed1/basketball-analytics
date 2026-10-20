/**
 * Map ESPN broadcast payloads → legal watch options.
 * Does not invent pirate streams. Official URLs come from nba-streaming.
 */

import type { GameBroadcastOption } from "@/lib/game-status";
import {
  broadcastNetworkKey,
  howToWatchUrlForSeason,
  NBA_LEAGUE_PASS,
  officialWatchUrlForLabel,
  streamingRegionForCountry,
  type StreamingPartner,
} from "@/lib/nba-streaming";

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
 * Attaches official watch URLs when the label maps to a known national partner.
 */
export function mapEspnBroadcasts(options: {
  broadcasts?: EspnBroadcastRaw[] | null;
  geoBroadcasts?: EspnGeoBroadcastRaw[] | null;
  season?: string | null;
}): GameBroadcastOption[] {
  const out: GameBroadcastOption[] = [];
  const seen = new Set<string>();
  const season = options.season ?? null;

  const push = (opt: GameBroadcastOption) => {
    const family = broadcastNetworkKey(opt.label);
    // One row per network family (NBC + Peacock, ESPN + ABC) regardless of
    // TV vs streaming medium tags from the feed.
    const key = family || `${opt.label}|${opt.market}|${opt.medium}`;
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
      watchUrl: officialWatchUrlForLabel(label, season),
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
        watchUrl: officialWatchUrlForLabel(label, season),
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
  /** Game-listed network vs regional package vs guide. */
  kind: "broadcast" | "regional" | "league_pass" | "guide";
};

function partnerToOption(partner: StreamingPartner): GameBroadcastOption {
  return {
    id: partner.id,
    label: partner.name,
    market: partner.role === "national" ? "national" : "unknown",
    medium: partner.role === "guide" ? "unknown" : "streaming",
    watchUrl: partner.watchUrl,
    source: "espn",
  };
}

/**
 * Resolve display rows for a viewer country (and optional city/ZIP).
 * Without a verified blackout API we never claim League Pass is clear locally.
 */
export function resolveWatchAvailability(options: {
  broadcasts: GameBroadcastOption[];
  countryCode?: string | null;
  locationLabel?: string | null;
  season?: string | null;
}): ResolvedWatchRow[] {
  const location = options.locationLabel?.trim() || null;
  const country = options.countryCode?.trim().toUpperCase() || null;
  const season = options.season ?? null;
  const region = streamingRegionForCountry(country === "OTHER" ? null : country);
  const rows: ResolvedWatchRow[] = [];
  const seenFamilies = new Set<string>();
  const seenUrls = new Set<string>();

  const push = (row: ResolvedWatchRow) => {
    const family = broadcastNetworkKey(row.option.label);
    const url = row.option.watchUrl ?? "";
    if (family && seenFamilies.has(family)) return;
    if (url && seenUrls.has(url)) return;
    if (family) seenFamilies.add(family);
    if (url) seenUrls.add(url);
    rows.push(row);
  };

  for (const option of options.broadcasts) {
    // Skip radio in the streaming panel.
    if (option.medium === "radio") continue;
    const withUrl: GameBroadcastOption = {
      ...option,
      watchUrl:
        option.watchUrl ?? officialWatchUrlForLabel(option.label, season),
    };
    if (option.market === "national") {
      push({
        option: withUrl,
        availability: "available",
        note: country && country !== "US"
          ? "Listed national US window. Your local rights may differ — see regional partners below."
          : "National broadcast for this game",
        kind: "broadcast",
      });
      continue;
    }
    if (option.market === "local") {
      push({
        option: withUrl,
        availability: location ? "unknown" : "location_required",
        note: location
          ? `Local RSN listing (availability in ${location} not verified here)`
          : "Local broadcast. Add a city or ZIP for market context",
        kind: "broadcast",
      });
      continue;
    }
    push({
      option: withUrl,
      availability: "unknown",
      note: "Broadcast listed by provider",
      kind: "broadcast",
    });
  }

  // Regional package for the viewer's country (skip families already listed).
  for (const partner of region.partners) {
    if (partner.role === "guide") continue;
    const family = broadcastNetworkKey(partner.name);
    if (family && seenFamilies.has(family)) continue;
    if (partner.watchUrl && seenUrls.has(partner.watchUrl)) continue;
    // National US packages stay off the list when this game already names that network.
    if (
      partner.role === "national" &&
      options.broadcasts.some((b) => {
        if (b.market !== "national") return false;
        const listed = broadcastNetworkKey(b.label);
        return Boolean(listed && listed === family);
      })
    ) {
      continue;
    }
    push({
      option: partnerToOption(partner),
      availability: "subscription",
      note: partner.note ?? `Watch option in ${region.label}`,
      kind: "regional",
    });
  }

  if (region.leaguePassAvailable) {
    push({
      option: {
        id: "nba-league-pass",
        label: "NBA League Pass",
        market: "unknown",
        medium: "streaming",
        watchUrl: NBA_LEAGUE_PASS,
        source: "espn",
      },
      availability: location || country ? "blackout_possible" : "location_required",
      note: location
        ? `${region.leaguePassNote} Context: ${location}.`
        : region.leaguePassNote,
      kind: "league_pass",
    });
  } else {
    push({
      option: {
        id: "nba-league-pass-unavailable",
        label: "NBA League Pass",
        market: "unknown",
        medium: "streaming",
        watchUrl: null,
        source: "espn",
      },
      availability: "unavailable",
      note: region.leaguePassNote,
      kind: "league_pass",
    });
  }

  // Always end with the official season guide + Tap to Watch.
  const guide = region.partners.find((p) => p.role === "guide");
  push({
    option: {
      id: guide?.id ?? "nba-tap-to-watch",
      label: guide?.name ?? "NBA Tap to Watch",
      market: "unknown",
      medium: "unknown",
      watchUrl: guide?.watchUrl ?? howToWatchUrlForSeason(season),
      source: "espn",
    },
    availability: "available",
    note:
      guide?.note ??
      "Official NBA router to the licensed stream for your location",
    kind: "guide",
  });

  // Season how-to-watch article (NBA updates partner nights during the year).
  const howTo = howToWatchUrlForSeason(season);
  if (howTo && howTo !== (guide?.watchUrl ?? "")) {
    push({
      option: {
        id: "nba-how-to-watch",
        label: "How to watch this season",
        market: "unknown",
        medium: "unknown",
        watchUrl: howTo,
        source: "espn",
      },
      availability: "available",
      note: "NBA.com guide · partners and nights update during the season",
      kind: "guide",
    });
  }

  return rows;
}
