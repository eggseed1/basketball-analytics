#!/usr/bin/env node
/**
 * Code-only deploys bake main's DRBL files, but the nightly refresh only
 * commits the live season's DRBL on season-commit days. Without this, every
 * deploy-site run drops the live season's DRBL/WAR1 until the next nightly
 * redeploys it, so the site flips between "published" and "not qualified".
 *
 * Restores the live season's DRBL files from the newest nightly artifact when
 * that artifact is fresher than the checkout.
 *
 *   GH_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/restore-drbl-nightly-artifact.mjs
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalSeasonFromStartYear, currentNbaStartYear } from "./lib/nba-season-phase.mjs";

const season = canonicalSeasonFromStartYear(currentNbaStartYear());
const artifactName = `drbl-precomputed-${season}`;
const TARGETS = [
  `src/data/drbl/precomputed/${season}.json`,
  "src/data/runtime/drbl-published-seasons.json",
  "src/data/runtime/drbl-overlay-snapshot.json",
];
const OVERLAY = "src/data/runtime/drbl-overlay-snapshot.json";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function generatedAt(file) {
  try {
    return String(JSON.parse(readFileSync(file, "utf8")).generatedAt ?? "");
  } catch {
    return "";
  }
}

function findFile(dir, base) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      const hit = findFile(full, base);
      if (hit) return hit;
    } else if (name === base) {
      return full;
    }
  }
  return null;
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is required");
  // Nightly runs often end "failure" on the step-health check after a good sync and deploy.
  const runs = JSON.parse(
    gh(["run", "list", "--repo", repo, "--workflow", "daily-runtime-refresh.yml", "--branch", "main", "--limit", "15", "--json", "databaseId"])
  );
  for (const { databaseId } of runs) {
    const { artifacts = [] } = JSON.parse(gh(["api", `repos/${repo}/actions/runs/${databaseId}/artifacts`]));
    if (!artifacts.some((a) => a.name === artifactName && !a.expired)) continue;
    const dir = mkdtempSync(path.join(tmpdir(), "drbl-nightly-"));
    gh(["run", "download", String(databaseId), "--repo", repo, "--name", artifactName, "--dir", dir]);
    const overlay = findFile(dir, path.basename(OVERLAY));
    const nightlyAt = overlay ? generatedAt(overlay) : "";
    const currentAt = generatedAt(OVERLAY);
    if (!overlay || !nightlyAt || nightlyAt <= currentAt) {
      console.log(`[drbl-restore] checkout overlay (${currentAt || "missing"}) is at least as fresh as run ${databaseId} (${nightlyAt || "none"})`);
      return;
    }
    for (const target of TARGETS) {
      const src = findFile(dir, path.basename(target));
      if (!src) continue;
      copyFileSync(src, target);
      console.log(`[drbl-restore] ${target} <- run ${databaseId}`);
    }
    console.log(`[drbl-restore] ${season} DRBL ${currentAt || "missing"} -> ${nightlyAt}`);
    return;
  }
  console.log(`[drbl-restore] no unexpired ${artifactName} artifact in recent nightly runs; keeping checkout`);
}

try {
  if (!existsSync(OVERLAY)) console.log(`[drbl-restore] ${OVERLAY} missing in checkout`);
  main();
} catch (error) {
  // A missing artifact must not block a code ship; the next nightly redeploys DRBL.
  console.error(`[drbl-restore] skipped: ${error instanceof Error ? error.message : String(error)}`);
}
