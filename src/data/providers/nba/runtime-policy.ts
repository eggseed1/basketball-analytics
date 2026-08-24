/**
 * Runtime policy for upstreams that can behave differently in serverless
 * environments. Keep this module pure so route-level regression tests can
 * verify policy without making network calls.
 */
export type RuntimeEnv = Record<string, string | undefined>;

export function isVercelRuntime(
  env: RuntimeEnv = process.env
): boolean {
  return Boolean(env.VERCEL);
}

/**
 * Production and local must use the same provider graph. The old policy
 * disabled stats.nba.com solely because VERCEL was present, which guaranteed
 * every Vercel request would fall back to ESPN even when NBA Stats or a warm
 * Next Data Cache entry was available.
 *
 * Keep NBA Stats enabled by default everywhere. Operators can explicitly turn
 * the network path off during an incident with DISABLE_STATS_NBA_NETWORK=1;
 * the client itself applies short Vercel timeouts + a circuit breaker so a
 * blocked origin cannot hold page rendering open.
 */
export function statsNbaNetworkEnabled(
  env: RuntimeEnv = process.env
): boolean {
  return env.DISABLE_STATS_NBA_NETWORK !== "1";
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
