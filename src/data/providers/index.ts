import { LocalDataProvider } from "./local-data-provider";
import { NBADataProvider } from "./nba-data-provider";
import type { BasketballDataProvider } from "./types";

export type { BasketballDataProvider } from "./types";
export { LocalDataProvider } from "./local-data-provider";
export { NBADataProvider } from "./nba-data-provider";

let cachedProvider: BasketballDataProvider | null = null;

/**
 * Resolves the active data provider.
 * Set DATA_PROVIDER=local|nba.
 *
 * Default: `nba` on Vercel (live ESPN-backed career/boards).
 * Default: `local` elsewhere (sample dataset for offline/dev without .env).
 * Always set DATA_PROVIDER explicitly in production to avoid empty careers.
 */
export function getDataProvider(): BasketballDataProvider {
  if (cachedProvider) return cachedProvider;

  const fallback = process.env.VERCEL ? "nba" : "local";
  const key = (process.env.DATA_PROVIDER ?? fallback).toLowerCase();

  switch (key) {
    case "nba":
      cachedProvider = new NBADataProvider();
      break;
    case "local":
    default:
      cachedProvider = new LocalDataProvider();
      break;
  }

  return cachedProvider;
}

/** Test helper - clears the singleton between suites. */
export function resetDataProvider(): void {
  cachedProvider = null;
}
