#!/usr/bin/env node
/**
 * Fail loudly when the nightly job stops refreshing the Movement Center.
 *
 * The sync soft-fails movement steps so one flaky feed doesn't block a
 * deploy. This check runs after the deploy and turns the run red (GitHub
 * emails on failed scheduled runs) when the baked snapshot or its newest
 * headline is older than MAX_AGE_HOURS.
 *
 *   node scripts/check-movement-freshness.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BUILD_AGE_HOURS = Number(process.env.MOVEMENT_MAX_AGE_HOURS || 36);
const MAX_HEADLINE_AGE_HOURS = Number(process.env.MOVEMENT_MAX_HEADLINE_AGE_HOURS || 72);

const file = path.join(ROOT, "src", "data", "runtime", "movement-snapshot.json");
const meta = JSON.parse(await fs.readFile(file, "utf8"))?.snapshot?.meta ?? {};
const hoursSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity);

const problems = [];
const buildAge = hoursSince(meta.builtAt);
if (buildAge > MAX_BUILD_AGE_HOURS) {
  problems.push(`snapshot built ${meta.builtAt ?? "never"} (${buildAge.toFixed(0)}h ago, limit ${MAX_BUILD_AGE_HOURS}h)`);
}
const headlineAge = hoursSince(meta.latestHeadlineAt);
if (headlineAge > MAX_HEADLINE_AGE_HOURS) {
  problems.push(
    `newest headline ${meta.latestHeadlineAt ?? "none"} (${headlineAge.toFixed(0)}h ago, limit ${MAX_HEADLINE_AGE_HOURS}h); check the publisher feeds`
  );
}

console.log(
  `[movement-freshness] builtAt=${meta.builtAt} latestHeadlineAt=${meta.latestHeadlineAt} latestTransactionDate=${meta.latestTransactionDate}`
);
if (problems.length) {
  for (const p of problems) console.error(`::error title=Movement Center is stale::${p}`);
  process.exitCode = 1;
}
