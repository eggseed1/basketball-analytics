/**
 * Keeps each season's salaries after Basketball-Reference rolls its contract
 * tables forward (every July the finished season's column disappears).
 *
 * Reads the nightly src/data/runtime/bref-team-contracts-snapshot.json and
 * replaces that cap season's rows in data/salaries/player-salaries-bref-archive.csv.
 * Older seasons are never touched. Columns match the other salary CSVs:
 * Player,Salary,Season (Season = year the season ends).
 *
 * Usage: node scripts/archive-bref-salaries.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SNAPSHOT = path.join(ROOT, "src/data/runtime/bref-team-contracts-snapshot.json");
const ARCHIVE = path.join(ROOT, "data/salaries/player-salaries-bref-archive.csv");
const MIN_PLAYERS = 400;

function csvName(name) {
  return /[",]/.test(name) ? `"${name.replace(/"/g, '""')}"` : name;
}

function parseLine(line) {
  const m = line.match(/^(.*),(\d+),(\d{4})\s*$/);
  if (!m) return null;
  return { name: m[1].replace(/^"|"$/g, "").replace(/""/g, '"'), salary: Number(m[2]), endYear: Number(m[3]) };
}

async function main() {
  const snapshot = JSON.parse(await fs.readFile(SNAPSHOT, "utf8"));
  /** endYear → name → salary */
  const tonight = new Map();
  for (const team of Object.values(snapshot.teams ?? {})) {
    const start = Number(String(team.capSeason ?? "").slice(0, 4));
    if (!Number.isFinite(start) || start < 2000) continue;
    const bucket = tonight.get(start + 1) ?? new Map();
    for (const row of team.rows ?? []) {
      const name = String(row.name ?? "").trim();
      const amount = Number(row.years?.[0]?.amount);
      if (!name || !Number.isFinite(amount) || amount <= 0) continue;
      // A traded or waived player can sit on two teams' tables; keep the larger.
      if (!(bucket.get(name) >= amount)) bucket.set(name, Math.round(amount));
    }
    tonight.set(start + 1, bucket);
  }

  const prior = await fs.readFile(ARCHIVE, "utf8").catch(() => "");
  const rows = prior
    .split("\n")
    .slice(1)
    .map(parseLine)
    .filter(Boolean);

  let replaced = 0;
  for (const [endYear, bucket] of tonight) {
    if (bucket.size < MIN_PLAYERS) {
      console.log(`[salary-archive] ${endYear}: only ${bucket.size} players, keeping prior rows`);
      continue;
    }
    for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].endYear === endYear) rows.splice(i, 1);
    for (const [name, salary] of bucket) rows.push({ name, salary, endYear });
    replaced += 1;
    console.log(`[salary-archive] ${endYear}: ${bucket.size} players`);
  }
  if (!replaced) return;

  rows.sort((a, b) => a.endYear - b.endYear || a.name.localeCompare(b.name));
  const next = `Player,Salary,Season\n${rows.map((r) => `${csvName(r.name)},${r.salary},${r.endYear}`).join("\n")}\n`;
  if (next === prior) {
    console.log("[salary-archive] unchanged");
    return;
  }
  await fs.writeFile(ARCHIVE, next);
  console.log(`[salary-archive] wrote ${path.relative(ROOT, ARCHIVE)} (${rows.length} rows)`);
}

main().catch((error) => {
  console.error(`[salary-archive] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
