/**
 * Client-safe PBP surface: types + static capability denial.
 *
 * Filesystem / manifest / corpus access lives in `./corpus` (Node/CLI)
 * and `./corpus.server` (Next.js `server-only` wrapper).
 * Do NOT re-export corpus from this barrel — Turbopack will pull `node:fs`
 * into any client chunk that imports `@/pbp` via `@/analytics` → game-lab.
 */

export type {
  PbpCapability,
  PbpCorpusAttachment,
  PbpCorpusManifest,
  PbpCorpusStatus,
  PbpEvent,
  PbpEventType,
  Possession,
} from "./types";

export type {
  GamePbpCapability,
  GamePbpCapabilityStatus,
  GamePossessionAvailable,
  GamePossessionData,
  GamePossessionResult,
  GamePossessionUnavailable,
  LineupValidationReport,
  OfficialPossessionComparison,
  OfficialPossessionResult,
  OfficialPossessionSource,
  OfficialPossessionUnavailableReason,
  PossessionCalibrationGrade,
  PossessionPipelineDiagnostics,
  PbpProductSource,
  PbpProvenance,
  ReconstructedPossessionResult,
  PossessionValidationReport,
} from "./product-types";

export {
  buildGamePbpCapability,
  mapPlayByPlaySource,
  unavailableCapability,
} from "./capability";

import type { PbpCapability } from "./types";

/** Honest capability report — corpus attach does not flip these. */
export function getPbpCapability(): PbpCapability {
  return {
    gamesIndexed: false,
    possessionsDerived: false,
    shotLocations: false,
    lineups: false,
  };
}
