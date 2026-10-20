/**
 * Compressed FA tick lengths and market bootstrap helpers.
 */

import type { GmFaMarket, GmFaMarketConfig, GmLeagueState } from "@/gm/types";

export const DEFAULT_FA_CONFIG: GmFaMarketConfig = {
  moratoriumTicks: 3,
  openTicks: 12,
  fillTicks: 4,
  rfaMatchTicks: 2,
};

export function defaultFaConfig(): GmFaMarketConfig {
  return { ...DEFAULT_FA_CONFIG };
}

export function emptyFaMarket(seed?: number): GmFaMarket {
  return {
    stage: "options",
    day: 0,
    agreements: [],
    pending: [],
    recap: [],
    config: defaultFaConfig(),
    watchlist: [],
    reservations: [],
    offerSheets: [],
    decisions: [],
    dayRecap: [],
    seed: seed ?? Date.now() % 1_000_000,
  };
}

export function ensureFaMarket(state: GmLeagueState): GmFaMarket {
  const market = state.faMarket ?? emptyFaMarket(state.season * 7919);
  return {
    ...market,
    config: market.config ?? defaultFaConfig(),
    watchlist: market.watchlist ?? [],
    reservations: market.reservations ?? [],
    offerSheets: market.offerSheets ?? [],
    decisions: market.decisions ?? [],
    dayRecap: market.dayRecap ?? [],
    seed: market.seed ?? state.season * 7919,
  };
}

export function stageAfterDay(
  day: number,
  config: GmFaMarketConfig = DEFAULT_FA_CONFIG
): { stage: GmFaMarket["stage"]; done: boolean } {
  // Options / QO / rights are advanced by explicit stage moves, not day counts.
  // Day counter applies once the moratorium opens (day resets or continues —
  // we use absolute day from desk open; pre-market stages use day 0).
  const m = config.moratoriumTicks;
  const o = config.openTicks;
  const f = config.fillTicks;
  if (day < m) return { stage: "moratorium", done: false };
  if (day < m + o) return { stage: "open", done: false };
  if (day < m + o + f) return { stage: "fill", done: false };
  return { stage: "fill", done: true };
}
