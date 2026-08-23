/**
 * Build Movement Center snapshot from curated seeds + ESPN roster sync.
 * Run: npm run movement:build
 */
import { buildMovementSnapshot } from "../src/movement-center/build-snapshot";

const dryRun = process.argv.includes("--dry-run");
const verbose = !process.argv.includes("--quiet");

buildMovementSnapshot({ dryRun, verbose })
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
