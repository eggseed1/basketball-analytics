/**
 * Runtime policy for upstream access and optional work budgets.
 *
 * Production must not silently remove provider capabilities simply because the
 * host is Vercel. Local/Cursor and deployed routes use the same provider graph;
 * explicit opt-out flags are reserved for emergency operations only.
 */
export type RuntimeEnv = Record<string, string | undefined>;

export function isVercelRuntime(
  env: RuntimeEnv = process.env
): boolean {
  return Boolean(env.VERCEL);
}

/**
 * Keep stats.nba.com enabled by default in every runtime so team boards, boxes,
 * play-by-play and advanced surfaces have the same capabilities as Cursor.
 * Emergency operators may explicitly disable the network without changing code.
 */
export function statsNbaNetworkEnabled(
  env: RuntimeEnv = process.env
): boolean {
  return env.DISABLE_STATS_NBA_NETWORK !== "1";
}

/**
 * Preserve existing optional-work budgets. Callers that are part of the core
 * product (Game Lab/team boards) should use their full normal budget directly.
 */
export function runtimeTimeoutMs(
  normalMs: number,
  vercelMs: number,
  env: RuntimeEnv = process.env
): number {
  return isVercelRuntime(env) ? vercelMs : normalMs;
}

/**
 * League-wide roster discovery stays bounded because it is an expensive crawl;
 * this does not disable direct team/player provider access.
 */
export function leagueRosterDiscoveryEnabled(
  env: RuntimeEnv = process.env
): boolean {
  return (
    !isVercelRuntime(env) ||
    env.ALLOW_PLAYER_LEAGUE_ROSTER_ON_VERCEL === "1"
  );
}
