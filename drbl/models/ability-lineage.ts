/**
 * Canonical ability lineage (A1/A2 path repair) + generation-safe merge.
 *
 * M16k1 canonical published ability:
 *
 *   rawAbilityRate       = possession residual rate from DRBL-P (seq attribution)
 *   validatedDRBL100     = N/(N+1600)*rawAbilityRate  (P-only EB1600, priorMean=0)
 *   drbl100              = validatedDRBL100 (canonical display/export)
 *
 * Legacy diagnostic (not canonical):
 *
 *   fusedRateRaw         = OOF fusion (or lite P+LN+B)
 *   posteriorAbilityRate = EB(fusedRateRaw) with legacy k=200
 *
 * LN / B / SDV are independent component fields and must never be wiped by
 * sequential P re-merge across incompatible generations.
 */

import { SEQUENTIAL_ATTRIBUTION_VERSION } from "./sequential-attribution";
import { empiricalBayesRate } from "./leaderboard";
import { fusePlayerRating } from "./fusion";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "./ranking-config";

export const ABILITY_LINEAGE_VERSION = "ability-lineage-v1";

/** Canonical published ability after M16k1 cutover. */
export type PublishedAbilityInputKind =
  | "validated_raw_eb1600"
  | "fused_rate";

export const CANONICAL_ABILITY_INPUT: PublishedAbilityInputKind =
  "validated_raw_eb1600";

/** Pre-cutover published ability kind (rollback / diagnostic). */
export const LEGACY_FUSED_ABILITY_INPUT: PublishedAbilityInputKind =
  "fused_rate";

/** Component / M6 fields that sequential P reattribute must preserve from the published row. */
export const PRESERVED_COMPONENT_KEYS = [
  "drblLn",
  "drblB",
  "sdv100",
  "shotMaking100",
  "epvShootMean",
  "vContMean",
] as const;

/** Ability lineage fields that sequential P reattribute must preserve. */
export const PRESERVED_ABILITY_KEYS = [
  "fusedRateRaw",
  "posteriorAbilityRate",
  "drbl100",
  "reliabilityWeight",
  "priorMean",
  "priorEquivalentPossessions",
] as const;

/** Sequential attribution fields overlaid onto the published row. */
export const SEQUENTIAL_OVERLAY_KEYS = [
  "drblP",
  "drblO",
  "drblD",
  "rawAbilityRate",
  "seasonalImpact",
  "creationValuePer100",
  "connectionValuePer100",
  "conversionOpportunityPer100",
  "executionValuePer100",
  "recoveryValuePer100",
  "turnoverValuePer100",
  "defensiveValuePer100",
  "actualPossessions",
  "possessions",
] as const;

/** Metadata keys used to detect stale cross-run merges (A1 generation safety). */
export const GENERATION_META_KEYS = [
  "season",
  "gameCount",
  "gamesProcessed",
  "artifactGenerationId",
  "abilityLineageVersion",
  "sequentialAttributionVersion",
  "preprocessingVersion",
  "reconstructionVersion",
] as const;

export type PlayerRecord = Record<string, unknown> & {
  playerId: string;
};

export class GenerationMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationMismatchError";
  }
}

function pickDefined(
  source: PlayerRecord,
  keys: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (source[k] !== undefined) out[k] = source[k];
  }
  return out;
}

function metaVal(
  row: PlayerRecord | Record<string, unknown>,
  key: string
): unknown {
  return row[key];
}

/**
 * Assert published + sequential rows belong to the same generation.
 * Mismatch must fail loudly rather than silently preserve stale LN/B/SDV.
 */
export function assertCompatibleGenerations(
  published: PlayerRecord,
  sequential: PlayerRecord,
  artifactMeta?: Record<string, unknown>
): void {
  const pubSeason =
    metaVal(published, "season") ?? artifactMeta?.season ?? null;
  const seqSeason = metaVal(sequential, "season") ?? artifactMeta?.season ?? null;
  if (
    pubSeason != null &&
    seqSeason != null &&
    String(pubSeason) !== String(seqSeason)
  ) {
    throw new GenerationMismatchError(
      `season mismatch: published=${pubSeason} sequential=${seqSeason}`
    );
  }

  const pubGames =
    metaVal(published, "gameCount") ??
    metaVal(published, "gamesProcessed") ??
    artifactMeta?.gameCount ??
    artifactMeta?.gamesProcessed ??
    null;
  const seqGames =
    metaVal(sequential, "gameCount") ??
    metaVal(sequential, "gamesProcessed") ??
    artifactMeta?.sequentialGameCount ??
    null;
  if (
    pubGames != null &&
    seqGames != null &&
    Number(pubGames) !== Number(seqGames)
  ) {
    throw new GenerationMismatchError(
      `gameCount mismatch: published=${pubGames} sequential=${seqGames} (refusing stale LN/B/SDV merge)`
    );
  }

  const pubGen =
    metaVal(published, "artifactGenerationId") ??
    artifactMeta?.artifactGenerationId ??
    null;
  const seqParent =
    metaVal(sequential, "parentArtifactGenerationId") ??
    metaVal(sequential, "artifactGenerationId") ??
    artifactMeta?.artifactGenerationId ??
    null;
  if (
    pubGen != null &&
    seqParent != null &&
    String(pubGen) !== String(seqParent)
  ) {
    throw new GenerationMismatchError(
      `artifactGenerationId mismatch: published=${pubGen} sequential/parent=${seqParent}`
    );
  }

  const pubLineage =
    metaVal(published, "abilityLineageVersion") ??
    artifactMeta?.abilityLineageVersion ??
    null;
  const seqLineage =
    metaVal(sequential, "abilityLineageVersion") ??
    ABILITY_LINEAGE_VERSION;
  if (
    pubLineage != null &&
    seqLineage != null &&
    String(pubLineage) !== String(seqLineage)
  ) {
    throw new GenerationMismatchError(
      `abilityLineageVersion mismatch: published=${pubLineage} sequential=${seqLineage}`
    );
  }
}

