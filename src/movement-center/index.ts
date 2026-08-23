/**
 * Movement Center / Rumor Mill — future Live NBA Intelligence layer.
 * Architecture + types only until Phase M1. See docs/architecture/movement-center.md
 */

export * from "./types";
export * from "./prominence";
export * from "./scoring";
export * from "./load-curated";
export * from "./resolutions";
export { readMovementSnapshotSync } from "./read-snapshot";
export { buildMovementSnapshot } from "./build-snapshot";
export { isResolvedMovementState, movementStateLabel } from "./cluster-state";
