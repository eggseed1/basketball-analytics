/**
 * Bake player accolades for Cloudflare Workers.
 * stats.nba.com/playerawards is blocked/flaky on Workers; BRef award indexes are reachable at build time.
 *
 *   node scripts/build-runtime-player-awards.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src", "data", "runtime", "player-awards-snapshot.json");
const ALIAS_PATHS = [
  path.join(ROOT, "data", "impact", "player-id-aliases.json"),
  path.join(ROOT, "data", "impact", "legend-player-aliases.json"),
  path.join(ROOT, "src", "data", "runtime", "player-id-aliases-snapshot.json"),
];
const HISTORY_PATH = path.join(ROOT, "src", "content", "awards", "history.ts");

const UA = {
  "User-Agent":
    "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)",
  Accept: "text/html,application/xhtml+xml",
};

/** Award pages → NBA Stats DESCRIPTION strings used by matchAwardDefinition. */
const AWARD_PAGES = [
  {
    url: "https://www.basketball-reference.com/awards/mvp.html",
    description: "NBA Most Valuable Player",
    kind: "season_winner",
  },
  {
    url: "https://www.basketball-reference.com/awards/finals_mvp.html",
    description: "NBA Finals Most Valuable Player",
    kind: "season_winner",
  },
  {
    url: "https://www.basketball-reference.com/awards/dpoy.html",
    description: "NBA Defensive Player of the Year",
    kind: "season_winner",
  },
  {
    url: "https://www.basketball-reference.com/awards/roy.html",
    description: "NBA Rookie of the Year",
    kind: "season_winner",
  },
  {
    url: "https://www.basketball-reference.com/awards/all_league.html",
    description: "All-NBA",
    kind: "season_team",
  },
  {
    url: "https://www.basketball-reference.com/awards/all_defense.html",
    description: "All-Defensive Team",
    kind: "season_team",
  },
  {
    url: "https://www.basketball-reference.com/awards/all_star_by_player.html",
    description: "NBA All-Star",
    kind: "all_star_counts",
  },
];

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unwrapBrefTables(html) {
  return html.replace(/<!--([\s\S]*?)-->/g, (_, inner) =>
    /<table/i.test(inner) ? inner : ""
  );
}

function canonicalSeasonFromBref(raw) {
  const s = String(raw ?? "").trim();
  // "2023-24" already
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  // "2024" end year → 2023-24
  const y = Number(s);
  if (Number.isFinite(y) && y >= 1947 && y <= 2100) {
    const start = y - 1;
    return `${start}-${String(y % 100).padStart(2, "0")}`;
  }
  return null;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: UA,
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Pull (brefSlug, displayName, season?) rows from a BRef awards table. */
function parseSeasonWinnerRows(html) {
  const body = unwrapBrefTables(html);
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(body))) {
    const chunk = tr[1];
    const seasonMatch =
      chunk.match(/data-stat="season"[^>]*>\s*<a[^>]*>\s*(\d{4}-\d{2})\s*</i) ||
      chunk.match(/data-stat="season"[^>]*>\s*(\d{4}-\d{2})\s*</i) ||
      chunk.match(/data-stat="season"[^>]*>\s*<a[^>]*>\s*(\d{4})\s*</i);
    const playerMatch = chunk.match(
      /data-(?:append-csv|stat)=["'](?:player|[^"']*)["'][^>]*>[\s\S]*?href=["']\/players\/[a-z]\/([a-z0-9]+)\.html["'][^>]*>([^<]+)</i
    ) ||
      chunk.match(
        /href=["']\/players\/[a-z]\/([a-z0-9]+)\.html["'][^>]*>([^<]+)</i
      );
    if (!playerMatch) continue;
    const season = seasonMatch
      ? canonicalSeasonFromBref(seasonMatch[1])
      : null;
    if (!season) continue;
    rows.push({
      brefSlug: playerMatch[1],
      name: decodeEntities(playerMatch[2]),
      season,
    });
  }
  return rows;
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

/** All-NBA / All-Defense: season + team tier (1st/2nd/3rd) + player links. */
function parseSeasonTeamRows(html) {
  const body = unwrapBrefTables(html);
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(body))) {
    const chunk = tr[1];
    const seasonMatch =
      chunk.match(/data-stat="season"[^>]*>\s*<a[^>]*>\s*(\d{4}-\d{2})\s*</i) ||
      chunk.match(/data-stat="season"[^>]*>\s*(\d{4}-\d{2})\s*</i);
    if (!seasonMatch) continue;
    const season = canonicalSeasonFromBref(seasonMatch[1]);
    if (!season) continue;
    const teamMatch = chunk.match(
      /data-stat="all_team"[^>]*>\s*(1st|2nd|3rd|First|Second|Third)\s*</i
    );
    let teamNote = null;
    if (teamMatch) {
      const raw = teamMatch[1].toLowerCase();
      teamNote =
        raw.startsWith("1") || raw === "first"
          ? "1st Team"
          : raw.startsWith("2") || raw === "second"
            ? "2nd Team"
            : "3rd Team";
    }
    const playerRe =
      /href=["']\/players\/[a-z]\/([a-z0-9]+)\.html["'][^>]*>([^<]+)</gi;
    let pm;
    while ((pm = playerRe.exec(chunk))) {
      rows.push({
        brefSlug: pm[1],
        name: decodeEntities(pm[2]),
        season,
        teamNote,
      });
    }
  }
  return rows;
}

/** all_star_by_player: slug + career count (no season list). */
function parseAllStarCounts(html) {
  const body = unwrapBrefTables(html);
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(body))) {
    const chunk = tr[1];
    const playerMatch = chunk.match(
      /href=["']\/players\/[a-z]\/([a-z0-9]+)\.html["'][^>]*>([^<]+)</i
    );
    if (!playerMatch) continue;
    const nums = [...chunk.matchAll(/<td[^>]*class="[^"]*center[^"]*"[^>]*>\s*(\d+)\s*</gi)];
    // columns: NBA count, then sometimes ABA — prefer first (NBA)
    const count = nums.length ? Number(nums[0][1]) : 0;
    if (!Number.isFinite(count) || count <= 0) continue;
    rows.push({
      brefSlug: playerMatch[1],
      name: decodeEntities(playerMatch[2]),
      count,
    });
  }
  return rows;
}

