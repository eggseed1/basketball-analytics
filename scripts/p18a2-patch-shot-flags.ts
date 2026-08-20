/**
 * Patch 2005-06 summaries with per-game shotCoordinatesAvailable from raw shots.
 *   npx tsx scripts/p18a2-patch-shot-flags.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { HISTORY_VERSION } from "../src/lib/history/capabilities";
import { loadRawArchiveShotEvents } from "../src/data/history/raw-archive-shots";
import { shotCoverage } from "../src/lib/shots/shot-events";

const ROOT = process.cwd();
const PILOT = "2005-06";
const dir = path.join(ROOT, "data", "drbl", "history", HISTORY_VERSION, PILOT);
const sumPath = path.join(dir, "game-summaries.json");
const data = JSON.parse(readFileSync(sumPath, "utf8")) as {
  games: Array<Record<string, unknown>>;
};

const counts = { SUPPORTED: 0, PARTIAL: 0, UNAVAILABLE: 0, false: 0 };

for (const g of data.games) {
  const gameId = String(g.gameId);
  const cov = shotCoverage(loadRawArchiveShotEvents(gameId));
  const flag =
    cov.completeness === "UNAVAILABLE" ? false : cov.completeness;
  g.shotCoordinatesAvailable = flag;
  if (flag === false) counts.false++;
  else counts[flag as "SUPPORTED" | "PARTIAL" | "UNAVAILABLE"]++;

  const artPath = path.join(dir, "games", `${gameId}.json`);
  if (existsSync(artPath)) {
    const art = JSON.parse(readFileSync(artPath, "utf8")) as {
      summary: Record<string, unknown>;
    };
    art.summary.shotCoordinatesAvailable = flag;
    writeFileSync(artPath, JSON.stringify(art) + "\n");
  }
}

writeFileSync(sumPath, JSON.stringify(data) + "\n");
console.log(JSON.stringify({ patched: data.games.length, counts }, null, 2));
