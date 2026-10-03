/**
 * Team payroll, payroll notes and draft rights from Basketball-Reference
 * (`/contracts/{TEAM}.html` and `/teams/{TEAM}/{YEAR}.html`), baked for
 * Workers.
 *
 * Usage: node scripts/build-runtime-bref-team-contracts.mjs [--force]
 *
 * Skips the fetch when the bake is under 20 hours old. A team that fails
 * keeps its previous entry.
 */
import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/data/runtime/bref-team-contracts-snapshot.json");
/** BRef blocks clients above ~20 requests/minute. */
const DELAY_MS = Number(process.env.BREF_DELAY_MS || 3200);
const FRESH_MS = 20 * 60 * 60 * 1000;

/** BRef team code → ESPN team id. */
const TEAMS = {
  ATL: "1",
  BOS: "2",
  BRK: "17",
  CHO: "30",
  CHI: "4",
  CLE: "5",
  DAL: "6",
  DEN: "7",
  DET: "8",
  GSW: "9",
  HOU: "10",
  IND: "11",
  LAC: "12",
  LAL: "13",
  MEM: "29",
  MIA: "14",
  MIL: "15",
  MIN: "16",
  NOP: "3",
  NYK: "18",
  OKC: "25",
  ORL: "19",
  PHI: "20",
  PHO: "21",
  POR: "22",
  SAC: "23",
  SAS: "24",
  TOR: "28",
  UTA: "26",
  WAS: "27",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`BRef ${res.status} ${url}`);
  return (await res.text()).replace(/<!--|-->/g, "");
}

function text(raw) {
  return String(raw ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function money(raw) {
  const n = Number(text(raw).replace(/[$,]/g, ""));
  return text(raw) && Number.isFinite(n) ? n : null;
}

function tableById(html, id) {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return null;
  const end = html.indexOf("</table>", start);
  return html.slice(start, end);
}

function rowsOf(table) {
  return [...table.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)].map((m) => {
    const cells = {};
    for (const c of m[2].matchAll(/<t[dh]([^>]*)data-stat="([^"]+)"([^>]*)>([\s\S]*?)<\/t[dh]>/g)) {
      cells[c[2]] = { attrs: `${c[1]} ${c[3]}`, html: c[4] };
    }
    return cells;
  });
}

function brefIdOf(html) {
  return /\/players\/[a-z]\/([a-z0-9]+)\.html/.exec(html ?? "")?.[1] ?? null;
}

function parsePayroll(html) {
  const facts = {};
  const cap = /<strong>(\d{4}-\d{2}) Salary Cap:<\/strong>\s*\$([\d,]+)/.exec(html);
  if (cap) {
    facts.capSeason = cap[1];
    facts.salaryCap = Number(cap[2].replace(/,/g, ""));
  }
  const largest = /<strong>Largest Guarantee:<\/strong>\s*(<a[^>]*>[^<]+<\/a>)\s*\(\$([\d,]+)\)/.exec(html);
  if (largest) {
    facts.largestGuarantee = {
      name: text(largest[1]),
      brefId: brefIdOf(largest[1]),
      amount: Number(largest[2].replace(/,/g, "")),
    };
  }

  const table = tableById(html, "contracts");
  if (!table) throw new Error("no payroll table");
  const seasons = [...table.matchAll(/data-stat="y\d"[^>]*>(\d{4}-\d{2})</g)].map((m) => m[1]);
  const rows = [];
  let totals = null;
  for (const cells of rowsOf(table)) {
    if (!cells.player || !cells.y1) continue;
    const name = text(cells.player.html);
    const years = seasons.map((_, i) => {
      const cell = cells[`y${i + 1}`];
      const amount = money(cell?.html);
      if (amount == null) return null;
      const attrs = cell.attrs;
      const option = /salary-pl/.test(attrs) ? "player" : /salary-tm/.test(attrs) ? "team" : null;
      const notGuaranteed = /<em>|<i>|italic/.test(`${attrs}${cell.html}`);
      return { amount, ...(option ? { option } : {}), ...(notGuaranteed ? { notGuaranteed: true } : {}) };
    });
    const guaranteed = money(cells.remain_gtd?.html);
    if (name === "Team Totals") {
      totals = { years: years.map((y) => y?.amount ?? null), guaranteed };
      continue;
    }
    if (!brefIdOf(cells.player.html)) continue;
    const age = Number(text(cells.age_today?.html));
    rows.push({
      name,
      brefId: brefIdOf(cells.player.html),
      ...(Number.isFinite(age) && age > 0 ? { age } : {}),
      years,
      guaranteed,
    });
  }

  const notes = {};
  const notesTable = tableById(html, "payroll-notes");
  if (notesTable) {
    for (const cells of rowsOf(notesTable)) {
      const id = brefIdOf(cells.player?.html);
      const note = text(cells.notes?.html ?? cells.note?.html);
      if (id && note) notes[id] = note;
    }
  }
  return { ...facts, seasons, rows, totals, notes };
}

