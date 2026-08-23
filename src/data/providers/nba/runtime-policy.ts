/**
 * Runtime policy for upstreams that are unreliable from Vercel serverless IPs.
 *
 * Keep this module pure so route-level regression tests can verify the policy
 * without making network calls.
 */
export type RuntimeEnv = Record<string, string | undefined>;

export function isVercelRuntime(
  env: RuntimeEnv = process.env
): boolean {
  return Boolean(env.VERCEL);
}

/**
 * stats.nba.com commonly times out or blocks Vercel egress. It remains
 * available in local/server environments and can be explicitly re-enabled for
 * a future proxy or fixed-egress deployment.
 */
export function statsNbaNetworkEnabled(
  env: RuntimeEnv = process.env
): boolean {
  return (
    !isVercelRuntime(env) ||
    env.ALLOW_STATS_NBA_ON_VERCEL === "1"
  );
}

/** Bound optional provider work more aggressively in serverless renders. */
export function runtimeTimeoutMs(
  normalMs: number,
  vercelMs: number,
  env: RuntimeEnv = process.env
): number {
  return isVercelRuntime(env) ? vercelMs : normalMs;
}

/**
 * A 30-team roster crawl must never sit on a player page's critical path in
 * Vercel. It can be explicitly enabled when backed by a durable roster cache.
 */
export function leagueRosterDiscoveryEnabled(
  env: RuntimeEnv = process.env
): boolean {
  return (
    !isVercelRuntime(env) ||
    env.ALLOW_PLAYER_LEAGUE_ROSTER_ON_VERCEL === "1"
  );
}