async function loadNameToNbaId() {
  const map = new Map();
  const espnToNba = new Map();
  let aliasFiles = 0;
  for (const aliasPath of ALIAS_PATHS) {
    try {
      const raw = JSON.parse(await fs.readFile(aliasPath, "utf8"));
      aliasFiles += 1;
      for (const row of raw.aliases ?? []) {
        const nbaId = String(row.nbaPlayerId ?? "").trim();
        const espnId = String(row.espnPlayerId ?? "").trim();
        const name = normalizeName(row.playerName);
        if (nbaId && espnId) espnToNba.set(espnId, nbaId);
        if (!nbaId || !name) continue;
        if (!map.has(name)) map.set(name, nbaId);
      }
    } catch {
      /* optional path */
    }
  }
  if (!aliasFiles) {
    console.warn("[player-awards] aliases missing — name match will be sparse");
  }

  // Search snapshot names (ESPN ids) → NBA via aliases.
  try {
    const search = JSON.parse(
      await fs.readFile(
        path.join(ROOT, "src", "data", "runtime", "player-search-snapshot.json"),
        "utf8"
      )
    );
    for (const row of search.players ?? []) {
      const espnId = String(row?.[0] ?? "").trim();
      const name = normalizeName(row?.[1]);
      const nbaId = espnToNba.get(espnId);
      if (!nbaId || !name) continue;
      if (!map.has(name)) map.set(name, nbaId);
    }
  } catch {
    /* optional */
  }

  // history.ts hrefs are NBA person ids — fill gaps only.
  // Never overwrite legend/alias joins (typos there used to map Billups→1712/Jamison).
  try {
    const hist = await fs.readFile(HISTORY_PATH, "utf8");
    const re =
      /winner:\s*"([^"]+)"[^\n]*href:\s*"\/players\/(\d+)"/g;
    let m;
    while ((m = re.exec(hist))) {
      const name = normalizeName(m[1]);
      const nbaId = m[2];
      if (name && nbaId && !map.has(name)) map.set(name, nbaId);
    }
    const re2 =
      /href:\s*"\/players\/(\d+)"[^\n]*winner:\s*"([^"]+)"/g;
    while ((m = re2.exec(hist))) {
      const name = normalizeName(m[2]);
      const nbaId = m[1];
      if (name && nbaId && !map.has(name)) map.set(name, nbaId);
    }
  } catch {
    /* optional */
  }
  return map;
}

