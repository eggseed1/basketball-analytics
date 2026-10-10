/**
 * Visitor requests must never scrape Basketball-Reference; its terms bar
 * sites built on scraped data. Pages read the nightly bundles only. Set
 * ALLOW_LIVE_BREF=1 for local research scripts.
 */
export function liveBrefAllowed(): boolean {
  return process.env.ALLOW_LIVE_BREF === "1";
}

export function assertLiveBrefAllowed(url: string): void {
  if (!liveBrefAllowed()) {
    throw new Error(`live Basketball-Reference fetch is off (ALLOW_LIVE_BREF): ${url}`);
  }
}
