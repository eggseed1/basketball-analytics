/**
 * Integration checks for tip-off publish without leaving stubs on disk.
 * Run: npx tsx --test scripts/drbl-tipoff-publish.test.ts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isSeasonInPublishedFile,
  seasonsFromPublishedFile,
} from "../src/data/drbl/published-seasons";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRE = path.join(ROOT, "src/data/drbl/precomputed/2026-27.json");
const PUBLISHED = path.join(
  ROOT,
  "src/data/runtime/drbl-published-seasons.json"
);

function bakeOverlay() {
  const result = spawnSync("node", ["scripts/build-runtime-drbl-overlay.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("overlay publishes 2026-27 once a 50-game precomputed stub exists", () => {
  const stub = {
    season: "2026-27",
    gamesProcessed: 50,
    generatedAt: new Date().toISOString(),
    players: [
      {
        playerId: "999001",
        playerName: "Tipoff Stub",
        teamId: "1",
        drbl100: 1,
        rawAbilityRate: 0.01,
        possessions: 100,
        actualPossessions: 100,
        drblO: 0.4,
        drblD: 0.4,
        drblP: 0.4,
        drblLn: 0.4,
        drblB: 0.4,
        r1Points: 5,
        r1WinEquivalents: 0.1,
      },
    ],
  };

  fs.writeFileSync(PRE, JSON.stringify(stub));
  try {
    bakeOverlay();
    const published = JSON.parse(fs.readFileSync(PUBLISHED, "utf8"));
    assert.ok(isSeasonInPublishedFile(published, "2026-27"));
    assert.ok(seasonsFromPublishedFile(published).includes("2026-27"));
    const overlay = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "src/data/runtime/drbl-overlay-snapshot.json"),
        "utf8"
      )
    );
    assert.equal(overlay.seasons["2026-27"]?.length, 1);
  } finally {
    fs.unlinkSync(PRE);
    bakeOverlay();
    const published = JSON.parse(fs.readFileSync(PUBLISHED, "utf8"));
    assert.equal(isSeasonInPublishedFile(published, "2026-27"), false);
  }
});

test("thin early-season stub stays unpublished", () => {
  const stub = {
    season: "2026-27",
    gamesProcessed: 12,
    players: [],
  };
  fs.writeFileSync(PRE, JSON.stringify(stub));
  try {
    bakeOverlay();
    const published = JSON.parse(fs.readFileSync(PUBLISHED, "utf8"));
    assert.equal(isSeasonInPublishedFile(published, "2026-27"), false);
  } finally {
    fs.unlinkSync(PRE);
    bakeOverlay();
  }
});
