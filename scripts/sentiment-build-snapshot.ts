/**
 * Build curated sentiment snapshot from seeds + optional observation batches.
 * Run: npm run sentiment:build
 */
import { buildSentimentSnapshot } from "../src/sentiment/build-snapshot";

const dryRun = process.argv.includes("--dry-run");
const verbose = !process.argv.includes("--quiet");

buildSentimentSnapshot({ dryRun, verbose })
  .then((result) => {
    if (verbose) {
      console.log(
        dryRun
          ? `dry-run ok — would write ${result.outputPath}`
          : `wrote ${result.outputPath}`
      );
      console.log(
        `  movers: +${result.snapshot.meta.movers?.risers.length ?? 0} / -${result.snapshot.meta.movers?.fallers.length ?? 0} · generated=${result.generatedProfileCount}`
      );
    }
  })
  .catch((error) => {
    console.error("sentiment:build failed", error);
    process.exit(1);
  });