function resolveNbaId(nameToNba, name, brefSlug, slugToNba) {
  if (slugToNba.has(brefSlug)) return slugToNba.get(brefSlug);
  const n = normalizeName(name);
  if (nameToNba.has(n)) return nameToNba.get(n);
  // strip suffixes like "Jr."
  const stripped = n.replace(/\s+(jr|sr|ii|iii|iv)$/u, "").trim();
  if (stripped !== n && nameToNba.has(stripped)) return nameToNba.get(stripped);
  return null;
}

function pushAward(byNbaId, nbaId, description, season, note = null) {
  if (!nbaId || !description || !season) return;
  const list = byNbaId.get(nbaId) ?? [];
  const key = `${description}|${season}`;
  if (list.some((r) => `${r[0]}|${r[1]}` === key)) {
    byNbaId.set(nbaId, list);
    return;
  }
  const row = note ? [description, season, note] : [description, season];
  list.push(row);
  byNbaId.set(nbaId, list);
}

function rememberIdentity(names, slugs, nbaId, name, brefSlug) {
  if (!nbaId) return;
  const display = String(name ?? "")
    .replace(/\*/g, "")
    .trim();
  if (display && !names[nbaId]) names[nbaId] = display;
  const slug = String(brefSlug ?? "")
    .trim()
    .toLowerCase();
  if (slug && !slugs[nbaId]) slugs[nbaId] = slug;
}

async function main() {
  const nameToNba = await loadNameToNbaId();
  const slugToNba = new Map();
  const byNbaId = new Map();
  const names = {};
  const slugs = {};
  let matched = 0;
  let unmatched = 0;

  for (const page of AWARD_PAGES) {
    console.log(`[player-awards] fetch ${page.url}`);
    const html = await fetchText(page.url);
    if (page.kind === "season_winner") {
      const rows = parseSeasonWinnerRows(html);
      console.log(`[player-awards]   ${rows.length} season-winner rows`);
      for (const row of rows) {
        const nbaId = resolveNbaId(nameToNba, row.name, row.brefSlug, slugToNba);
        if (!nbaId) {
          unmatched += 1;
          continue;
        }
        slugToNba.set(row.brefSlug, nbaId);
        rememberIdentity(names, slugs, nbaId, row.name, row.brefSlug);
        matched += 1;
        pushAward(byNbaId, nbaId, page.description, row.season);
      }
    } else if (page.kind === "season_team") {
      const rows = parseSeasonTeamRows(html);
      console.log(`[player-awards]   ${rows.length} team-selection rows`);
      for (const row of rows) {
        const nbaId = resolveNbaId(nameToNba, row.name, row.brefSlug, slugToNba);
        if (!nbaId) {
          unmatched += 1;
          continue;
        }
        slugToNba.set(row.brefSlug, nbaId);
        rememberIdentity(names, slugs, nbaId, row.name, row.brefSlug);
        matched += 1;
        pushAward(byNbaId, nbaId, page.description, row.season, row.teamNote);
      }
    } else if (page.kind === "all_star_counts") {
      const rows = parseAllStarCounts(html);
      console.log(`[player-awards]   ${rows.length} all-star players`);
      for (const row of rows) {
        const nbaId = resolveNbaId(nameToNba, row.name, row.brefSlug, slugToNba);
        if (!nbaId) {
          unmatched += 1;
          continue;
        }
        slugToNba.set(row.brefSlug, nbaId);
        rememberIdentity(names, slugs, nbaId, row.name, row.brefSlug);
        matched += 1;
        // Unique synthetic seasons so summarizePlayerAccolades count == selections.
        for (let i = 1; i <= row.count; i++) {
          pushAward(
            byNbaId,
            nbaId,
            page.description,
            `AS-${String(i).padStart(2, "0")}`
          );
        }
      }
    }
  }

  const players = {};
  for (const [nbaId, rows] of [...byNbaId.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    players[nbaId] = rows;
  }

  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    source: "basketball-reference.com/awards",
    playerCount: Object.keys(players).length,
    names,
    slugs,
    players,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(payload));
  const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
  console.log(
    `[player-awards] wrote ${OUT} players=${payload.playerCount} matchedHits=${matched} unmatchedHits=${unmatched} gzip~${gz}`
  );
}

main().catch((error) => {
  console.error("[player-awards] failed", error);
  process.exit(1);
});
