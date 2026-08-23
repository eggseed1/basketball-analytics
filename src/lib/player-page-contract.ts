/**
 * P18C.1 player page routing + capability contract.
 * Design may restyle; season/view semantics stay frozen.
 */

import { historySeasonSupportsDrbl } from "@/data/history/player-career-types";
import { startYearFromCanonicalSeason } from "@/data/providers/historical/season-range";

export const PLAYER_GAME_LOG_PAGE_SIZE = 40;
export const PLAYER_GAME_LOG_SUPPORTED_START = "1996-97";
export const DRBL_SUPPORTED_START = "2020-21";

export type PlayerPageView =
  | "overview"
  | "sentiment"
  | "career"
  | "games"
  | "splits"
  | "shooting"
  | "advanced"
  | "highs";

export type PlayerStatMode = "perGame" | "totals" | "per36";

export type PlayerGameLogTableMode = "basic" | "advanced";

export type PlayerPageCapabilities = {
  careerStats: boolean;
  gameLogs: boolean;
  splits: boolean;
  shooting: boolean;
  shotChart: boolean;
  advancedDrbl: boolean;
  gameHighs: boolean;
  gameHighsScopeLabel: "Career high" | "Game highs since 1996-97";
  /** Fan/media sentiment + trade track tab (active players). */
  sentiment: boolean;
};

export function parsePlayerPageView(
  raw: string | null | undefined
): PlayerPageView {
  const v = (raw ?? "overview").toLowerCase();
  if (
    v === "sentiment" ||
    v === "career" ||
    v === "games" ||
    v === "splits" ||
    v === "shooting" ||
    v === "advanced" ||
    v === "highs"
  ) {
    return v;
  }
  return "overview";
}

export function parsePlayerStatMode(
  raw: string | null | undefined
): PlayerStatMode {
  const v = (raw ?? "perGame").toLowerCase();
  if (v === "totals" || v === "per36") return v;
  return "perGame";
}

export function parseGameLogTableMode(
  raw: string | null | undefined
): PlayerGameLogTableMode {
  const v = (raw ?? "basic").toLowerCase();
  return v === "advanced" ? "advanced" : "basic";
}

export function playerPageCapabilities(options: {
  selectedSeason: string;
  careerFirstSeason?: string | null;
  showSentiment?: boolean;
}): PlayerPageCapabilities {
  const season = options.selectedSeason;
  const gameLogs = season >= PLAYER_GAME_LOG_SUPPORTED_START;
  const entireCareerInArchive =
    Boolean(options.careerFirstSeason) &&
    options.careerFirstSeason! >= PLAYER_GAME_LOG_SUPPORTED_START;

  return {
    careerStats: true,
    gameLogs,
    splits: gameLogs,
    shooting: true,
    shotChart: gameLogs,
    advancedDrbl: historySeasonSupportsDrbl(season),
    gameHighs: gameLogs,
    gameHighsScopeLabel: entireCareerInArchive
      ? "Career high"
      : "Game highs since 1996-97",
    sentiment: options.showSentiment ?? false,
  };
}

/** Views shown as navigable tabs (no dead tabs). */
export function playerPageNavViews(
  caps: PlayerPageCapabilities
): Array<{ id: PlayerPageView; label: string }> {
  const out: Array<{ id: PlayerPageView; label: string }> = [
    { id: "overview", label: "Overview" },
  ];
  if (caps.sentiment) out.push({ id: "sentiment", label: "Sentiment" });
  if (caps.gameLogs) out.push({ id: "games", label: "Game Logs" });
  out.push({ id: "career", label: "Career" });
  if (caps.splits) out.push({ id: "splits", label: "Splits" });
  out.push({ id: "shooting", label: "Shooting" });
  out.push({ id: "advanced", label: "Advanced" });
  if (caps.gameHighs) out.push({ id: "highs", label: "Game Highs" });
  return out;
}

export function playerHref(options: {
  playerId: string;
  season: string;
  view?: PlayerPageView;
  page?: number;
  stat?: PlayerStatMode;
  mode?: PlayerGameLogTableMode;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
  filter?: string | null;
}): string {
  const q = new URLSearchParams();
  q.set("season", options.season);
  if (options.view && options.view !== "overview") q.set("view", options.view);
  if (options.page && options.page > 1) q.set("page", String(options.page));
  if (options.stat && options.stat !== "perGame") q.set("stat", options.stat);
  if (options.mode && options.mode !== "basic") q.set("mode", options.mode);
  if (options.filter) q.set("filter", options.filter);
  if (options.fromHistory) {
    q.set("from", "history");
    q.set(
      "theme",
      options.themeMode === "modern" ? "modern" : "historical"
    );
  }
  return `/players/${encodeURIComponent(options.playerId)}?${q.toString()}`;
}

export function seasonSupportsGameLogs(season: string): boolean {
  return season >= PLAYER_GAME_LOG_SUPPORTED_START;
}

export function safeStartYear(season: string): number | null {
  try {
    return startYearFromCanonicalSeason(season);
  } catch {
    return null;
  }
}

/** Rate helpers — null when denominator missing / zero. */
export function perGame(total: number | null | undefined, gp: number): number | null {
  if (total == null || !Number.isFinite(total) || gp <= 0) return null;
  return total / gp;
}

export function per36(
  total: number | null | undefined,
  minutes: number | null | undefined
): number | null {
  if (total == null || minutes == null || !Number.isFinite(total) || minutes <= 0) {
    return null;
  }
  return (36 * total) / minutes;
}

export function efgPct(
  fgm: number | null | undefined,
  fga: number | null | undefined,
  threePm: number | null | undefined
): number | null {
  if (fgm == null || fga == null || fga <= 0) return null;
  return (fgm + 0.5 * (threePm ?? 0)) / fga;
}

/** Standard box TS% with 0.44 FTA approximation (derived, documented). */
export function tsPct(
  pts: number | null | undefined,
  fga: number | null | undefined,
  fta: number | null | undefined
): number | null {
  if (pts == null || fga == null) return null;
  const denom = 2 * (fga + 0.44 * (fta ?? 0));
  if (denom <= 0) return null;
  return pts / denom;
}

export function fgPct(
  made: number | null | undefined,
  att: number | null | undefined
): number | null {
  if (made == null || att == null || att <= 0) return null;
  return made / att;
}
