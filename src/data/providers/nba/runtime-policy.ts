/**
 * Runtime policy for upstream access and optional work budgets.
 *
 * Shipping target: Cloudflare Workers **Paid** — full product by default
 * (same capabilities as localhost). Free-tier / CPU stripping is emergency
 * opt-in only via `SLIM_EDGE_PRODUCT=1`.
 *
 * `FULL_EDGE_PRODUCT=1` is also set in wrangler + `.env.production` so Next can
 * inline it at build time.
 */
export type RuntimeEnv = Record<string, string | undefined>;

function readEnvFlag(
  key: string,
  env: RuntimeEnv = process.env
): string | undefined {
  const direct = env[key];
  if (direct != null && String(direct).length > 0) return String(direct);
  try {
    const fromProcess = process.env[key];
    if (fromProcess != null && String(fromProcess).length > 0) {
      return String(fromProcess);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function flagOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function cloudflareWorkerEnv(): RuntimeEnv | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => {
        env?: RuntimeEnv;
      };
    };
    const ctx = getCloudflareContext();
    return (ctx?.env as RuntimeEnv | undefined) ?? null;
  } catch {
    return null;
  }
}

function resolveEnv(env?: RuntimeEnv): RuntimeEnv {
  if (env) return env;
  const cf = cloudflareWorkerEnv();
  if (cf) return { ...process.env, ...cf };
  return process.env;
}

function nodeEnvValue(env: RuntimeEnv): string | undefined {
  return readEnvFlag("NODE_ENV", env) ?? env.NODE_ENV;
}

export function isVercelRuntime(
  env: RuntimeEnv = process.env
): boolean {
  return Boolean(readEnvFlag("VERCEL", resolveEnv(env)) || env.VERCEL);
}

/**
 * True on Cloudflare Workers (or any non-Vercel production Node host).
 * Used to prefer bundled snapshots — not to strip product features.
 */
export function isCloudflareWorkersProduction(
  env: RuntimeEnv = process.env
): boolean {
  const merged = resolveEnv(env);
  return nodeEnvValue(merged) === "production" && !isVercelRuntime(merged);
}

/**
 * Paid / full product budgets and islands.
 *
 * Order of precedence:
 * 1. Explicit `SLIM_EDGE_PRODUCT=1` → full product OFF
 * 2. Explicit `FULL_EDGE_PRODUCT=1` / `ALLOW_LONG_UPSTREAM=1` → ON
 * 3. Cloudflare Workers production → ON by default (paid plan)
 * 4. Otherwise OFF (e.g. Vercel uses shorter budgets unless opted in)
 */
export function fullEdgeProductEnabled(
  env: RuntimeEnv = process.env
): boolean {
  const merged = resolveEnv(env);
  if (flagOn(readEnvFlag("SLIM_EDGE_PRODUCT", merged))) return false;
  if (
    flagOn(readEnvFlag("FULL_EDGE_PRODUCT", merged)) ||
    flagOn(readEnvFlag("ALLOW_LONG_UPSTREAM", merged))
  ) {
    return true;
  }
  // Workers Paid is the default shipping host — do not require the env flag
  // to keep charts / game logs / PBP alive if inlining misses.
  if (isCloudflareWorkersProduction(merged)) return true;
  return false;
}

/**
 * Emergency free-tier / CPU-stripped mode. Opt-in only.
 */
export function slimEdgeProductEnabled(
  env: RuntimeEnv = process.env
): boolean {
  const merged = resolveEnv(env);
  return flagOn(readEnvFlag("SLIM_EDGE_PRODUCT", merged));
}

/**
 * Long upstream budgets (Game Lab, PBP, season boards).
 * Full-edge Workers + Vercel use the long budget.
 */
export function longUpstreamBudgetsEnabled(
  env: RuntimeEnv = process.env
): boolean {
  const merged = resolveEnv(env);
  return fullEdgeProductEnabled(merged) || isVercelRuntime(merged);
}

export function statsNbaNetworkEnabled(
  env: RuntimeEnv = process.env
): boolean {
  return !flagOn(readEnvFlag("DISABLE_STATS_NBA_NETWORK", resolveEnv(env)));
}

/**
 * Short upstream budgets. Full-edge Workers keep long budgets.
 * Vercel stays constrained unless FULL_EDGE / ALLOW_LONG is set.
 */
export function isConstrainedServerRuntime(
  env: RuntimeEnv = process.env
): boolean {
  const merged = resolveEnv(env);
  if (fullEdgeProductEnabled(merged)) return false;
  if (slimEdgeProductEnabled(merged)) return true;
  if (isVercelRuntime(merged)) return true;
  return false;
}

/**
 * @deprecated Alias of `slimEdgeProductEnabled`. Do not use to mean “on Cloudflare”.
 */
export function isCloudflareEdgeRuntime(
  env: RuntimeEnv = process.env
): boolean {
  return slimEdgeProductEnabled(env);
}

/**
 * Workers production: prefer static runtime bundles over flaky ESPN crawls.
 * Independent of slim/full — paid Workers still benefit from bundles.
 */
export function preferBundledProductDataOnEdge(
  env: RuntimeEnv = process.env
): boolean {
  return isCloudflareWorkersProduction(env);
}

export function runtimeTimeoutMs(
  normalMs: number,
  vercelMs: number,
  env: RuntimeEnv = process.env
): number {
  return isConstrainedServerRuntime(env) ? vercelMs : normalMs;
}

export function leagueRosterDiscoveryEnabled(
  env: RuntimeEnv = process.env
): boolean {
  const merged = resolveEnv(env);
  return (
    !isVercelRuntime(merged) ||
    flagOn(readEnvFlag("ALLOW_PLAYER_LEAGUE_ROSTER_ON_VERCEL", merged))
  );
}

/** Snapshot for deploy checks / internal tooling. */
export function getRuntimePolicySnapshot(env: RuntimeEnv = process.env) {
  const merged = resolveEnv(env);
  return {
    fullEdgeProduct: fullEdgeProductEnabled(merged),
    slimEdgeProduct: slimEdgeProductEnabled(merged),
    longUpstreamBudgets: longUpstreamBudgetsEnabled(merged),
    constrainedServer: isConstrainedServerRuntime(merged),
    preferBundledData: preferBundledProductDataOnEdge(merged),
    cloudflareWorkersProduction: isCloudflareWorkersProduction(merged),
    vercel: isVercelRuntime(merged),
    nodeEnv: nodeEnvValue(merged) ?? null,
    fullEdgeEnv: readEnvFlag("FULL_EDGE_PRODUCT", merged) ?? null,
    slimEdgeEnv: readEnvFlag("SLIM_EDGE_PRODUCT", merged) ?? null,
  };
}
