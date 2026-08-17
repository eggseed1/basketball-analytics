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
