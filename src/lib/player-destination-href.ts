/**
 * Client-safe player URL helpers — no roster / schedule / ASSETS imports.
 */

/** Hannah depth-tab ids (legacy URL). Prefer P18 `view=` via player-page-contract. */
export type PlayerDepthTab = "career" | "stats" | "games" | "viz";
export type PlayerSeasonKind = "regular" | "playoffs";

export function parsePlayerDepthTab(
  raw?: string | null
): PlayerDepthTab {
  if (raw === "stats" || raw === "games" || raw === "viz") return raw;
  return "career";
}

export function parsePlayerSeasonKind(
  raw?: string | null
): PlayerSeasonKind {
  return raw === "playoffs" ? "playoffs" : "regular";
}

function historyParams(
  q: URLSearchParams,
  opts?: { fromHistory?: boolean; themeMode?: "historical" | "modern" }
) {
  if (!opts?.fromHistory) return;
  q.set("from", "history");
  q.set("theme", opts.themeMode === "modern" ? "modern" : "historical");
}

/**
 * Season chip href — preserves Time Machine arrival.
 * Accepts P18 `view` or Hannah `depth` (mapped for identity chips).
 */
export function playerSeasonChipHref(
  playerId: string,
  season: string,
  opts?: {
    fromHistory?: boolean;
    themeMode?: "historical" | "modern";
    view?: string;
    depth?: PlayerDepthTab;
    seasonType?: PlayerSeasonKind;
  }
): string {
  if (opts?.view || !opts?.depth) {
    const q = new URLSearchParams();
    q.set("season", season);
    if (opts?.view && opts.view !== "overview") q.set("view", opts.view);
    historyParams(q, opts);
    return `/players/${encodeURIComponent(playerId)}?${q.toString()}`;
  }
  return playerDepthHref(playerId, {
    season,
    depth: opts.depth,
    seasonType: opts.seasonType,
    fromHistory: opts.fromHistory,
    themeMode: opts.themeMode,
  });
}

/** Hannah-compatible depth href (kept for exact frontend ports). */
export function playerDepthHref(
  playerId: string,
  opts: {
    season: string;
    depth?: PlayerDepthTab;
    seasonType?: PlayerSeasonKind;
    compare?: string;
    fromHistory?: boolean;
    themeMode?: "historical" | "modern";
  }
): string {
  const q = new URLSearchParams();
  q.set("season", opts.season);
  if (opts.depth && opts.depth !== "career") q.set("depth", opts.depth);
  if (opts.seasonType && opts.seasonType !== "regular") {
    q.set("seasonType", opts.seasonType);
  }
  if (opts.compare) q.set("compare", opts.compare);
  historyParams(q, opts);
  return `/players/${encodeURIComponent(playerId)}?${q.toString()}`;
}
