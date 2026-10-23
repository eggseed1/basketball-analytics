/**
 * Bake gitignored current-season runtime assets that OpenNext ships as
 * Worker Static Assets. Code-only deploys (`deploy-site.yml`) replace the
 * whole asset tree; without this step, nightly bakes for game logs and shot
 * charts disappear until the next daily-runtime-refresh.
 *
 * Play-by-play under public/runtime/play-by-play is also gitignored, but the
 * product reads finished games from the GAME_ARCHIVE R2 bucket (and live
 * ESPN for in-progress games). It is intentionally not rebaked here.
 *
 *   node scripts/bake-deploy-runtime-assets.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  dailyGameLogMinGp,
  nbaSeasonPhaseInfo,
} from "./lib/nba-season-phase.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args, env = {}) {
  console.log(`[bake-deploy-assets] $ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} exited ${result.status ?? "null"}`
    );
  }
}

function countJson(dir) {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

const info = nbaSeasonPhaseInfo(new Date());
const season = info.season;
const minGp = dailyGameLogMinGp(new Date());
const concurrency = process.env.GAMELOG_CONCURRENCY || "8";

console.log(
  `[bake-deploy-assets] season=${season} phase=${info.phase} minGp=${minGp}`
);

run("node", ["scripts/build-runtime-player-game-logs.mjs"], {
  FORCE: "1",
  GAMELOG_SEASONS: season,
  GAMELOG_MIN_GP: String(minGp),
  GAMELOG_CONCURRENCY: concurrency,
});

run("npx", ["tsx", "scripts/build-season-shots-from-pbp.ts", "--season", season]);

// Default Explore first page — cold MISS skips season-tables + overlays.
run("npx", ["tsx", "scripts/build-explore-players-first-page.ts"], {
  DATA_PROVIDER: "nba",
});

// Player careers extract — keeps /players off the 9MB season-tables module.
run("node", ["scripts/build-player-career-bref-snapshot.mjs"]);

// Large runtime JSON as Static Assets (keeps MiB off Worker upload).
run("node", [
  "-e",
  [
    "const fs=require('fs');const p=require('path');",
    "const files=[",
    "'transactions-snapshot.json',",
    "'contract-value-snapshot.json',",
    "'salary-payoff-snapshot.json',",
    "'bref-team-contracts-snapshot.json',",
    "'player-id-aliases-snapshot.json',",
    "'player-awards-snapshot.json',",
    "'draft-year-snapshot.json',",
    "'draft-history-snapshot.json',",
    "'historical-team-season-records.json',",
    "'standings-snapshot.json',",
    "'current-roster-snapshot.json',",
    "'future-picks-snapshot.json',",
    "'findings-archive.json',",
    "'team-leadership.json',",
    "'explore-players-first-page.json',",
    "'drbl-guide-snapshot.json',",
    "];",
    "for (const name of files) {",
    "const src=p.join('src/data/runtime',name);",
    "const dest=p.join('public/runtime',name);",
    "if (!fs.existsSync(src)) { console.warn('[bake-deploy-assets] skip missing', name); continue; }",
    "fs.mkdirSync(p.dirname(dest),{recursive:true});",
    "fs.copyFileSync(src,dest);",
    "console.log('[bake-deploy-assets] copied', name, '→ public/runtime');",
    "}",
  ].join(""),
]);

const logDir = path.join(ROOT, "public/runtime/player-game-logs", season);
const shotDir = path.join(ROOT, "public/runtime/player-shots", season);
const logCount = countJson(logDir);
const shotCount = countJson(shotDir);

if (!existsSync(logDir) || logCount === 0) {
  throw new Error(
    `Expected player game logs under ${path.relative(ROOT, logDir)}; found ${logCount}`
  );
}
if (!existsSync(shotDir) || shotCount === 0) {
  // Early tip window can still have zero finals on the CDN list; only fail
  // once the phase says player-viz should refresh.
  if (info.shouldRefreshPlayerViz) {
    throw new Error(
      `Expected player shots under ${path.relative(ROOT, shotDir)}; found ${shotCount}`
    );
  }
  console.warn(
    `[bake-deploy-assets] no shot files yet for ${season} (phase=${info.phase}); continuing`
  );
}

console.log(
  `[bake-deploy-assets] ok game-logs=${logCount} shots=${shotCount} → public/runtime/{player-game-logs,player-shots}/${season}`
);
