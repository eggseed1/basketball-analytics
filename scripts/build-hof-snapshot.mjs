/**
 * Naismith Hall of Fame Player-category inductees from Basketball-Reference's
 * Hall of Fame page, with a BRef slug when they have an NBA/ABA player page.
 * The award page adds classes newer than the curated list in
 * `src/content/awards/history.ts`.
 *
 * Writes src/data/runtime/hof-inductees-snapshot.json (only when it changed).
 *
 * Usage: node scripts/build-hof-snapshot.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/data/runtime/hof-inductees-snapshot.json");
const URL = "https://www.basketball-reference.com/awards/hof.html";

function text(raw) {
  return String(raw ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cell(row, stat) {
  return row.match(new RegExp(`data-stat="${stat}"[^>]*>([\\s\\S]*?)</t[dh]>`))?.[1] ?? "";
}

async function main() {
  const res = await fetch(URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`BRef ${res.status}`);
  const html = (await res.text()).replace(/<!--|-->/g, "");

  const inductees = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    if (text(cell(row, "category")) !== "Player") continue;
    const year = Number(text(cell(row, "year_id")));
    const nameCell = cell(row, "name_full");
    // WNBA pages share /players/ with a trailing "w"; only NBA/ABA slugs link to player pages here.
    const slug = nameCell.match(/\/players\/[a-z]\/([a-z0-9]+)\.html/)?.[1];
    const name = text(nameCell.split("&nbsp;")[0]);
    if (!Number.isInteger(year) || !name) continue;
    inductees.push({ year, name, slug: slug && !slug.endsWith("w") ? slug : null });
  }
  if (inductees.length < 200) throw new Error(`parsed only ${inductees.length} player inductees`);
  inductees.sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));

  const prior = await fs
    .readFile(OUT, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (prior && JSON.stringify(prior.inductees) === JSON.stringify(inductees)) {
    console.log(`[hof] unchanged (${inductees.length})`);
    return;
  }
  await fs.writeFile(
    OUT,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), source: URL, inductees }, null, 1)}\n`
  );
  console.log(`[hof] wrote ${inductees.length} inductees, newest class ${inductees[0].year}`);
}

main().catch((error) => {
  console.error(`[hof] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
