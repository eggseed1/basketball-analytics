#!/usr/bin/env node
/**
 * DRBL release gate - runs critical tests in labeled sections.
 *
 * Fixture/unit: offline / injected / source-inspected (no ESPN required).
 * Live ESPN: constructs NBADataProvider inside queries (DATA_PROVIDER may be
 * unset; tsx does not load .env.local). Requires network to ESPN public JSON.
 *
 * Usage: npm run test:drbl-release
 */
import { spawnSync } from "node:child_process";

type Step = { label: string; script: string };

const FIXTURE: Step[] = [
  { label: "data-truth", script: "test:data-truth" },
  { label: "advanced-stats-audit", script: "test:advanced-stats-audit" },
  { label: "progressive-destinations", script: "test:progressive-destinations" },
  { label: "cross-route-continuity", script: "test:cross-route-continuity" },
  { label: "ui-continuity", script: "test:ui-continuity" },
  { label: "team-intelligence", script: "test:team-intelligence" },
  { label: "team-identity", script: "test:team-identity" },
  { label: "historical-team-era", script: "test:historical-team-era" },
  { label: "historical-team-brand", script: "test:historical-team-brand" },
  { label: "player-data-health", script: "test:player-data-health" },
  { label: "player-board-resilience", script: "test:player-board-resilience" },
  { label: "teams-catalog-resilience", script: "test:teams-catalog-resilience" },
  { label: "scoreboard-resilience", script: "test:scoreboard-resilience" },
  { label: "production-provider-guard", script: "test:production-provider-guard" },
  { label: "game-lab", script: "test:game-lab" },
  { label: "ask-drbl", script: "test:ask-drbl" },
  { label: "ask-examples", script: "test:ask-examples" },
  { label: "pbp-capability", script: "test:pbp-capability" },
  { label: "offseason-tracker", script: "test:offseason-tracker" },
  { label: "transaction-lineage", script: "test:transaction-lineage" },
  { label: "transaction-player-resolve", script: "test:transaction-player-resolve" },
];

const LIVE_ESPN: Step[] = [
  {
    label: "historical-team-fail-fast (ESPN board/roster + local archive)",
    script: "test:historical-team-fail-fast",
  },
  {
    label: "team-assets (ESPN BOS roster slice when board ok)",
    script: "test:team-assets",
  },
  {
    label: "game-shell (schedule/historical shell + fixture assertions)",
    script: "test:game-shell",
  },
];

function runSection(title: string, note: string, steps: Step[]) {
  console.log(`\n======== ${title} ========`);
  console.log(note);
  for (const step of steps) {
    console.log(`\n--- ${step.label} (${step.script}) ---`);
    const result = spawnSync("npm", ["run", step.script], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      console.error(`\nFAILED: ${step.script}`);
      process.exit(result.status ?? 1);
    }
  }
}

const section = process.argv[2] ?? "all";

if (section === "fixture" || section === "all") {
  runSection(
    "FIXTURE / UNIT (deterministic)",
    "No live ESPN required. Injected loaders, fixtures, and source inspection.",
    FIXTURE
  );
}

if (section === "live-espn" || section === "all") {
  runSection(
    "LIVE ESPN (provider-specific)",
    "Requires network to ESPN public JSON. Queries construct NBADataProvider for supported seasons; do not rely on DATA_PROVIDER=local sample rows.",
    LIVE_ESPN
  );
}

if (section === "all") {
  console.log("\n--- report:pbp-coverage (diagnostic; corpus may be absent) ---");
  const report = spawnSync("npm", ["run", "report:pbp-coverage"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (report.status !== 0) {
    console.error("\nFAILED: report:pbp-coverage");
    process.exit(report.status ?? 1);
  }
}

console.log("\ntest:drbl-release: OK");
