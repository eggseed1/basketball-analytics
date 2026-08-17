/**
 * Time Machine URL builders — season, theme, date roundtrip.
 */

import { parseThemeMode, type ThemeMode } from "@/themes/era-theme";

export type HistorySearchState = {
  season?: string;
  theme?: ThemeMode;
  date?: string;
};

export function parseHistorySearchParams(
  params: Record<string, string | string[] | undefined>
): HistorySearchState {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const seasonRaw = first(params.season)?.trim();
  const dateRaw = first(params.date)?.trim();
  const themeRaw = first(params.theme);

  return {
    season:
      seasonRaw && /^\d{4}-\d{2}$/.test(seasonRaw) ? seasonRaw : undefined,
    date: dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined,
    theme: themeRaw ? parseThemeMode(themeRaw) : undefined,
  };
}

/** Build `/history?...` preserving known Time Machine params. */
export function historyHref(state: HistorySearchState): string {
  const q = new URLSearchParams();
  if (state.season) q.set("season", state.season);
  if (state.theme === "modern") q.set("theme", "modern");
  // historical is default — omit from URL for cleanliness
  if (state.date) q.set("date", state.date);
  const qs = q.toString();
  return qs ? `/history?${qs}` : "/history";
}

export function gameLabFromHistoryHref(
  gameId: string,
  state: Pick<HistorySearchState, "season" | "theme">
): string {
  const q = new URLSearchParams();
  q.set("from", "history");
  if (state.season) q.set("season", state.season);
  if (state.theme === "modern") q.set("theme", "modern");
  else q.set("theme", "historical");
  return `/games/${encodeURIComponent(gameId)}?${q.toString()}`;
}

export function teamFromHistoryHref(
  canonicalTeamId: string,
  season: string,
  theme?: ThemeMode
): string {
  const q = new URLSearchParams();
  q.set("season", season);
  q.set("from", "history");
  if (theme === "modern") q.set("theme", "modern");
  else q.set("theme", "historical");
  return `/teams/${encodeURIComponent(canonicalTeamId)}?${q.toString()}`;
}

export function playerFromHistoryHref(
  playerId: string,
  season: string,
  theme?: ThemeMode
): string {
  const q = new URLSearchParams();
  q.set("season", season);
  q.set("from", "history");
  if (theme === "modern") q.set("theme", "modern");
  else q.set("theme", "historical");
  return `/players/${encodeURIComponent(playerId)}?${q.toString()}`;
}

/** Shared arrival flags for player/team destinations from Time Machine. */
export function parseDestinationHistoryArrival(
  params: Record<string, string | string[] | undefined>
): {
  fromHistory: boolean;
  themeMode: ThemeMode;
  applyEraTheme: boolean;
} {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const fromHistory = first(params.from) === "history";
  const themeParam = first(params.theme);
  const themeMode = parseThemeMode(themeParam);
  const applyEraTheme =
    fromHistory || themeParam === "historical" || themeParam === "modern";
  return { fromHistory, themeMode, applyEraTheme };
}

