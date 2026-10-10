#!/usr/bin/env node
/**
 * Fail loudly when a nightly step has been soft-failing for too long.
 *
 * Soft-failed steps keep their last good output, so the site stays up but
 * quietly goes stale. daily-runtime-sync.mjs records when each failing step
 * started failing in data/ops/step-health.json; this check runs after the
 * deploy and turns the run red (GitHub emails on failed scheduled runs) once
 * any step has failed for longer than STEP_MAX_FAIL_HOURS.
 *
 *   node scripts/check-step-health.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_FAIL_HOURS = Number(process.env.STEP_MAX_FAIL_HOURS || 72);

let failing = {};
try {
  failing = JSON.parse(await fs.readFile(path.join(ROOT, "data", "ops", "step-health.json"), "utf8")).failing ?? {};
} catch {
  console.log("[step-health] no step-health.json yet");
}

const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3_600_000;
const entries = Object.entries(failing).map(([label, { since }]) => ({ label, since, hours: hoursSince(since) }));
console.log(
  `[step-health] failing: ${entries.map((e) => `${e.label} since ${e.since} (${e.hours.toFixed(0)}h)`).join("; ") || "none"}`
);

const stale = entries.filter((e) => e.hours > MAX_FAIL_HOURS);
if (stale.length) {
  for (const e of stale) {
    console.error(
      `::error title=Nightly step ${e.label} keeps failing::${e.label} has soft-failed every run since ${e.since} (${e.hours.toFixed(0)}h, limit ${MAX_FAIL_HOURS}h); its data is not refreshing`
    );
  }
  process.exit(1);
}
