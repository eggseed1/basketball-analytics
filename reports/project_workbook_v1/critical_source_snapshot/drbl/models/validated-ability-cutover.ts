/**
 * M16k1 validated ability cutover — transform precomputed boards onto
 * validatedDRBL100 without replaying games (rawAbilityRate + N are frozen).
 *
 * Preserves WAR / O/D / component diagnostic fields numerically.
 * Re-ranks by descending unrounded validatedDRBL100.
 */
import { createHash } from "node:crypto";

import type { DrblSeasonArtifact } from "./compute-season";
import type { DrblPlayerSeasonRow } from "./player-value";
import {
  VALIDATED_ABILITY_MODEL_VERSION,
  VALIDATED_ATTRIBUTION_VERSION,
  VALIDATED_CALIBRATION,
  VALIDATED_K,
  VALIDATED_PRIOR_MEAN,
  VALIDATED_ZERO_SEMANTICS,
  computeValidatedAbilityV1,
} from "./validated-ability-v1";
import {
  ABILITY_LINEAGE_VERSION,
  CANONICAL_ABILITY_INPUT,
} from "./ability-lineage";

export const DRBL_CANONICAL_ABILITY_SOURCE_ENV =
  "DRBL_CANONICAL_ABILITY_SOURCE";

/** Default after M16k1: validated. Set to "legacy" for rollback. */
export function getCanonicalAbilitySource(
  env: NodeJS.ProcessEnv = process.env
): "validated" | "legacy" {
  const v = (env[DRBL_CANONICAL_ABILITY_SOURCE_ENV] ?? "validated").toLowerCase();
  if (v === "legacy" || v === "fused" || v === "rollback") return "legacy";
  return "validated";
}

function actualN(p: {
  combinedPossessionAppearances?: number;
  actualPossessions?: number;
  possessions?: number;
}): number {
  return Number(
    p.combinedPossessionAppearances ??
      p.actualPossessions ??
      p.possessions ??
      NaN
  );
}

function sha256Json(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export type CutoverPlayer = DrblPlayerSeasonRow & {
  abilityModelVersion?: string;
  attributionVersion?: string;
  posteriorStrength?: number;
  calibration?: string;
  zeroSemantics?: string;
  combinedPossessionAppearances?: number;
};

/**
 * Apply validated ability + DRBL rank to one season artifact.
 * WAR / O/D / fusedRateRaw / legacy posteriorAbilityRate preserved.
 */
export function applyValidatedAbilityCutoverToArtifact(
  artifact: DrblSeasonArtifact
): DrblSeasonArtifact {
  const transformed: CutoverPlayer[] = [];

  for (const p of artifact.players as CutoverPlayer[]) {
    const N = actualN(p);
    const raw = Number(p.rawAbilityRate);
    if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(raw)) {
      transformed.push({ ...p });
      continue;
    }
    const v = computeValidatedAbilityV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: N,
    });
    transformed.push({
      ...p,
      // Full precision until after rank sort
      drbl100: v.validatedDRBL100,
      reliabilityWeight: v.validatedReliability,
      priorMean: VALIDATED_PRIOR_MEAN,
      priorEquivalentPossessions: VALIDATED_K,
      publishedAbilityInput: CANONICAL_ABILITY_INPUT,
      abilityLineageVersion: ABILITY_LINEAGE_VERSION,
      abilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
      attributionVersion: VALIDATED_ATTRIBUTION_VERSION,
      posteriorStrength: VALIDATED_K,
      calibration: VALIDATED_CALIBRATION,
      zeroSemantics: VALIDATED_ZERO_SEMANTICS,
      // Keep legacy fused posterior / intervals as diagnostic fields only
      // (already on `p` — not overwritten).
    });
  }

  // Rank by unrounded validated DRBL (only eligible rows keep prior eligibility).
  const eligible = transformed.filter(
    (r) => r.eligibilityStatus !== "insufficient_sample"
  );
  const ineligible = transformed.filter(
    (r) => r.eligibilityStatus === "insufficient_sample"
  );

  eligible.sort((a, b) => {
    if (b.drbl100 !== a.drbl100) return b.drbl100 - a.drbl100;
    const na = Number(a.actualPossessions ?? a.possessions ?? 0);
    const nb = Number(b.actualPossessions ?? b.possessions ?? 0);
    if (nb !== na) return nb - na;
    return a.playerId.localeCompare(b.playerId);
  });

  const ranked = eligible.map((p, i) => ({
    ...p,
    rank: i + 1,
    drbl100: Number(p.drbl100.toFixed(2)),
    reliabilityWeight: Number(Number(p.reliabilityWeight).toFixed(4)),
  }));

  const ineligibleOut = ineligible.map((p) => ({
    ...p,
    rank: undefined,
    drbl100: Number(Number(p.drbl100).toFixed(2)),
  }));

  return {
    ...artifact,
    generatedAt: new Date().toISOString(),
    publishedAbilityInput: CANONICAL_ABILITY_INPUT,
    abilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
    abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    players: [...ranked, ...ineligibleOut] as DrblPlayerSeasonRow[],
  } as DrblSeasonArtifact & {
    abilityModelVersion: string;
    publishedAbilityInput: string;
  };
}

export function artifactContentHash(artifact: DrblSeasonArtifact): string {
  // Hash player ability/rank/war/od fields for equality checks
  const rows = (artifact.players ?? []).map((p) => ({
    playerId: p.playerId,
    drbl100: p.drbl100,
    rank: p.rank,
    rawAbilityRate: p.rawAbilityRate,
    drblWar: p.drblWar,
    seasonalImpact: p.seasonalImpact,
    drblO: p.drblO,
    drblD: p.drblD,
    abilityModelVersion: (p as CutoverPlayer).abilityModelVersion,
  }));
  return sha256Json(rows);
}
