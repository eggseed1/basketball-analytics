/**
 * Admit candidate advanced observations into a diagnostic store.
 * Does not hydrate PlayerSeason. Does not expose UI metrics.
 */

import {
  advancedObservationKey,
  isCanonicalAdvancedSeason,
  isFiniteAdvancedValue,
  provenanceIsComplete,
} from "@/data/providers/advanced-stats/normalize";
import type { AdvancedSeasonObservation } from "@/data/types/advanced-season-stats";

export type AdvancedStatsAdmitState = {
  observations: AdvancedSeasonObservation[];
  byKey: Map<string, AdvancedSeasonObservation>;
  duplicateKeyCount: number;
  invalidValueCount: number;
  invalidSeasonCount: number;
  incompleteProvenanceCount: number;
  identityCollisionCount: number;
  notes: string[];
};

export function createEmptyAdmitState(): AdvancedStatsAdmitState {
  return {
    observations: [],
    byKey: new Map(),
    duplicateKeyCount: 0,
    invalidValueCount: 0,
    invalidSeasonCount: 0,
    incompleteProvenanceCount: 0,
    identityCollisionCount: 0,
    notes: [],
  };
}

/**
 * Detect when the same ESPN id maps to different BDL/NBA ids within a batch
 * (or vice versa) — collision, not silent merge.
 */
function recordIdentityCollisions(
  state: AdvancedStatsAdmitState,
  obs: AdvancedSeasonObservation
): void {
  if (!obs.playerId) return;
  for (const existing of state.observations) {
    if (!existing.playerId || existing.playerId !== obs.playerId) continue;
    if (
      obs.bdlPlayerId &&
      existing.bdlPlayerId &&
      obs.bdlPlayerId !== existing.bdlPlayerId
    ) {
      state.identityCollisionCount += 1;
      return;
    }
    if (
      obs.nbaPlayerId &&
      existing.nbaPlayerId &&
      obs.nbaPlayerId !== existing.nbaPlayerId
    ) {
      state.identityCollisionCount += 1;
      return;
    }
  }
}

export function admitAdvancedObservation(
  state: AdvancedStatsAdmitState,
  obs: AdvancedSeasonObservation
): boolean {
  if (!isCanonicalAdvancedSeason(obs.season)) {
    state.invalidSeasonCount += 1;
    return false;
  }
  if (!isFiniteAdvancedValue(obs.value)) {
    state.invalidValueCount += 1;
    return false;
  }
  if (!provenanceIsComplete(obs)) {
    state.incompleteProvenanceCount += 1;
    // Still admit for coverage diagnostics, but count incompleteness.
  }

  const key = advancedObservationKey(obs);
  if (state.byKey.has(key)) {
    state.duplicateKeyCount += 1;
    return false;
  }

  recordIdentityCollisions(state, obs);
  state.byKey.set(key, obs);
  state.observations.push(obs);
  return true;
}

export function admitAdvancedObservations(
  rows: AdvancedSeasonObservation[]
): AdvancedStatsAdmitState {
  const state = createEmptyAdmitState();
  for (const row of rows) {
    admitAdvancedObservation(state, row);
  }
  return state;
}
