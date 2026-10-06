const DEFAULT_SITE_URL = "https://drbl.io";

/** Public origin for absolute URLs (sitemap, robots, social cards). NEXT_PUBLIC_SITE_URL overrides it. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");

export const SITE_NAME = "Basketball Analytics";

export const SITE_CONTACT_URL = "https://github.com/eggseed1/basketball-analytics/issues";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
