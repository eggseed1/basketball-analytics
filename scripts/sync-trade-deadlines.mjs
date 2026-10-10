/**
 * Adds each season's trade deadline once the league lists it on
 * nba.com/news/key-dates (usually in early August).
 *
 * The article keeps sections per season ("2026-27 Season Dates",
 * "Past Key Dates: 2025-26 Season"); a "Feb. 11: NBA Trade Deadline" line is
 * dated within its section's season. Only Thursday dates from January to
 * March are accepted, which every deadline on record has been.
 *
 * Writes data/movement-center/trade-deadlines.json only when a deadline is
 * new or moved.
 *
 * Usage: node scripts/sync-trade-deadlines.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const FILE = path.join(ROOT, "data/movement-center/trade-deadlines.json");
const URL = "https://www.nba.com/news/key-dates";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const MONTHS = { jan: 1, feb: 2, mar: 3 };

function articleText(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no __NEXT_DATA__ on key-dates page");
  const text = JSON.parse(m[1])?.props?.pageProps?.article?.contentText;
  if (typeof text !== "string" || !text.length) throw new Error("key-dates article has no text");
  return text
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\u00a0/g, " ");
}

/** { [seasonStartYear]: "YYYY-MM-DD" } for every section that names a deadline. */
export function parseDeadlines(text) {
  const out = {};
  let startYear = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const section = line.match(/^>.*?(\d{4})-(\d{2}) Season/i);
    if (section) {
      const start = Number(section[1]);
      startYear = String((start + 1) % 100).padStart(2, "0") === section[2] ? start : null;
      continue;
    }
    if (startYear == null) continue;
    const hit = line.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}):\s*NBA Trade Deadline/i);
    if (!hit) continue;
    const month = MONTHS[hit[1].toLowerCase()];
    if (!month) continue;
    const date = new Date(Date.UTC(startYear + 1, month - 1, Number(hit[2])));
    if (date.getUTCDay() !== 4) {
      console.warn(`[trade-deadlines] ${startYear}: ${line} is not a Thursday, skipping`);
      continue;
    }
    out[String(startYear)] = date.toISOString().slice(0, 10);
  }
  return out;
}

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`nba.com HTTP ${res.status}`);
  const found = parseDeadlines(articleText(await res.text()));
  const file = JSON.parse(await fs.readFile(FILE, "utf8"));
  const changes = [];
  for (const [year, date] of Object.entries(found)) {
    if (file.deadlines[year] === date) continue;
    changes.push(`${year}: ${file.deadlines[year] ?? "none"} -> ${date}`);
    file.deadlines[year] = date;
  }
  console.log(
    `[trade-deadlines] parsed=${Object.entries(found).map(([y, d]) => `${y}:${d}`).join(",") || "none"} changed=${changes.join("; ") || "none"}`
  );
  if (!changes.length) return;
  file.deadlines = Object.fromEntries(Object.entries(file.deadlines).sort(([a], [b]) => Number(a) - Number(b)));
  await fs.writeFile(FILE, `${JSON.stringify(file, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[trade-deadlines] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
