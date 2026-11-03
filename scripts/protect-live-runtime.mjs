#!/usr/bin/env node
/**
 * Run on every code-only deploy AND after main pushes that touch the boards.
 * Recovers from the freshest nightly commit instead of trusting main (which
 * may have been overwritten by a stale, manually constructed merge tree).
 *
 * Usage: node scripts/protect-live-runtime.mjs --repair
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LIVE_BOARD_FILES, snapshotRegressed } from "./lib/live-runtime-guard.mjs";

function command(name, args, maxBuffer = 32 * 1024 * 1024) {
  return execFileSync(name, args, { encoding: "utf8", maxBuffer, stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
}
function findLatestNightlyCommit() {
  if (process.env.LIVE_RUNTIME_SOURCE_SHA) return process.env.LIVE_RUNTIME_SOURCE_SHA;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is required to protect live runtime data");
  for (let page = 1; page <= 10; page++) {
    // Do not use commits?path=standings: GitHub's history simplification can
    // hide a nightly commit if a later feature merge reset the same file.
    const commits = JSON.parse(command("gh", ["api", `repos/${repo}/commits?sha=main&per_page=100&page=${page}`]));
    const latest = commits.find(row => /^Nightly data refresh \[skip ci\]/.test(row.commit?.message ?? ""));
    if (latest?.sha) return latest.sha;
    if (commits.length < 100) break;
  }
  throw new Error("No recent nightly data commit found; refusing to ship potentially stale live records.");
}
function main() {
  if (!process.argv.includes("--repair")) throw new Error("Use --repair to opt in to restoring outdated live boards");
  const sha = findLatestNightlyCommit();
  command("git", ["fetch", "--no-tags", "--depth=1", "origin", sha]);
  let repaired = 0;
  for (const file of LIVE_BOARD_FILES) {
    const nightlyText = command("git", ["show", `${sha}:${file}`]);
    const nightly = JSON.parse(nightlyText);
    const current = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    if (snapshotRegressed(file, current, nightly)) {
      writeFileSync(file, nightlyText + "\n");
      console.log(`[live-board-guard] restored ${file} from ${sha.slice(0, 8)} (${current?.generatedAt ?? "missing"} -> ${nightly.generatedAt})`);
      repaired++;
    } else {
      console.log(`[live-board-guard] current ${file} is at least as fresh as nightly ${sha.slice(0, 8)}`);
    }
  }
  console.log(`[live-board-guard] repaired=${repaired}`);
}
try {
  main();
} catch (error) {
  console.error(`[live-board-guard] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
