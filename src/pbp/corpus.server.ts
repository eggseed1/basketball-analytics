/**
 * Next.js server-only PBP corpus wrapper.
 *
 * Application Server Components / route handlers MUST import from here
 * (`@/pbp/corpus.server`) so `server-only` blocks client bundles.
 *
 * CLI / tsx scripts import `@/pbp/corpus` (Node-safe, no server-only).
 */

import "server-only";

export {
  DEFAULT_PBP_DATA_DIR,
  MANIFEST_FILENAME,
  getPbpCorpusManifest,
  getPbpCorpusStatus,
  getPbpGameRecord,
  resolvePbpDataPath,
  validatePbpCorpusManifest,
} from "./corpus";
