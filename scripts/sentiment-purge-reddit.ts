/**
 * Delete everything derived from Reddit: the daily averages in
 * data/sentiment/ingest/v1/reddit, then rebuild the snapshot without them.
 * Run this if Reddit API access ends or Reddit asks for deletion.
 *
 *   npm run sentiment:purge:reddit
 */

import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { INGEST_ROOT } from "@/sentiment/ingest-store";

const dir = path.join(INGEST_ROOT, "reddit");
if (existsSync(dir)) {
  rmSync(dir, { recursive: true, force: true });
  console.log(`sentiment:purge:reddit deleted ${path.relative(process.cwd(), dir)}`);
} else {
  console.log("sentiment:purge:reddit nothing stored");
}
execSync("npm run -s sentiment:build", { stdio: "inherit" });
