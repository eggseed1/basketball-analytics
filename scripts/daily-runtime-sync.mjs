#!/usr/bin/env node
/**
 * Daily in-season runtime refresh for player visualizations (race + scatters).
 *
 * Rebuilds the deploy-baked snapshots Cloudflare Workers serve:
 *   - current-season player game logs (race curves)
 *   - BRef advanced / team board / standings (scatter peers + rankings)
 *   - DRBL season recompute (Approach B full refit) + slim overlay
 *   - DARKO overlays (impact races / scatters)
 *   - game + roster snapshots
 *
 * DRBL numbers move when finals accumulate: nightly recompute refreshes the
 * precomputed artifact, then the overlay bake ships it. Not live per tip-off.
 *
 * Every run also refreshes transactions, news and fan sentiment (Reddit, fan
 * blogs, Bluesky, YouTube), the
 * Movement Center, BRef payrolls, front-office slices and the asset ledger.
 * Offseason (before ~Oct 15 / after Finals): only those unless FORCE_DAILY=1.
 *
 *   node scripts/daily-runtime-sync.mjs
 *   FORCE_DAILY=1 node scripts/daily-runtime-sync.mjs
 *
 * GitHub Actions reads `should_deploy` from $GITHUB_OUTPUT.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  dailyGameLogMinGp,
  nbaSeasonPhaseInfo,
} from "./lib/nba-season-phase.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORCE =
  process.env.FORCE_DAILY === "1" ||
  process.env.FORCE === "1" ||
  process.argv.includes("--force");

const now = new Date();
const info = nbaSeasonPhaseInfo(now);
const minGp = dailyGameLogMinGp(now);

function log(message) {
  console.log(`[daily-runtime-sync] ${message}`);
}

async function writeGithubOutput(values) {
  const dest = process.env.GITHUB_OUTPUT;
  if (!dest) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await fs.appendFile(dest, `${lines.join("\n")}\n`);
}

async function writeReport(report) {
  const outDir = path.join(ROOT, "artifacts");
  await fs.mkdir(outDir, { recursive: true });
  const dest = path.join(outDir, "daily-runtime-sync.json");
  await fs.writeFile(dest, `${JSON.stringify(report, null, 2)}\n`);
  return dest;
}

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    log(`$ ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

/** Headlines → Movement Center. Runs after transactions so stories can resolve against them. */
const MOVEMENT_STEPS = [
  { label: "news-ingest", cmd: "npx", args: ["tsx", "scripts/sentiment-ingest-news.ts"] },
  { label: "movement-build", cmd: "npx", args: ["tsx", "scripts/movement-build-snapshot.ts"] },
  { label: "movement-snapshot", cmd: "node", args: ["scripts/build-runtime-movement-snapshot.mjs"] },
];

/**
 * Publisher feeds flake. A failed news fetch still rebuilds from stored
 * headlines and the live ESPN ledger; a failed build keeps the last snapshot.
 */
async function runMovementSteps() {
  const done = [];
  let failed = null;
  for (const step of MOVEMENT_STEPS) {
    try {
      await run(step.cmd, step.args);
      done.push(step.label);
    } catch (error) {
      log(`soft-fail ${step.label}: ${error instanceof Error ? error.message : String(error)}`);
      failed ??= step.label;
      if (step.label !== "news-ingest") break;
    }
  }
  return { done, failed };
}

/**
 * Sentiment, payroll and pick bakes. Each runs after movement (sentiment reads
 * the movement snapshot) and fails on its own without blocking the others.
 * Reddit ingest exits 0 without REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET.
 */