/**
 * Merge sequential P reattribution into a published season row.
 *
 * - Preserves LN / B / SDV / shot-making diagnostics from `published`
 * - Preserves fused → posterior → drbl100 ability lineage from `published`
 * - Overlays sequential P / O / D / category rates and rawAbilityRate from `sequential`
 * - Does not invent new fusion or WAR math
 * - Fails loudly on generation mismatch
 */
export function mergeSequentialIntoPublishedPlayer(
  published: PlayerRecord,
  sequential: PlayerRecord,
  artifactMeta?: Record<string, unknown>
): PlayerRecord {
  assertCompatibleGenerations(published, sequential, artifactMeta);

  const preservedComponents = pickDefined(published, PRESERVED_COMPONENT_KEYS);
  const preservedAbility = pickDefined(published, PRESERVED_ABILITY_KEYS);
  const sequentialOverlay = pickDefined(sequential, SEQUENTIAL_OVERLAY_KEYS);

  const publishedWar = published.drblWar;
  const publishedSeasonWar = published.seasonWar;
  const publishedFinalScore = published.finalRankingScore;

  return {
    ...published,
    ...sequentialOverlay,
    ...preservedComponents,
    ...preservedAbility,
    abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    publishedAbilityInput: CANONICAL_ABILITY_INPUT,
    sequentialAttributionVersion:
      sequential.sequentialAttributionVersion ?? SEQUENTIAL_ATTRIBUTION_VERSION,
    rankingMode: sequential.rankingMode ?? published.rankingMode,
    rankingFormulaVersion:
      published.rankingFormulaVersion ?? sequential.rankingFormulaVersion,
    gameCount:
      published.gameCount ??
      artifactMeta?.gameCount ??
      sequential.gameCount ??
      published.gamesProcessed,
    artifactGenerationId:
      published.artifactGenerationId ?? artifactMeta?.artifactGenerationId,
    season: published.season ?? artifactMeta?.season ?? sequential.season,
    drblWar: publishedWar ?? sequential.drblWar,
    seasonWar: publishedSeasonWar ?? sequential.seasonWar ?? publishedWar,
    finalRankingScore:
      publishedFinalScore ?? sequential.finalRankingScore ?? publishedWar,
  };
}

export function resolveFusedRateRaw(player: PlayerRecord): number {
  if (player.fusedRateRaw != null && Number.isFinite(Number(player.fusedRateRaw))) {
    return Number(player.fusedRateRaw);
  }
  return Number(player.drbl100) || 0;
}

export function resolvePosteriorAbility(args: {
  player: PlayerRecord;
  fusedRateRaw: number;
  possessions: number;
  priorMean: number;
  priorEquivalentPossessions: number;
  empiricalBayes: (
    fused: number,
    n: number,
    priorMean: number,
    priorEq: number
  ) => { posterior: number; reliability: number };
}): { posterior: number; reliability: number; reusedExisting: boolean } {
  const { player, fusedRateRaw, possessions, priorMean, priorEquivalentPossessions } =
    args;
  const hasFused = player.fusedRateRaw != null;
  const hasPosterior = player.posteriorAbilityRate != null;
  if (hasFused && hasPosterior) {
    const n = possessions;
    const reliability =
      player.reliabilityWeight != null
        ? Number(player.reliabilityWeight)
        : n + priorEquivalentPossessions > 0
          ? n / (n + priorEquivalentPossessions)
          : 0;
    return {
      posterior: Number(player.posteriorAbilityRate),
      reliability,
      reusedExisting: true,
    };
  }
  const { posterior, reliability } = args.empiricalBayes(
    fusedRateRaw,
    possessions,
    priorMean,
    priorEquivalentPossessions
  );
  return { posterior, reliability, reusedExisting: false };
}

