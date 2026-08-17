/**
 * Production data-provider guard — distinguish sample/misconfig from empty careers.
 *
 * Pure / sync. No secrets. No network.
 *
 * The Player Intelligence incident:
 *   DATA_PROVIDER unset → LocalDataProvider → sample slug ids ("jokic")
 *   → ESPN numeric id lookup ("3112335") → careerRows = 0
 * while getPlayer() still returned a live ESPN bio shell.
 */

import {
  configuredDataProviderKey,
  describeProvider,
  type ProviderStatus,
} from "./provider-meta";

export type ProductionProviderGuardStatus =
  | "ok"
  | "sample_provider_on_canonical_id"
  | "sample_provider_empty_career"
  | "live_provider_empty_career"
  | "provider_error";

export type ProductionProviderGuard = {
  status: ProductionProviderGuardStatus;
  /** Operator-facing short label */
  label: string;
  /** Safe user/operator message — never includes secrets or filesystem paths */
  message: string;
  provider: ProviderStatus;
  configuredKey: string;
  /** True when deployment should prefer live NBA data (Vercel or explicit nba). */
  expectsLiveNba: boolean;
  playerId: string;
  careerRowCount: number;
  /** True when this looks like the silent sample→empty-career footgun. */
  isSilentEmptyCareerRisk: boolean;
};

export type AssessProductionProviderGuardInput = {
  /** Active provider name from getDataProvider().name */
  providerName: string;
  /** Player id used for the career query (often ESPN numeric). */
  playerId: string;
  careerRowCount: number;
  /** Optional: provider threw while loading career. */
  error?: unknown;
  /**
   * Override env detection (tests). When omitted, uses configuredDataProviderKey
   * + process.env.VERCEL.
   */
  configuredKey?: string;
  expectsLiveNba?: boolean;
};

/** ESPN athlete ids are numeric strings (e.g. "3112335"). Sample uses slugs. */
export function looksLikeEspnAthleteId(playerId: string): boolean {
  return /^\d{3,}$/.test(String(playerId).trim());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Unknown provider error";
}

/**
 * Assess whether an empty (or present) career result is a provider misconfig.
 * Does not fetch. Safe for server components and diagnostics.
 */
export function assessProductionProviderGuard(
  input: AssessProductionProviderGuardInput
): ProductionProviderGuard {
  const configuredKey = (
    input.configuredKey ?? configuredDataProviderKey()
  ).toLowerCase();
  const provider = describeProvider(input.providerName);
  const expectsLiveNba =
    input.expectsLiveNba ??
    (configuredKey === "nba" || Boolean(process.env.VERCEL));
  const espnId = looksLikeEspnAthleteId(input.playerId);
  const base = {
    provider,
    configuredKey,
    expectsLiveNba,
    playerId: input.playerId,
    careerRowCount: input.careerRowCount,
  };

  if (input.error != null) {
    return {
      ...base,
      status: "provider_error",
      label: "Provider error",
      message: `Player career data could not be loaded (${errorMessage(input.error)}).`,
      isSilentEmptyCareerRisk: false,
    };
  }

  if (provider.isSample && espnId && input.careerRowCount === 0) {
    return {
      ...base,
      status: "sample_provider_on_canonical_id",
      label: "Sample data provider active",
      message:
        "This deployment is serving the local sample player dataset, which uses slug ids (e.g. jokic), not ESPN athlete ids. Canonical player pages will show an empty career even when ESPN bios resolve. Set DATA_PROVIDER=nba for live career seasons.",
      isSilentEmptyCareerRisk: true,
    };
  }

  if (provider.isSample && input.careerRowCount === 0) {
    return {
      ...base,
      status: "sample_provider_empty_career",
      label: "Sample dataset — no seasons for this id",
      message:
        "No career seasons in the local sample for this player id. Sample data is for offline demos only and is not a substitute for production NBA data.",
      isSilentEmptyCareerRisk: expectsLiveNba,
    };
  }

  if (
    !provider.isSample &&
    expectsLiveNba &&
    espnId &&
    input.careerRowCount === 0
  ) {
    return {
      ...base,
      status: "live_provider_empty_career",
      label: "Empty career from live provider",
      message:
        "The live NBA provider returned no career seasons for this athlete id. That can mean a bad id, a temporary ESPN gap, or a brand-new player — not a sample-dataset misconfiguration.",
      isSilentEmptyCareerRisk: false,
    };
  }

  return {
    ...base,
    status: "ok",
    label: "OK",
    message: provider.isLive
      ? "Live NBA provider active."
      : "Sample provider active (intentional for local demos).",
    isSilentEmptyCareerRisk: false,
  };
}

/**
 * Test-only invariant: this script must exercise the live ESPN provider.
 * tsx does not load `.env.local`; unset DATA_PROVIDER defaults to sample data.
 */
export function requireNbaProviderForTest(options?: {
  providerName?: string;
  testName?: string;
}): void {
  const name = (
    options?.providerName ?? configuredDataProviderKey()
  ).toLowerCase();
  if (name !== "nba") {
    const where = options?.testName ? ` (${options.testName})` : "";
    throw new Error(
      `NBA provider required for this test${where} (got "${name}"). tsx does not load .env.local; unset DATA_PROVIDER defaults to LocalDataProvider sample data.`
    );
  }
}

/**
 * Deployment invariant for ops/CI: when the environment expects live NBA,
 * the resolved provider must not be the sample dataset.
 */
export function assertLiveNbaProviderOrThrow(options?: {
  providerName?: string;
  configuredKey?: string;
}): void {
  const configuredKey = (
    options?.configuredKey ?? configuredDataProviderKey()
  ).toLowerCase();
  const providerName = (
    options?.providerName ?? configuredKey
  ).toLowerCase();
  const meta = describeProvider(providerName);
  const expectsLive =
    configuredKey === "nba" || Boolean(process.env.VERCEL);

  if (expectsLive && meta.isSample) {
    throw new Error(
      "Production data invariant failed: expected DATA_PROVIDER=nba (live ESPN), but the sample/local provider is active. Canonical ESPN player ids will return empty careers."
    );
  }
}
