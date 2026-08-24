import { LocalDataProvider } from "./local-data-provider";
import { NBADataProvider } from "./nba/complete-nba-data-provider";
import { clearDrblCache } from "./nba/drbl-loader";
import type { BasketballDataProvider } from "./types";

export type { BasketballDataProvider } from "./types";
export { LocalDataProvider } from "./local-data-provider";
export { NBADataProvider } from "./nba/complete-nba-data-provider";

let cachedProvider: BasketballDataProvider | null = null;

/**
 * Resolves the active data provider.
 * Set DATA_PROVIDER=local|nba.
 *
 * Default: `nba` on Vercel / Cloudflare Workers (complete ESPN/NBA player data).
 * Default: `local` elsewhere (sample dataset for offline/dev without .env).
 * Always set DATA_PROVIDER explicitly in production to avoid empty careers.
 */
export function getDataProvider(): BasketballDataProvider {
  if (cachedProvider) return cachedProvider;

  const onCloudHost =
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.CF_PAGES) ||
    process.env.NEXTJS_ENV === "production" ||
    Boolean(process.env.WORKERS_CI);
  const fallback = onCloudHost ? "nba" : "local";
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

/** Clears the singleton (and DRBL memo) so the next call rebuilds caches. */
export function resetDataProvider(): void {
  cachedProvider = null;
  clearDrblCache();
}
