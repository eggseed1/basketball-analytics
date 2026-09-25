/**
 * Nightly / on-demand DRBL recompute for the current NBA season.
 *
 * Full season refit (Approach B) — not per-game patches. New games appear via
 * `--refresh-games` leaguegamelog refresh; raw PBP stays cached unless forced.
 *
 * Skips when the game list is empty or gamesProcessed already matches the
 * refreshed list (unless DRBL_FORCE_RECOMPUTE=1).
 *
 *   npx tsx scripts/drbl-daily-recompute.ts
 *   DRBL_SEASON=2025-26 npx tsx scripts/drbl-daily-recompute.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listSeasonGames } from "../drbl/download/season-games";
import { nbaSeasonPhaseInfo } from "./lib/nba-season-phase.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORCE_RECOMPUTE =
  process.env.DRBL_FORCE_RECOMPUTE === "1" ||
  process.argv.includes("--force-recompute");
/** Minimum finals in the game list before we publish a season artifact. */
const MIN_GAMES_TO_PUBLISH = Number(process.env.DRBL_MIN_GAMES ?? "50");

function log(message: string) {
  console.log(`[drbl-daily-recompute] ${message}`);
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    log(`$ ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function readGamesProcessed(season: string): Promise<number> {
  const file = path.join(
    ROOT,
    "src",
    "data",
    "drbl",
    "precomputed",
    `${season}.json`
  );
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as {
      gamesProcessed?: number;
    };
    return Number(raw.gamesProcessed) || 0;
  } catch {
    return 0;
  }
}

async function main() {
  const info = nbaSeasonPhaseInfo(new Date());
  const season = process.env.DRBL_SEASON || info.season;
  const delay = process.env.DRBL_DELAY_MS || "100";

  log(
    `season=${season} phase=${info.phase} forceRecompute=${FORCE_RECOMPUTE ? "1" : "0"}`
  );

  const games = await listSeasonGames(season, { force: true });
  const availableGames = games.length;
  log(`leaguegamelog finals=${availableGames}`);

  if (availableGames < MIN_GAMES_TO_PUBLISH) {
    log(
      `skip compute — need ≥${MIN_GAMES_TO_PUBLISH} final games before publishing (have ${availableGames})`
    );
    return;
  }

  const prior = await readGamesProcessed(season);
  if (!FORCE_RECOMPUTE && prior === availableGames && prior > 0) {
    log(`skip compute — artifact already has gamesProcessed=${prior}`);
    return;
  }

  await run("npx", [
    "tsx",
    "scripts/drbl-compute-season.ts",
    "--season",
    season,
    "--delay",
    String(delay),
    "--refresh-games",
  ]);
  log("compute complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
