/**
 * League boards for seasons before the season tables (pre-1996-97), cut from the
 * legend career shards so percentiles have a peer pool. One file per NBA season:
 * public/runtime/legend-boards/{season}.json, in the shards' compact format.
 *
 *   node scripts/build-legend-boards.mjs          # write
 *   node scripts/build-legend-boards.mjs --check  # fail if the files are stale
 *
 * Rerun after scripts/build-legend-careers.py rewrites the shards.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SHARDS = path.join(ROOT, "public/runtime/legend-careers");
const OUT = path.join(ROOT, "public/runtime/legend-boards");
const FIRST_TABLE_SEASON = "1996-97";
const check = process.argv.includes("--check");

const boards = new Map();
for (const file of readdirSync(SHARDS).filter((f) => f.endsWith(".json")).sort()) {
  const shard = JSON.parse(readFileSync(path.join(SHARDS, file), "utf8"));
  for (const [slug, career] of Object.entries(shard)) {
    const seasons = new Set(
      (career.t ?? [])
        .filter((row) => row[0] < FIRST_TABLE_SEASON && typeof row[26] !== "string")
        .map((row) => row[0])
    );
    for (const season of seasons) {
      const board = boards.get(season) ?? {};
      board[slug] = {
        b: { n: career.b?.n ?? slug },
        t: career.t.filter((row) => row[0] === season && typeof row[26] !== "string"),
        a: (career.a ?? []).filter((row) => row[0] === season),
      };
      boards.set(season, board);
    }
  }
}

const expected = new Map(
  [...boards].map(([season, board]) => [
    `${season}.json`,
    `${JSON.stringify(Object.fromEntries(Object.entries(board).sort(([a], [b]) => a.localeCompare(b))))}\n`,
  ])
);

if (check) {
  const present = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith(".json")) : [];
  const stale = [
    ...[...expected].filter(([file, text]) => !present.includes(file) || readFileSync(path.join(OUT, file), "utf8") !== text).map(([file]) => file),
    ...present.filter((file) => !expected.has(file)),
  ];
  if (stale.length) {
    console.error(`legend boards are stale (${stale.slice(0, 5).join(", ")}…); run node scripts/build-legend-boards.mjs`);
    process.exit(1);
  }
  console.log(`legend boards: ${expected.size} seasons up to date`);
} else {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  for (const [file, text] of expected) writeFileSync(path.join(OUT, file), text);
  const sizes = [...boards].map(([season, board]) => `${season}:${Object.keys(board).length}`);
  console.log(`legend boards: ${expected.size} seasons → ${OUT}\n  ${sizes.join(" ")}`);
}