function parseDraftRights(html) {
  const table = tableById(html, "draft-rights");
  if (!table) return [];
  return rowsOf(table).flatMap((cells) => {
    if (!brefIdOf(cells.player?.html) || !cells.draft_year) return [];
    const num = (k) => {
      const n = Number(text(cells[k]?.html));
      return Number.isFinite(n) && text(cells[k]?.html) ? n : null;
    };
    const club = text(cells.active_team?.html);
    const country = text(cells.active_team_country?.html);
    return [
      {
        name: text(cells.player.html),
        brefId: brefIdOf(cells.player.html),
        age: num("age"),
        draftYear: num("draft_year"),
        draftTeam: text(cells.draft_team?.html) || null,
        round: num("draft_round"),
        pick: num("pick_overall"),
        club: club || null,
        league: text(cells.lg_id?.html) || null,
        country: country ? country.toUpperCase() : null,
      },
    ];
  });
}

function currentSeasonEndYear(now = new Date()) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

async function main() {
  const force = process.argv.includes("--force");
  let prior = null;
  try {
    prior = JSON.parse(await fs.readFile(OUT, "utf8"));
  } catch {
    prior = null;
  }
  if (!force && prior?.generatedAt && Date.now() - Date.parse(prior.generatedAt) < FRESH_MS) {
    console.log(`[bref-team-contracts] bake is fresh (${prior.generatedAt}); skipping`);
    return;
  }

  const year = currentSeasonEndYear();
  const teams = { ...(prior?.teams ?? {}) };
  let ok = 0;
  let first = true;
  for (const [code, teamId] of Object.entries(TEAMS)) {
    try {
      if (!first) await sleep(DELAY_MS);
      first = false;
      const payroll = parsePayroll(await fetchHtml(`https://www.basketball-reference.com/contracts/${code}.html`));
      await sleep(DELAY_MS);
      let draftRights = teams[teamId]?.draftRights ?? [];
      try {
        draftRights = parseDraftRights(await fetchHtml(`https://www.basketball-reference.com/teams/${code}/${year}.html`));
      } catch (error) {
        console.warn(`[bref-team-contracts] ${code} draft rights kept: ${error.message}`);
      }
      teams[teamId] = { code, retrievedAt: new Date().toISOString(), ...payroll, draftRights };
      ok += 1;
      console.log(`[bref-team-contracts] ${code}: ${payroll.rows.length} contracts, ${draftRights.length} draft rights`);
    } catch (error) {
      console.warn(`[bref-team-contracts] ${code} kept prior entry: ${error.message}`);
    }
  }
  if (!ok && prior) {
    console.warn("[bref-team-contracts] every team failed; keeping the prior bake");
    return;
  }
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "basketball-reference.com/contracts",
    teams,
  };
  await fs.writeFile(OUT, `${JSON.stringify(out)}\n`);
  console.log(`[bref-team-contracts] wrote ${ok}/30 teams → ${path.relative(process.cwd(), OUT)}`);
}

export { parseDraftRights, parsePayroll };

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
