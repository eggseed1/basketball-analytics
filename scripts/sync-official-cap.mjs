/**
 * Adds a season's official salary cap, tax and apron levels once NBA
 * Communications posts them (around June 30 each year).
 *
 * Source: pr.nba.com "NBA sets Salary Cap for YYYY-YY season" posts, via the
 * site's WordPress API. Seasons already on file are never rewritten.
 *
 * Writes (only when a new season is found):
 * - data/cba/league-cap-seasons.json   OFFICIAL record (integer USD)
 * - data/cba/salary-cap-by-year.json   millions, keyed by season-end year
 *
 * The announcement has no minimum player salary. The CBA grows it at the same
 * rate as the cap, so it is carried forward by the cap ratio; the max is 35%
 * of the cap, as in the rows already on file.
 *
 * Usage: node scripts/sync-official-cap.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SEASONS_FILE = path.join(ROOT, "data/cba/league-cap-seasons.json");
const BY_YEAR_FILE = path.join(ROOT, "data/cba/salary-cap-by-year.json");
const SEARCH =
  "https://pr.nba.com/wp-json/wp/v2/posts?search=salary%20cap&per_page=50&_fields=id,date,link,title,content";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

function plain(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** "$164.961 million" after `label` → 164961000 */
function millionsAfter(text, label) {
  const m = text.match(new RegExp(`${label}[^$]{0,80}\\$(\\d+(?:\\.\\d+)?) million`, "i"));
  return m ? Math.round(Number(m[1]) * 1_000_000) : null;
}

function parsePost(post, newestKnown) {
  const title = plain(post.title?.rendered);
  const season = title.match(/Salary Cap for (\d{4})-(\d{2}) season/i);
  if (!season) return null;
  const start = Number(season[1]);
  if (String((start + 1) % 100).padStart(2, "0") !== season[2]) return null;
  if (start <= newestKnown) return null;
  const text = plain(post.content?.rendered);
  const record = {
    season: `${season[1]}-${season[2]}`,
    seasonStartYear: start,
    salaryCap: millionsAfter(text, "Salary Cap for the \\d{4}-\\d{2} season"),
    luxuryTax: millionsAfter(text, "Tax Level"),
    firstApron: millionsAfter(text, "First Apron Level"),
    secondApron: millionsAfter(text, "Second Apron Level"),
    minimumTeamSalary: millionsAfter(text, "Minimum Team Salary"),
    status: "OFFICIAL",
    source: `NBA Communications — Salary Cap for ${season[1]}-${season[2]} season`,
    sourceDate: String(post.date ?? "").slice(0, 10),
    sourceUrl: post.link ?? null,
  };
  const required = [record.salaryCap, record.luxuryTax, record.firstApron, record.secondApron];
  if (required.some((v) => v == null)) {
    console.warn(`[official-cap] ${record.season}: could not read every threshold, skipping`);
    return null;
  }
  // Order guards against reading the wrong figure from a reworded post.
  if (!(record.salaryCap < record.luxuryTax && record.luxuryTax < record.firstApron && record.firstApron < record.secondApron)) {
    console.warn(`[official-cap] ${record.season}: thresholds out of order, skipping`);
    return null;
  }
  return record;
}

function byYearLine(endYear, row) {
  const fields = Object.entries(row)
    .map(([k, v]) => `"${k}": ${v}`)
    .join(", ");
  return `    "${endYear}": { ${fields} }`;
}

async function main() {
  const res = await fetch(SEARCH, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`pr.nba.com HTTP ${res.status}`);
  const posts = await res.json();
  const seasonsFile = JSON.parse(await fs.readFile(SEASONS_FILE, "utf8"));
  const byYearFile = JSON.parse(await fs.readFile(BY_YEAR_FILE, "utf8"));
  const known = new Set(seasonsFile.seasons.map((s) => s.season));
  const newestKnown = Math.max(...seasonsFile.seasons.map((s) => s.seasonStartYear));
  const found = posts.map((post) => parsePost(post, newestKnown)).filter(Boolean);
  const added = found.filter((r) => !known.has(r.season)).sort((a, b) => a.seasonStartYear - b.seasonStartYear);

  const newYearLines = [];
  for (const record of added) seasonsFile.seasons.push(record);
  seasonsFile.seasons.sort((a, b) => a.seasonStartYear - b.seasonStartYear);

  const byYear = byYearFile.bySeasonEndYear;
  for (const record of seasonsFile.seasons) {
    if (record.status !== "OFFICIAL") continue;
    const endYear = String(record.seasonStartYear + 1);
    const prior = byYear[String(record.seasonStartYear)];
    if (byYear[endYear] || !prior?.salaryCapM || !prior?.minSalaryM) continue;
    const capM = record.salaryCap / 1e6;
    byYear[endYear] = {
      salaryCapM: capM,
      luxuryTaxM: record.luxuryTax / 1e6,
      firstApronM: record.firstApron / 1e6,
      secondApronM: record.secondApron / 1e6,
      minSalaryM: Math.round(prior.minSalaryM * (capM / prior.salaryCapM) * 1000) / 1000,
      maxSalaryM: Math.round(capM * 0.35 * 10) / 10,
    };
    newYearLines.push(byYearLine(endYear, byYear[endYear]));
  }

  console.log(
    `[official-cap] posts=${posts.length} parsed=${found.map((r) => r.season).join(",") || "none"} added=${added.map((r) => r.season).join(",") || "none"} byYearAdded=${newYearLines.length}`
  );
  if (added.length) await fs.writeFile(SEASONS_FILE, `${JSON.stringify(seasonsFile, null, 2)}\n`);
  if (newYearLines.length) {
    // Append so the hand-kept rows above keep their formatting.
    const raw = await fs.readFile(BY_YEAR_FILE, "utf8");
    const close = raw.lastIndexOf("\n  }\n}");
    if (close < 0) throw new Error("unexpected salary-cap-by-year.json layout");
    await fs.writeFile(BY_YEAR_FILE, `${raw.slice(0, close)},\n${newYearLines.join(",\n")}${raw.slice(close)}`);
  }
}

main().catch((error) => {
  console.error(`[official-cap] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