const ORG_STEPS = [
  { label: "reddit-ingest", cmd: "npx", args: ["tsx", "scripts/sentiment-ingest-reddit.ts"] },
  {
    label: "fan-blogs-ingest",
    cmd: "npx",
    args: ["tsx", "scripts/sentiment-ingest-news.ts", "--feeds", "fan-blogs", "--store", "fanblogs"],
  },
  { label: "bluesky-ingest", cmd: "npx", args: ["tsx", "scripts/sentiment-ingest-bluesky.ts"] },
  { label: "youtube-ingest", cmd: "npx", args: ["tsx", "scripts/sentiment-ingest-youtube.ts"] },
  { label: "headline-ratings", cmd: "npx", args: ["tsx", "scripts/sentiment-rate-headlines.ts"] },
  { label: "sentiment-build", cmd: "npx", args: ["tsx", "scripts/sentiment-build-snapshot.ts"] },
  { label: "sentiment-snapshot", cmd: "node", args: ["scripts/build-runtime-sentiment-snapshot.mjs"] },
  { label: "bref-team-contracts", cmd: "node", args: ["scripts/build-runtime-bref-team-contracts.mjs"] },
  { label: "front-office", cmd: "npx", args: ["tsx", "scripts/sync-team-front-office.ts"] },
  { label: "front-office-snapshot", cmd: "node", args: ["scripts/build-runtime-front-office-snapshot.mjs"] },
  { label: "asset-ledger", cmd: "node", args: ["scripts/sync-asset-ledger.mjs"] },
  { label: "asset-ledger-snapshot", cmd: "node", args: ["scripts/build-runtime-asset-ledger.mjs"] },
];

async function runOrgSteps() {
  const done = [];
  const failed = [];
  for (const step of ORG_STEPS) {
    try {
      await run(step.cmd, step.args);
      done.push(step.label);
    } catch (error) {
      log(`soft-fail ${step.label}: ${error instanceof Error ? error.message : String(error)}`);
      failed.push(step.label);
    }
  }
  return { done, failed };
}

/** ESPN flakes too. Workers overlay the live feed, so a stale archive is survivable. */
const TRANSACTION_STEPS = [
  {
    label: "transactions",
    cmd: "npx",
    args: [
      "tsx",
      "scripts/ingest-espn-transactions.ts",
      "--from",
      String(now.getUTCFullYear()),
      "--to",
      String(now.getUTCFullYear()),
    ],
  },
  {
    // Gap filler; on failure the previous file stays and the snapshot still rebuilds.
    label: "nba-player-movement",
    cmd: "npx",
    args: ["tsx", "--conditions=react-server", "scripts/ingest-nba-player-movement.ts"],
    optional: true,
  },
  {
    label: "transactions-snapshot",
    cmd: "node",
    args: ["scripts/build-runtime-transactions-snapshot.mjs"],
  },
];
const SOFT_FAIL = new Set(["drbl-recompute", ...TRANSACTION_STEPS.map((s) => s.label)]);

async function runTransactionSteps() {
  const failed = [];
  for (const step of TRANSACTION_STEPS) {
    try {
      await run(step.cmd, step.args);
    } catch (error) {
      log(`soft-fail ${step.label}: ${error instanceof Error ? error.message : String(error)}`);
      failed.push(step.label);
      if (!step.optional) break;
    }
  }
  return failed.length ? failed.join(", ") : null;
}

