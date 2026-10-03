/**
 * Retired NBA numbers from Wikipedia's "List of NBA retired numbers", joined
 * to stats.nba.com PERSON_IDs through the nba_api static player list.
 * Writes `src/content/awards/retired-jerseys.json`, read by the player-page
 * banner tiles and the franchise history "Retired numbers" count.
 *
 * Usage: node scripts/build-retired-jerseys.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/content/awards/retired-jerseys.json");
const WIKI_URL =
  "https://en.wikipedia.org/w/index.php?title=List_of_NBA_retired_numbers&action=raw";
const WIKI_PAGE = "https://en.wikipedia.org/wiki/List_of_NBA_retired_numbers";
const NBA_API_URL =
  "https://raw.githubusercontent.com/swar/nba_api/master/src/nba_api/stats/library/data.py";

const TEAM_TO_KEY = {
  "Atlanta Hawks": "atl",
  "Boston Celtics": "bos",
  "Brooklyn Nets": "bkn",
  "Charlotte Hornets": "cha",
  "Chicago Bulls": "chi",
  "Cleveland Cavaliers": "cle",
  "Dallas Mavericks": "dal",
  "Denver Nuggets": "den",
  "Detroit Pistons": "det",
  "Golden State Warriors": "gsw",
  "Houston Rockets": "hou",
  "Indiana Pacers": "ind",
  "Los Angeles Clippers": "lac",
  "Los Angeles Lakers": "lal",
  "Memphis Grizzlies": "mem",
  "Miami Heat": "mia",
  "Milwaukee Bucks": "mil",
  "Minnesota Timberwolves": "min",
  "New Orleans Pelicans": "nop",
  "New York Knicks": "nyk",
  "Oklahoma City Thunder": "okc",
  "Orlando Magic": "orl",
  "Philadelphia 76ers": "phi",
  "Phoenix Suns": "phx",
  "Portland Trail Blazers": "por",
  "Sacramento Kings": "sac",
  "San Antonio Spurs": "sas",
  "Seattle SuperSonics": "sea",
  "Toronto Raptors": "tor",
  "Utah Jazz": "uta",
  "Washington Wizards": "was",
};

/**
 * Names spelled differently in nba_api, or shared by two NBA players.
 * Keyed by `${teamKey}:${number}`.
 */
const PERSON_ID_OVERRIDES = {
  "bos:10": "78510", // Jo Jo White ("Jojo White")
  "bos:16": "78060", // Satch Sanders ("Thomas Sanders")
  "bos:25": "77188", // K. C. Jones
  "den:12": "77376", // Fat Lever ("Lafayette Lever")
  "gsw:16": "76070", // Al Attles ("Alvin Attles")
  "nyk:33": "121", // Patrick Ewing, not Patrick Ewing Jr.
  "phi:24": "77193", // Bobby Jones (born 1951), not the 2000s forward
};

const PLAYER_POSITION = /^(?:[PS]?[GFC])(?:\/[PS]?[GFC])*$/;

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "basketball-analytics retired-numbers build" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/** Split on a separator only outside {{templates}} and [[links]]. */
function splitTop(line, sep) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const two = line.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      cur += two;
      i++;
      continue;
    }
    if (two === "}}" || two === "]]") {
      depth--;
      cur += two;
      i++;
      continue;
    }
    if (depth === 0 && line.startsWith(sep, i)) {
      parts.push(cur);
      cur = "";
      i += sep.length - 1;
      continue;
    }
    cur += line[i];
  }
  parts.push(cur);
  return parts;
}

function cellsOf(block) {
  const out = [];
  for (const line of block.split("\n")) {
    if (!line.startsWith("|") && !line.startsWith("!")) {
      if (out.length) out[out.length - 1] += "\n" + line;
      continue;
    }
    out.push(...splitTop(line.slice(1), "||"));
  }
  return out.map((cell) => {
    const [first, ...rest] = splitTop(cell, "|");
    return rest.length
      ? { attrs: first, body: rest.join("|") }
      : { attrs: "", body: first };
  });
}

