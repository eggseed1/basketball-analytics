/**
 * Build the Movement Center snapshot from stored publisher headlines
 * (npm run sentiment:ingest:news) and the ESPN transaction log.
 * Run: npm run movement:build [-- --dry-run] [-- --offline]
 */
import { buildMovementSnapshot } from "../src/movement-center/build-snapshot";

const dryRun = process.argv.includes("--dry-run");
const offline = process.argv.includes("--offline");
const verbose = !process.argv.includes("--quiet");

buildMovementSnapshot({ dryRun, offline, verbose })
  .then((result) => {
    if (verbose) {
      console.log(
        dryRun
          ? `dry-run ok — would write ${result.outputPath}`
          : `wrote ${result.outputPath}`
      );
    }
  })
  .catch((error) => {
    console.error("movement:build failed", error);
    process.exit(1);
  });