export type DistSummary = {
  count: number;
  nonzeroCount: number;
  nonzeroShare: number;
  mean: number;
  sd: number;
  median: number;
  min: number;
  max: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
};

export function summarizeDistribution(xs: number[]): DistSummary {
  const vals = xs.filter((x) => Number.isFinite(x));
  const n = vals.length;
  if (!n) {
    return {
      count: 0,
      nonzeroCount: 0,
      nonzeroShare: 0,
      mean: NaN,
      sd: NaN,
      median: NaN,
      min: NaN,
      max: NaN,
      p5: NaN,
      p25: NaN,
      p75: NaN,
      p95: NaN,
    };
  }
  const sorted = vals.slice().sort((a, b) => a - b);
  const q = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]!;
  const mean = vals.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(
    vals.reduce((s, x) => s + (x - mean) ** 2, 0) / n
  );
  const nonzeroCount = vals.filter((x) => Math.abs(x) > 1e-12).length;
  return {
    count: n,
    nonzeroCount,
    nonzeroShare: nonzeroCount / n,
    mean,
    sd,
    median: q(0.5),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    p5: q(0.05),
    p25: q(0.25),
    p75: q(0.75),
    p95: q(0.95),
  };
}

/** Degeneracy heuristics for expected-nonzero component fields. */
export function componentHealth(
  label: string,
  xs: number[],
  opts: { minNonzeroShare?: number; minSd?: number } = {}
): { label: string; ok: boolean; reasons: string[]; dist: DistSummary } {
  const dist = summarizeDistribution(xs);
  const minNonzeroShare = opts.minNonzeroShare ?? 0.5;
  const minSd = opts.minSd ?? 1e-6;
  const reasons: string[] = [];
  if (dist.count === 0) reasons.push("empty");
  if (dist.nonzeroShare < minNonzeroShare)
    reasons.push(`nonzeroShare=${dist.nonzeroShare.toFixed(3)}<${minNonzeroShare}`);
  if (!(dist.sd > minSd)) reasons.push(`sd_collapsed=${dist.sd}`);
  if (valsAllEqual(xs)) reasons.push("constant_field");
  return { label, ok: reasons.length === 0, reasons, dist };
}

function valsAllEqual(xs: number[]): boolean {
  const finite = xs.filter((x) => Number.isFinite(x));
  if (finite.length < 2) return false;
  const first = finite[0]!;
  return finite.every((x) => Math.abs(x - first) < 1e-12);
}

export type LineageCheckRow = {
  playerId: string;
  publishedAbilityResidual: number;
  posteriorReconstructionResidual: number;
  liteFusionReconstructionResidual: number;
  fusionModeHint: "oof_or_stored" | "lite_match";
};

/**
 * A2 invariants for a published player row (does not change formulas).
 * - drbl100 == posteriorAbilityRate
 * - posterior reconstructs from fusedRateRaw via EB
 * - lite fusion residual (OOF fused may differ from lite — reported, not forced zero)
 */
export function checkPlayerAbilityLineage(
  player: PlayerRecord,
  tol = 1e-3
): LineageCheckRow & { passPublished: boolean; passPosterior: boolean } {
  const n = Number(player.actualPossessions ?? player.possessions) || 0;
  const fused = Number(player.fusedRateRaw) || 0;
  const priorMean = Number(player.priorMean) || 0;
  const priorEq =
    Number(player.priorEquivalentPossessions) || PRIOR_EQUIVALENT_POSSESSIONS;
  const post = Number(player.posteriorAbilityRate);
  const drbl100 = Number(player.drbl100);
  const { posterior: recon } = empiricalBayesRate(fused, n, priorMean, priorEq);
  const lite = fusePlayerRating({
    drblP: Number(player.drblP) || 0,
    drblLn: Number(player.drblLn) || 0,
    drblB: Number.isFinite(Number(player.drblB))
      ? Number(player.drblB)
      : undefined,
    possessions: n,
  });
  const publishedAbilityResidual = drbl100 - post;
  const posteriorReconstructionResidual = post - recon;
  const liteFusionReconstructionResidual = fused - lite;
  return {
    playerId: String(player.playerId),
    publishedAbilityResidual,
    posteriorReconstructionResidual,
    liteFusionReconstructionResidual,
    fusionModeHint:
      Math.abs(liteFusionReconstructionResidual) <= tol
        ? "lite_match"
        : "oof_or_stored",
    passPublished: Math.abs(publishedAbilityResidual) <= tol,
    passPosterior: Math.abs(posteriorReconstructionResidual) <= tol,
  };
}

export function makeArtifactGenerationId(
  season: string,
  gameCount: number,
  generatedAtIso: string
): string {
  const stamp = generatedAtIso.replace(/[:.]/g, "-");
  return `${season}-g${gameCount}-${stamp}`;
}
