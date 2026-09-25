/**
 * Season-readiness checks for DRBL/WAR1 auto-update plumbing.
 * No live NBA Stats calls — safe to run in CI/offseason without raw cache.
 *
 *   npx tsx scripts/drbl-season-readiness.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getSeasonEntry,
  listDrblSeasons,
} from "../drbl/historical/season-registry";
import {
  isDrblSeason,
  listDrblSeasons as listProductDrblSeasons,
} from "../src/data/drbl/season-registry";
import { nbaSeasonPhaseInfo } from "./lib/nba-season-phase.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

function main() {
  const info = nbaSeasonPhaseInfo(new Date());
  console.log("phase", info);

  const seasons = listDrblSeasons();
  assert.ok(seasons.includes("2025-26"));
  assert.equal(isDrblSeason("2025-26"), true);
  // Next season stays unpublished until nightly bake writes ≥50 finals.
  assert.equal(isDrblSeason("2026-27"), false);
  assert.ok(getSeasonEntry("2026-27"), "2026-27 stub exists in registry");
  assert.equal(getSeasonEntry("2026-27")?.drblAvailable, false);
  assert.deepEqual(listProductDrblSeasons().sort(), seasons.sort());

  const sealed = readJson("src/data/drbl/precomputed/2025-26.json") as {
    season?: string;
    gamesProcessed?: number;
    players?: unknown[];
    warModel?: { calibrated?: boolean };
    generatedAt?: string;
  };
  assert.equal(sealed.season, "2025-26");
  assert.ok((sealed.gamesProcessed ?? 0) >= 1200);
  assert.ok((sealed.players?.length ?? 0) >= 400);
  assert.ok(sealed.generatedAt);
  console.log("2025-26 sealed", {
    gamesProcessed: sealed.gamesProcessed,
    players: sealed.players?.length,
    warCalibrated: sealed.warModel?.calibrated ?? null,
  });

  const overlay = readJson(
    "src/data/runtime/drbl-overlay-snapshot.json"
  ) as { seasons?: Record<string, unknown[]> };
  assert.ok(overlay.seasons?.["2025-26"]);
  assert.ok((overlay.seasons?.["2025-26"]?.length ?? 0) >= 400);
  assert.equal(overlay.seasons?.["2026-27"], undefined);

  const sync = fs.readFileSync(
    path.join(ROOT, "scripts/daily-runtime-sync.mjs"),
    "utf8"
  );
  assert.ok(sync.includes("drbl-daily-recompute"));
  assert.ok(sync.includes("drbl-recompute"));
  assert.ok(sync.includes("softFailed"));

  const workflow = fs.readFileSync(
    path.join(ROOT, ".github/workflows/daily-runtime-refresh.yml"),
    "utf8"
  );
  assert.ok(workflow.includes("Cache DRBL raw responses"));
  assert.ok(workflow.includes("data/drbl/raw"));
  assert.ok(workflow.includes("Cache DRBL precomputed (live season only)"));
  assert.ok(workflow.includes("precomputed/${{ steps.season.outputs.season }}.json"));

  const compute = fs.readFileSync(
    path.join(ROOT, "scripts/drbl-compute-season.ts"),
    "utf8"
  );
  assert.ok(compute.includes("refreshGameList"));
  assert.ok(compute.includes("--refresh-games"));

  const daily = fs.readFileSync(
    path.join(ROOT, "scripts/drbl-daily-recompute.ts"),
    "utf8"
  );
  assert.ok(daily.includes("MIN_GAMES_TO_PUBLISH"));
  assert.ok(daily.includes("listSeasonGames"));

  console.log("drbl-season-readiness: ok");
}

main();
