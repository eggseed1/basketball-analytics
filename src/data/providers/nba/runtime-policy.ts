/**
 * Runtime policy shared by local development and deployed production.
 *
 * `VERCEL=1` must never change product semantics. Cursor/local and production
 * should execute the same provider graph; host-specific resilience belongs in
 * the individual HTTP clients (cache/CDN/fallback), not in route behavior.
 */
export type RuntimeEnv = Record<string, string | undefined>;

export function isVercelRuntime(
  env: RuntimeEnv = process.env
): boolean {
  return Boolean(env.VERCEL);
}

/**
 * NBA Stats is part of the complete provider graph in every environment.
 * It can be explicitly disabled for offline tests, but is no longer disabled
 * just because code is running on Vercel.
 */
export function statsNbaNetworkEnabled(
  env: RuntimeEnv = process.env
): boolean {
  return env.DISABLE_STATS_NBA_NETWORK !== "1";
}

/**
 * Preserve local/Cursor budgets in production. The second parameter remains in
 * the signature for existing call sites, but cannot silently reduce features.
 */
export function runtimeTimeoutMs(
  normalMs: number,
  _vercelMs: number,
  env: RuntimeEnv = process.env
): number {
  if (env.DRBL_OFFLINE_PARITY_TEST === "1") return Math.min(normalMs, 250);
  return normalMs;
}

/**
 * Roster discovery has identical semantics in all runtimes. Explicitly disable
 * it only in an offline/parity test; never from the hosting platform name.
 */
export function leagueRosterDiscoveryEnabled(
  env: RuntimeEnv = process.env
): boolean {
  return env.DISABLE_PLAYER_LEAGUE_ROSTER_DISCOVERY !== "1";
}
