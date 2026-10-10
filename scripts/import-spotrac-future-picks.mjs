/**
 * Future draft picks (who holds every 1st and 2nd, with the terms in
 * Spotrac's words) from spotrac.com/nba/draft/future.
 *
 * Spotrac blocks plain HTTP clients, so the page is read in a browser.
 *
 *   node scripts/import-spotrac-future-picks.mjs --fetch   # headless Chromium (nightly)
 *   node scripts/import-spotrac-future-picks.mjs           # rebuild from the saved raw file
 *
 * If headless reads get blocked, save the page by hand instead:
 *   1. Open https://www.spotrac.com/nba/draft/future in a browser.
 *   2. Run the expression from `node scripts/import-spotrac-future-picks.mjs --extractor`
 *      in the devtools console and save the printed JSON to
 *      data/draft-picks/spotrac/v1/future-picks-raw.json as
 *      { "retrievedAt": "YYYY-MM-DD", "tables": <printed array> }.
 *   3. Run `node scripts/import-spotrac-future-picks.mjs`.
 */
import fs from "node:fs/promises";
import path from "node:path";

const RAW = path.join(process.cwd(), "data/draft-picks/spotrac/v1/future-picks-raw.json");
const OUT = path.join(process.cwd(), "src/data/runtime/future-picks-snapshot.json");

const EXTRACTOR = `JSON.stringify([...document.querySelectorAll('table')].map((t) => { let year = null; const rows = []; for (const r of t.querySelectorAll('tr')) { const h = r.querySelector('h2'); if (h) { year = h.textContent.trim(); continue; } const img = r.querySelector('td img'); const cell = r.querySelector('td[colspan]'); const bar = cell && cell.querySelector('div'); if (!img || !bar) continue; const divs = [...cell.children].filter((d) => d.tagName === 'DIV'); rows.push({ year, img: img.getAttribute('src').split('/').pop(), bar: bar.textContent.trim().replace(/\\s+/g, ' '), arrow: !!bar.querySelector('.fa-arrow-right-long'), swap: !!bar.querySelector('.fa-refresh'), terms: divs.slice(1).map((d) => d.textContent.trim().replace(/\\s+/g, ' ')).filter(Boolean).join(' ') }); } return { rows }; }))`;

/** Spotrac logo file stem → standard abbreviation. */
const LOGO_ABBR = {
  atl: "ATL", bos: "BOS", bkn: "BKN", cha: "CHA", chi: "CHI", cle: "CLE", dal: "DAL", den: "DEN",
  det: "DET", gs: "GSW", hou: "HOU", ind: "IND", lac: "LAC", lal: "LAL", mem: "MEM", mia: "MIA",
  mil: "MIL", min: "MIN", no: "NOP", ny: "NYK", okc: "OKC", orl: "ORL", phi: "PHI", phx: "PHX",
  por: "POR", sac: "SAC", sa: "SAS", tor: "TOR", uta: "UTA", wsh: "WAS",
};

/** Abbreviation → ESPN team id. */
const ESPN_ID = {
  ATL: "1", BOS: "2", BKN: "17", CHA: "30", CHI: "4", CLE: "5", DAL: "6", DEN: "7", DET: "8",
  GSW: "9", HOU: "10", IND: "11", LAC: "12", LAL: "13", MEM: "29", MIA: "14", MIL: "15",
  MIN: "16", NOP: "3", NYK: "18", OKC: "25", ORL: "19", PHI: "20", PHX: "21", POR: "22",
  SAC: "23", SAS: "24", TOR: "28", UTA: "26", WAS: "27",
};

function logoAbbr(file) {
  const stem = file.replace(/\.png$/, "").replace(/^nba_/, "").replace(/_?\d+$/, "").replace(/\d+$/, "");
  const abbr = LOGO_ABBR[stem];
  if (!abbr) throw new Error(`unknown Spotrac logo ${file}`);
  return abbr;
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const SOURCE_URL = "https://www.spotrac.com/nba/draft/future";
/** Spotrac's edge rejects the HeadlessChrome user agent. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
/** A read with fewer pick rows than this share of the last snapshot is a broken page, not trades. */
const MIN_SHARE_OF_PRIOR = 0.8;

async function fetchTables() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: BROWSER_UA });
    await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("table h2", { state: "attached", timeout: 30_000 });
    // Each team also has a pick-count summary table with no pick rows.
    await page.evaluate(() =>
      document.querySelectorAll('[id^="draft-summary"] table').forEach((t) => t.remove())
    );
    return JSON.parse(await page.evaluate(EXTRACTOR));
  } finally {
    await browser.close();
  }
}

async function readJson(file) {
  return fs
    .readFile(file, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => null);
}

async function main() {
  if (process.argv.includes("--extractor")) {
    console.log(EXTRACTOR);
    return;
  }
  let raw;
  if (process.argv.includes("--fetch")) {
    const tables = await fetchTables();
    const saved = await readJson(RAW);
    raw = { retrievedAt: new Date().toISOString().slice(0, 10), tables };
    if (JSON.stringify(saved?.tables) !== JSON.stringify(tables)) {
      await fs.writeFile(RAW, `${JSON.stringify(raw, null, 2)}\n`);
    }
  } else {
    raw = JSON.parse(await fs.readFile(RAW, "utf8"));
  }
  const tables = raw.tables;
  if (!Array.isArray(tables) || tables.length !== 60) {
    throw new Error(`expected 60 tables (30 teams × 2 rounds), got ${tables?.length}`);
  }
  const teams = {};
  for (let i = 0; i < tables.length; i += 2) {
    const all = [...tables[i].rows, ...tables[i + 1].rows];
    const abbr = mostCommon(all.map((r) => logoAbbr(r.img)));
    const teamId = ESPN_ID[abbr];
    if (!teamId || teams[teamId]) throw new Error(`table ${i}: team ${abbr} unresolved or repeated`);
    const picks = [];
    for (const [round, table] of [[1, tables[i]], [2, tables[i + 1]]]) {
      for (const r of table.rows) {
        const [holder, swapWith] = r.bar.split(" ").filter(Boolean);
        const frozen = /\bFROZEN PICK\b/i.test(r.terms);
        const terms = r.terms.replace(/\bFROZEN PICK\b/i, "").replace(/\s+/g, " ").trim();
        picks.push({
          year: Number(r.year),
          round,
          origin: logoAbbr(r.img),
          holder,
          ...(r.swap && swapWith ? { swapWith } : {}),
          ...(r.arrow ? { moved: true } : {}),
          ...(frozen ? { frozen: true } : {}),
          ...(terms ? { terms } : {}),
        });
      }
    }
    teams[teamId] = { abbr, picks };
  }
  const out = {
    version: 1,
    source: "spotrac.com/nba/draft/future",
    sourceUrl: SOURCE_URL,
    retrievedAt: raw.retrievedAt,
    teams,
  };
  const count = Object.values(teams).reduce((n, t) => n + t.picks.length, 0);
  const prior = await readJson(OUT);
  const priorCount = Object.values(prior?.teams ?? {}).reduce((n, t) => n + (t.picks?.length ?? 0), 0);
  if (count < priorCount * MIN_SHARE_OF_PRIOR) {
    throw new Error(`only ${count} pick rows against ${priorCount} last time; keeping the last snapshot`);
  }
  await fs.writeFile(OUT, `${JSON.stringify(out)}\n`);
  console.log(`[spotrac-future-picks] ${Object.keys(teams).length} teams, ${count} pick rows → ${path.relative(process.cwd(), OUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
