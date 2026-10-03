/**
 * Verified franchise records from Basketball-Reference (franchise index,
 * per-franchise season table, career leaders). Overlaid on the curated
 * history book in `src/data/franchises/history.ts`.
 *
 * Usage: node scripts/build-franchise-records.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.join(
  process.cwd(),
  "src/data/franchises/verified-records.json"
);
/** BRef blocks clients above ~20 requests/minute. */
const DELAY_MS = Number(process.env.BREF_DELAY_MS || 3200);

/** BRef franchise code (from /teams/XXX/) → history book id. */
const CODE_TO_ID = {
  ATL: "atl",
  BOS: "bos",
  NJN: "bkn",
  BRK: "bkn",
  CHA: "cha",
  CHO: "cha",
  CHI: "chi",
  CLE: "cle",
  DAL: "dal",
  DEN: "den",
  DET: "det",
  GSW: "gsw",
  HOU: "hou",
  IND: "ind",
  LAC: "lac",
  LAL: "lal",
  MEM: "mem",
  MIA: "mia",
  MIL: "mil",
  MIN: "min",
  NOH: "nop",
  NOP: "nop",
  NYK: "nyk",
  OKC: "okc",
  SEA: "okc",
  ORL: "orl",
  PHI: "phi",
  PHO: "phx",
  POR: "por",
  SAC: "sac",
  SAS: "sas",
  TOR: "tor",
  UTA: "uta",
  WAS: "was",
};

const LEADER_STATS = {
  points: "pts",
  rebounds: "trb",
  assists: "ast",
  steals: "stl",
  blocks: "blk",
  threes: "fg3",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)",
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
    .replace(/&#x27;/g, "'")
    .replace(/\*/g, "")
    .trim();
}

function rowsOf(html) {
  return [...html.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)].map((m) => ({
    attrs: m[1] ?? "",
    raw: m[2] ?? "",
    cells: Object.fromEntries(
      [...(m[2] ?? "").matchAll(
        /data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[dh]>/g
      )].map((c) => [c[1], c[2]])
    ),
  }));
}

function int(raw) {
  const n = Number(text(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function seasonEndYear(season) {
  const start = Number(season.slice(0, 4));
  return Number.isFinite(start) ? start + 1 : null;
}

async function main() {
  const index = await fetchHtml("https://www.basketball-reference.com/teams/");
  const activeStart = index.indexOf('id="teams_active"');
  const activeEnd = index.indexOf("</table>", activeStart);
  const active = index.slice(activeStart, activeEnd);

  const franchises = {};
  for (const row of rowsOf(active)) {
    if (!row.attrs.includes("full_table")) continue;
    const code = row.cells.franch_name?.match(/\/teams\/([A-Z]{3})\//)?.[1];
    const id = code ? CODE_TO_ID[code] : null;
    if (!id) {
      if (code) console.warn(`[franchise-records] unmapped code ${code}`);
      continue;
    }
    franchises[id] = {
      code,
      name: text(row.cells.franch_name),
      leagues: text(row.cells.lg_id),
      firstSeason: text(row.cells.year_min),
      regularSeasonWins: int(row.cells.wins),
      regularSeasonLosses: int(row.cells.losses),
      playoffAppearances: int(row.cells.years_playoffs),
      divisionTitles: int(row.cells.years_division_champion),
      conferenceTitles: int(row.cells.years_conference_champion),
      leagueTitles: int(row.cells.years_league_champion),
    };
  }
  console.log(
    `[franchise-records] index: ${Object.keys(franchises).length} franchises`
  );

  for (const [id, f] of Object.entries(franchises)) {
    await sleep(DELAY_MS);
    try {
      const html = await fetchHtml(
        `https://www.basketball-reference.com/teams/${f.code}/`
      );
      const seasons = rowsOf(html)
        .map((r) => ({
          season: text(r.cells.season),
          league: text(r.cells.lg_id),
          wins: int(r.cells.wins),
          losses: int(r.cells.losses),
          playoffs: text(r.cells.rank_team_playoffs),
        }))
        .filter(
          (s) =>
            /^\d{4}-\d{2}$/.test(s.season) &&
            s.wins != null &&
            s.losses != null &&
            s.wins + s.losses > 0
        );
      const pct = (s) => s.wins / (s.wins + s.losses);
      const best = seasons.reduce((a, b) =>
        pct(b) > pct(a) || (pct(b) === pct(a) && b.wins > a.wins) ? b : a
      );
      const worst = seasons.reduce((a, b) =>
        pct(b) < pct(a) || (pct(b) === pct(a) && b.wins < a.wins) ? b : a
      );
      const finals = seasons.filter((s) =>
        /\b(Won|Lost) (BAA |ABA )?Finals\b/.test(s.playoffs)
      );
      const titles = seasons
        .filter((s) => /\bWon (BAA |ABA )?Finals\b/.test(s.playoffs))
        .map((s) => ({
          year: seasonEndYear(s.season),
          league: s.league,
        }));
      Object.assign(f, {
        seasonsPlayed: seasons.length,
        lastSeason: seasons[0]?.season ?? null,
        bestSeason: { season: best.season, wins: best.wins, losses: best.losses },
        worstSeason: {
          season: worst.season,
          wins: worst.wins,
          losses: worst.losses,
        },
        finalsAppearances: finals.length,
        championships: titles.map((t) => t.year).sort((a, b) => a - b),
        championshipLeagues: Object.fromEntries(
          titles.map((t) => [t.year, t.league])
        ),
      });
      process.stdout.write(`[franchise-records] ${id} seasons ${seasons.length}`);
    } catch (error) {
      console.log(`[franchise-records] ${id} seasons FAIL ${error.message}`);
      continue;
    }

    await sleep(DELAY_MS);
    try {
      const html = await fetchHtml(
        `https://www.basketball-reference.com/teams/${f.code}/leaders_career.html`
      );
      const leaders = {};
      for (const [key, stat] of Object.entries(LEADER_STATS)) {
        const start = html.indexOf(`id="leaders_${stat}"`);
        if (start < 0) continue;
        const seg = html.slice(start, start + 2000);
        const who = seg.match(/<span class="who">([\s\S]*?)<\/span>/)?.[1];
        const value = seg.match(/<span class="value">([\s\S]*?)<\/span>/)?.[1];
        const n = int(value);
        if (who && n != null) leaders[key] = { player: text(who), value: n };
      }
      f.leaders = leaders;
      console.log(` · leaders ${Object.keys(leaders).length}`);
    } catch (error) {
      console.log(` · leaders FAIL ${error.message}`);
    }
  }

  const payload = {
    source:
      "Basketball-Reference franchise index, franchise season tables, and career leaders (NBA, ABA, and BAA seasons of each continuous franchise)",
    generatedAt: new Date().toISOString(),
    franchises,
  };
  await fs.writeFile(OUT, `${JSON.stringify(payload, null, 1)}\n`);
  console.log(`[franchise-records] wrote ${OUT}`);
}

await main();
