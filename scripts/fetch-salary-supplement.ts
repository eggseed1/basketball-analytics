/**
 * Writes data/salaries/player-salaries-supplement.csv: salaries the main CSV
 * doesn't have, for the contract value model. Covers the newest finished
 * season (missing from the main CSV) and players missing from the newest
 * season the main CSV does cover.
 *
 * The source restates past salaries to the current cap, so each season is
 * scaled back using the players both files have. The newest season has no
 * overlap; its scale comes from the season before it.
 *
 * Usage: npx tsx scripts/fetch-salary-supplement.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hydrateSvelteKitData } from "../src/data/providers/nba/darko-scraper";
import { looseName } from "./lib/contract-value-fit";

const root = process.cwd();
const MAIN_CSV = "data/salaries/player-salaries-2000-2025.csv";
const OUT_CSV = "data/salaries/player-salaries-supplement.csv";
const BASE_URL = "https://www.darko.app/__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=01";

type Row = { name: string; salary: number };

async function fetchSeason(endYear: number): Promise<Row[]> {
  const res = await fetch(`${BASE_URL}&season=${endYear}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`season ${endYear}: HTTP ${res.status}`);
  const body = (await res.json()) as { nodes: Array<{ type: string; data?: unknown[] }> };
  const node = body.nodes.find((n) => n.type === "data" && n.data);
  if (!node?.data) throw new Error(`season ${endYear}: no data node`);
  const decoded = hydrateSvelteKitData(node.data) as { players?: { keys: string[]; values: unknown[][] } };
  const table = decoded.players;
  if (!table?.keys || !table.values) throw new Error(`season ${endYear}: unexpected player table`);
  const nameCol = table.values[table.keys.indexOf("player_name")];
  const salaryCol = table.values[table.keys.indexOf("actual_salary")];
  if (!nameCol || !salaryCol) throw new Error(`season ${endYear}: missing name or salary column`);
  const rows: Row[] = [];
  nameCol.forEach((name, i) => {
    const salary = Number(salaryCol[i]);
    if (typeof name === "string" && Number.isFinite(salary) && salary > 0) rows.push({ name, salary });
  });
  return rows;
}

function readMain(): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  for (const line of readFileSync(path.join(root, MAIN_CSV), "utf8").split("\n").slice(1)) {
    const m = line.match(/^(.*),(\d+),(\d{4})\s*$/);
    if (!m) continue;
    const bucket = out.get(Number(m[3])) ?? new Map<string, number>();
    const key = looseName(m[1].replace(/^"|"$/g, ""));
    bucket.set(key, (bucket.get(key) ?? 0) + Number(m[2]));
    out.set(Number(m[3]), bucket);
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function main() {
  const mainCsv = readMain();
  const lastMain = Math.max(...mainCsv.keys());
  const capByEndYear = JSON.parse(readFileSync(path.join(root, "data/cba/salary-cap-by-year.json"), "utf8"))
    .bySeasonEndYear as Record<string, { salaryCapM: number }>;
  const newest = lastMain + 1;
  if (!capByEndYear[newest]) throw new Error(`no cap figure for season ending ${newest}`);

  const covered = await fetchSeason(lastMain);
  const known = mainCsv.get(lastMain)!;
  const ratios = covered.flatMap((r) => {
    const s = known.get(looseName(r.name));
    return s ? [r.salary / s] : [];
  });
  if (ratios.length < 300) throw new Error(`only ${ratios.length} players overlap for ${lastMain}`);
  const coveredScale = median(ratios);
  const capGrowth = capByEndYear[newest].salaryCapM / capByEndYear[lastMain].salaryCapM;
  const newestScale = coveredScale / capGrowth;

  const lines: string[] = [];
  const csvName = (name: string) => (name.includes(",") ? `"${name}"` : name);
  let gaps = 0;
  for (const r of covered) {
    if (known.has(looseName(r.name))) continue;
    lines.push(`${csvName(r.name)},${Math.round(r.salary / coveredScale)},${lastMain}`);
    gaps += 1;
  }
  const latest = await fetchSeason(newest);
  for (const r of latest) lines.push(`${csvName(r.name)},${Math.round(r.salary / newestScale)},${newest}`);

  writeFileSync(path.join(root, OUT_CSV), `Player,Salary,Season\n${lines.join("\n")}\n`);
  console.log(
    `wrote ${OUT_CSV}: ${gaps} gap fills for ${lastMain} (scale ${coveredScale.toFixed(4)}, ${ratios.length} overlap),` +
      ` ${latest.length} for ${newest} (scale ${newestScale.toFixed(4)})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
