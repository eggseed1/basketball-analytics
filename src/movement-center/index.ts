/**
 * Movement Center / Rumor Mill. Phase M1: publisher headlines + ESPN
 * transaction log. See docs/architecture/movement-center.md
 */

export * from "./types";
export * from "./prominence";
export * from "./scoring";
export * from "./load-curated";
export * from "./resolutions";
export { readMovementSnapshotSync } from "./read-snapshot";
export { buildMovementSnapshot } from "./build-snapshot";
export { isResolvedMovementState, movementStateLabel } from "./cluster-state";
