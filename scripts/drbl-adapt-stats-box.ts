/**
 * Converts box scores fetched by scripts/local/fetch-historical-pbp.py
 * (boxscore.stats-v3.json, boxscoretraditionalv3 as served) into the CDN
 * shape the importer reads (boxscore.json). Games that already have a valid
 * boxscore.json are left alone.
 *
 *   npx tsx scripts/drbl-adapt-stats-box.ts --season 2021-22
 */
import { readFile } from "node:fs/promises";

import { isValidJsonFile, writeJsonAtomic } from "../drbl/download/atomic-json";
import { rawPath } from "../drbl/download/disk-cache";
import { statsBoxScoreV3ToCdnShape } from "../drbl/download/stats-boxscore-adapt";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const season = arg("season");
  if (!season) throw new Error("--season required (e.g. 2021-22)");
  const games = JSON.parse(
    await readFile(rawPath(season, "meta", "games_regular_season.json"), "utf8")
  ) as { gameId: string }[];
  let adapted = 0;
  let existing = 0;
  const missing: string[] = [];
  const failed: string[] = [];
  for (const { gameId } of games) {
    const out = rawPath("games", gameId, "boxscore.json");
    if (await isValidJsonFile(out)) {
      existing += 1;
      continue;
    }
    const src = rawPath("games", gameId, "boxscore.stats-v3.json");
    if (!(await isValidJsonFile(src))) {
      missing.push(gameId);
      continue;
    }
    const box = statsBoxScoreV3ToCdnShape(JSON.parse(await readFile(src, "utf8")));
    if (!box) {
      failed.push(gameId);
      continue;
    }
    await writeJsonAtomic(out, JSON.stringify(box));
    adapted += 1;
  }
  console.log(
    `[adapt-box] ${season}: ${games.length} games, adapted ${adapted}, already had ${existing}, no stats box ${missing.length}, adapt failed ${failed.length}`
  );
  if (failed.length > 0) console.log(`[adapt-box] adapt failed: ${failed.join(", ")}`);
  if (missing.length > 0) console.log(`[adapt-box] no stats box: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? " …" : ""}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
