const DEFAULT_SITE_URL = "https://basketball-analytics.drbl-analytics.workers.dev";

/** Public origin for absolute URLs (sitemap, robots, social cards). Set NEXT_PUBLIC_SITE_URL when a custom domain is live. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");

export const SITE_NAME = "Basketball Analytics";

export const SITE_CONTACT_URL = "https://github.com/eggseed1/basketball-analytics/issues";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