async function main() {
  const started = Date.now();
  log(
    `phase=${info.phase} season=${info.season} force=${FORCE ? "1" : "0"} minGp=${minGp}`
  );

  if (!info.shouldRefreshPlayerViz && !FORCE) {
    // Waivers and signings continue in the offseason. Refresh the ESPN
    // transaction archive even when player-viz bakes wait for tip-off.
    const transactionsFailed = await runTransactionSteps();
    const movement = await runMovementSteps();
    const org = await runOrgSteps();
    const report = {
      ok: true,
      skipped: false,
      reason: "offseason: refreshed transactions, movement center, sentiment, payroll and assets",
      movement,
      org,
      softFailed: [transactionsFailed, movement.failed, ...org.failed].filter(Boolean),
      phase: info.phase,
      season: info.season,
      shouldDeploy: true,
      generatedAt: now.toISOString(),
      durationMs: Date.now() - started,
    };
    const dest = await writeReport(report);
    await writeGithubOutput({
      should_deploy: "true",
      phase: info.phase,
      season: info.season,
      skipped: "false",
    });
    log(`offseason transactions refresh → ${dest}`);
    return;
  }

  // Current season only — full multi-year bake stays on manual `npm run deploy`.
  const steps = [
    {
      label: "game-snapshot",
      cmd: "node",
      args: ["scripts/build-runtime-game-snapshot.mjs"],
    },
    {
      label: "bref-advanced",
      cmd: "node",
      args: ["scripts/build-runtime-bref-advanced.mjs"],
      env: {
        // Refresh the live year + two priors; keep the rest of the snapshot.
        BREF_SEASON_WINDOW: "3",
        BREF_INCLUDE_CURRENT: "1",
        BREF_PRESERVE_OUTSIDE_WINDOW: "1",
      },
    },
    {
      label: "drbl-recompute",
      cmd: "npx",
      args: ["tsx", "scripts/drbl-daily-recompute.ts"],
      env: {
        // Current season only; skips when game count unchanged or < min games.
        DRBL_SEASON: info.season,
        DRBL_DELAY_MS: process.env.DRBL_DELAY_MS || "100",
      },
    },
    {
      label: "drbl-overlay",
      cmd: "node",
      args: ["scripts/build-runtime-drbl-overlay.mjs"],
    },
    {
      label: "impact-overlay",
      cmd: "node",
      args: ["scripts/build-runtime-impact-snapshot.mjs"],
    },
    {
      label: "current-roster",
      cmd: "node",
      args: ["scripts/build-runtime-current-roster.mjs"],
    },
    {
      label: "team-board",
      cmd: "node",
      args: ["scripts/build-runtime-team-board-snapshot.mjs"],
    },
    {
      label: "standings",
      cmd: "node",
      args: ["scripts/build-runtime-standings-snapshot.mjs"],
    },
    {
      label: "player-game-logs",
      cmd: "node",
      args: ["scripts/build-runtime-player-game-logs.mjs"],
      env: {
        // Always rewrite current-season logs so race curves move day-to-day.
        FORCE: "1",
        GAMELOG_SEASONS: info.season,
        GAMELOG_MIN_GP: String(minGp),
        GAMELOG_CONCURRENCY: process.env.GAMELOG_CONCURRENCY || "6",
      },
    },
    {
      label: "recent-insights",
      cmd: "npx",
      args: ["tsx", "scripts/build-runtime-recent-insights.mjs"],
    },
    {
      label: "cf-assets",
      cmd: "node",
      args: ["scripts/build-runtime-cf-assets.mjs"],
    },
    ...TRANSACTION_STEPS,
  ];

  const completed = [];
  const softFailed = [];
  for (const step of steps) {
    try {
      await run(step.cmd, step.args, step.env);
      completed.push(step.label);
    } catch (error) {
      // Keep BRef / logs / standings moving if Stats NBA flakes on DRBL.
      if (SOFT_FAIL.has(step.label)) {
        log(
          `soft-fail ${step.label}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        softFailed.push(step.label);
        continue;
      }
      throw error;
    }
  }
  const movement = await runMovementSteps();
  completed.push(...movement.done);
  if (movement.failed) softFailed.push(movement.failed);
  const org = await runOrgSteps();
  completed.push(...org.done);
  softFailed.push(...org.failed);

  const report = {
    ok: true,
    skipped: false,
    phase: info.phase,
    season: info.season,
    minGp,
    force: FORCE,
    steps: completed,
    movement,
    softFailed,
    shouldDeploy: true,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
  const dest = await writeReport(report);
  await writeGithubOutput({
    should_deploy: "true",
    phase: info.phase,
    season: info.season,
    skipped: "false",
  });
  log(`ok → ${dest} (${report.durationMs}ms)`);
}

main().catch(async (error) => {
  console.error(
    `[daily-runtime-sync] failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  await writeGithubOutput({
    should_deploy: "false",
    phase: info.phase,
    season: info.season,
    skipped: "false",
  }).catch(() => {});
  process.exitCode = 1;
});