function parseWiki(wiki) {
  const start = wiki.indexOf('{| class="wikitable sortable"');
  if (start < 0) throw new Error("retired numbers table not found");
  const table = wiki.slice(start, wiki.indexOf("\n|}", start));
  const rows = [];
  let team = null;
  for (const block of table.split(/\n\|-\s*\n/).slice(1)) {
    const cells = cellsOf(block);
    if (cells.length < 4) continue;
    const [numCell, nameCell] = cells;
    let idx = 2;
    const teamMatch = cells[2].body.match(/^\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*$/);
    if (teamMatch) {
      team = teamMatch[1].trim();
      idx = 3;
    }
    const number =
      numCell.body.match(/\{\{nts\|([^}|]+)\}\}/)?.[1]?.trim() ?? null;
    const sortname = nameCell.body.match(/\{\{sortname\|([^}]+)\}\}/);
    let name;
    let link = null;
    if (sortname) {
      const parts = sortname[1].split("|").filter((p) => !p.includes("="));
      name = `${parts[0]} ${parts[1]}`.replace(/\s+/g, " ").trim();
      link = parts[2] || null;
    } else {
      const lk = nameCell.body.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
      name = (lk?.[2] ?? lk?.[1] ?? nameCell.body).replace(/[†‡*]/g, "").trim();
      link = lk?.[1] ?? null;
    }
    const note = (cells[idx + 2]?.body ?? "")
      .replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, "")
      .trim();
    rows.push({
      team,
      number,
      name,
      link,
      position: (cells[idx]?.body ?? "").trim(),
      years: (cells[idx + 1]?.body ?? "").trim(),
      future: /eccfec/.test(`${numCell.attrs} ${nameCell.attrs}`),
      honorary: /^never played for the franchise/i.test(note),
    });
  }
  return rows;
}

function parseNbaApiPlayers(py) {
  const block = py.slice(py.indexOf("players = ["), py.indexOf("wnba_players = ["));
  const players = [];
  for (const m of block.matchAll(
    /\[(\d+), "(?:[^"\\]|\\.)*", "(?:[^"\\]|\\.)*", "((?:[^"\\]|\\.)*)", (?:True|False)\]/g
  )) {
    players.push({ id: m[1], name: m[2].replace(/\\"/g, '"') });
  }
  if (players.length < 4000) throw new Error(`nba_api players too short: ${players.length}`);
  return players;
}

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'"’]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  const [wiki, py] = await Promise.all([fetchText(WIKI_URL), fetchText(NBA_API_URL)]);
  const parsed = parseWiki(wiki);
  const players = parseNbaApiPlayers(py);
  const byName = new Map();
  for (const p of players) {
    const key = norm(p.name);
    byName.set(key, [...(byName.get(key) ?? []), p.id]);
  }

  const unknownTeams = [...new Set(parsed.map((r) => r.team))].filter(
    (t) => !TEAM_TO_KEY[t]
  );
  if (unknownTeams.length) throw new Error(`Unmapped teams: ${unknownTeams.join(", ")}`);

  const bannerCounts = Object.fromEntries(
    Object.values(TEAM_TO_KEY).map((key) => [key, 0])
  );
  const jerseys = [];
  const ambiguousNames = new Set();
  const problems = [];
  for (const row of parsed) {
    const teamKey = TEAM_TO_KEY[row.team];
    if (row.future) continue;
    if (row.number && /^\d+$/.test(row.number)) {
      bannerCounts[teamKey] = (bannerCounts[teamKey] ?? 0) + 1;
    }
    if (!PLAYER_POSITION.test(row.position) || !row.number) continue;
    const lookup = row.link === "Magic Johnson" ? "Magic Johnson" : row.name;
    const hits = byName.get(norm(lookup)) ?? [];
    const override = PERSON_ID_OVERRIDES[`${teamKey}:${row.number}`];
    const nbaPlayerId = override ?? (hits.length === 1 ? hits[0] : null);
    if (hits.length > 1) ambiguousNames.add(norm(lookup));
    if (!nbaPlayerId) {
      problems.push(`${teamKey} #${row.number} ${row.name} (${hits.length} matches)`);
      continue;
    }
    jerseys.push({
      nbaPlayerId,
      teamKey,
      number: row.number,
      playerName: row.name.replace(/^Earvin "Magic" Johnson$/, "Magic Johnson"),
      years: row.years.replace(/\s+/g, " "),
      ...(row.honorary ? { honorary: true } : {}),
    });
  }
  if (problems.length) {
    throw new Error(`Unresolved player rows (add overrides):\n${problems.join("\n")}`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: WIKI_PAGE,
    idSource: "nba_api static player list (stats.nba.com PERSON_ID)",
    policy:
      "Player banners only; future retirements, owners, coaches, broadcasters and fan banners are excluded from jerseys. bannerCounts counts every numbered banner except future ones. Names match NFD-stripped, lowercased, without . ' \" and with hyphens as spaces.",
    bannerCounts,
    /** Normalized retiree names shared with another NBA player; never match these by name. */
    ambiguousNames: [...ambiguousNames].sort(),
    jerseys,
  };
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `wrote ${jerseys.length} player banners across ${Object.keys(bannerCounts).length} franchises → ${path.relative(process.cwd(), OUT)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
