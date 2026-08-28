/**
 * Build-time Basketball-Reference snapshot for Cloudflare Workers.
 * site.api / BRef egress is often blocked on Workers. Paid plan allows a
 * fuller multi-season advanced + per-game + per-poss snapshot.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const OUT = path.join(
  process.cwd(),
  "src/data/runtime/bref-advanced-snapshot.json"
);

const SNAPSHOT_VERSION = 3;

const now = new Date();
const currentStart =
  now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
/**
 * Completed seasons only (skip empty upcoming league year).
 * Keep a long window so CF percentile / career sparklines cover full careers
 * when live ESPN times out (Workers cannot read on-disk history).
 */
const BREF_SEASON_WINDOW = Number(process.env.BREF_SEASON_WINDOW || 30);
const ADV_START_YEARS = Array.from(
  { length: BREF_SEASON_WINDOW },
  (_, i) => currentStart - 1 - i
);
/** Per-game + per-poss in lockstep with advanced so career sheets aren't empty. */
const PG_START_YEARS = Array.from(
  { length: BREF_SEASON_WINDOW },
  (_, i) => currentStart - 1 - i
);

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function brefYear(canonical) {
  return Number(canonical.slice(0, 4)) + 1;
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, "")
    .trim();
}

function num(raw) {
  if (raw == null || raw === "" || raw === "-") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function round(n, d = 3) {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function isCombined(team) {
  return team === "2TM" || team === "3TM" || team === "TOT";
}

/** Prefer full regular-season rows when playoff duplicates share name+team. */
function dedupeByPlayerTeam(rows) {
  const best = new Map();
  for (const row of rows) {
    const key = `${String(row.n).toLowerCase()}|${row.t}`;
    const prev = best.get(key);
    if (
      !prev ||
      (row.gp ?? 0) > (prev.gp ?? 0) ||
      ((row.gp ?? 0) === (prev.gp ?? 0) && (row.mp ?? 0) > (prev.mp ?? 0))
    ) {
      best.set(key, row);
    }
  }
  return [...best.values()];
}

function parseTable(html, mapRow) {
  const cleaned = html.replace(/<!--|-->/g, "");
  const cellRegex =
    /<(td|th)[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  const rows = [];
  for (const rowMatch of cleaned.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = new Map();
    for (const cellMatch of rowHtml.matchAll(cellRegex)) {
      cells.set(cellMatch[2], decodeEntities(cellMatch[3] ?? ""));
    }
    const playerName = cells.get("name_display") ?? cells.get("player");
    if (!playerName || playerName === "Player") continue;
    const teamAbbr = (
      cells.get("team_name_abbr") ??
      cells.get("team_id") ??
      ""
    )
      .toUpperCase()
      .trim();
    if (!teamAbbr || isCombined(teamAbbr)) continue;
    const mapped = mapRow(cells, playerName, teamAbbr);
    if (mapped) rows.push(mapped);
  }
  return rows;
}

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
  return res.text();
}

function mapAdvanced(cells, playerName, teamAbbr) {
  return {
    n: playerName,
    t: teamAbbr,
    gp: num(cells.get("games") ?? cells.get("g")),
    mp: Math.round(num(cells.get("mp"))),
    per: round(num(cells.get("per")), 2),
    ts: round(num(cells.get("ts_pct")), 3),
    usg: round(num(cells.get("usg_pct")), 3),
    ows: round(num(cells.get("ows")), 2),
    dws: round(num(cells.get("dws")), 2),
    ws: round(num(cells.get("ws")), 2),
    ws48: round(num(cells.get("ws_per_48")), 3),
    obpm: round(num(cells.get("obpm")), 2),
    dbpm: round(num(cells.get("dbpm")), 2),
    bpm: round(num(cells.get("bpm")), 2),
    vorp: round(num(cells.get("vorp")), 2),
    fg3Ar: round(num(cells.get("fg3a_per_fga_pct")), 3),
    ftr: round(num(cells.get("fta_per_fga_pct")), 3),
    orbPct: round(num(cells.get("orb_pct")), 3),
    drbPct: round(num(cells.get("drb_pct")), 3),
    trbPct: round(num(cells.get("trb_pct")), 3),
    astPct: round(num(cells.get("ast_pct")), 3),
    stlPct: round(num(cells.get("stl_pct")), 3),
    blkPct: round(num(cells.get("blk_pct")), 3),
    tovPct: round(num(cells.get("tov_pct")), 3),
  };
}

function mapPerGame(cells, playerName, teamAbbr) {
  const gp = num(cells.get("games") ?? cells.get("g"));
  if (gp < 1) return null;
  const fgm = round(num(cells.get("fg_per_g") ?? cells.get("fg")), 1);
  const fga = round(num(cells.get("fga_per_g") ?? cells.get("fga")), 1);
  const fg3m = round(num(cells.get("fg3_per_g") ?? cells.get("fg3")), 1);
  const fg3a = round(num(cells.get("fg3a_per_g") ?? cells.get("fg3a")), 1);
  const fg2m = round(
    num(cells.get("fg2_per_g") ?? cells.get("fg2")) || Math.max(0, fgm - fg3m),
    1
  );
  const fg2a = round(
    num(cells.get("fg2a_per_g") ?? cells.get("fg2a")) || Math.max(0, fga - fg3a),
    1
  );
  return {
    n: playerName,
    t: teamAbbr,
    gp,
    gs: Math.round(num(cells.get("gs"))),
    age: round(num(cells.get("age")), 0) || undefined,
    pos: cells.get("pos") || undefined,
    mp: round(num(cells.get("mp_per_g") ?? cells.get("mp")), 1),
    pts: round(num(cells.get("pts_per_g") ?? cells.get("pts")), 1),
    trb: round(num(cells.get("trb_per_g") ?? cells.get("trb")), 1),
    orb: round(num(cells.get("orb_per_g") ?? cells.get("orb")), 1),
    drb: round(num(cells.get("drb_per_g") ?? cells.get("drb")), 1),
    ast: round(num(cells.get("ast_per_g") ?? cells.get("ast")), 1),
    stl: round(num(cells.get("stl_per_g") ?? cells.get("stl")), 1),
    blk: round(num(cells.get("blk_per_g") ?? cells.get("blk")), 1),
    tov: round(num(cells.get("tov_per_g") ?? cells.get("tov")), 1),
    pf: round(num(cells.get("pf_per_g") ?? cells.get("pf")), 1),
    fgm,
    fga,
    fg3m,
    fg3a,
    fg2m,
    fg2a,
    ftm: round(num(cells.get("ft_per_g") ?? cells.get("ft")), 1),
    fta: round(num(cells.get("fta_per_g") ?? cells.get("fta")), 1),
    fgPct: round(num(cells.get("fg_pct")), 3),
    fg3Pct: round(num(cells.get("fg3_pct")), 3),
    fg2Pct: round(num(cells.get("fg2_pct")), 3),
    efgPct: round(num(cells.get("efg_pct")), 3),
    ftPct: round(num(cells.get("ft_pct")), 3),
  };
}

function mapPerPoss(cells, playerName, teamAbbr) {
  const ortg = num(cells.get("off_rtg"));
  const drtg = num(cells.get("def_rtg"));
  if (ortg <= 0 && drtg <= 0) return null;
  return {
    n: playerName,
    t: teamAbbr,
    gp: num(cells.get("games") ?? cells.get("g")),
    ortg: ortg > 0 ? round(ortg, 1) : undefined,
    drtg: drtg > 0 ? round(drtg, 1) : undefined,
  };
}

function mergeRatings(advanced, ratings) {
  if (!ratings?.length) return advanced;
  const byKey = new Map(
    ratings.map((r) => [`${r.n.toLowerCase()}|${r.t}`, r])
  );
  return advanced.map((row) => {
    const hit = byKey.get(`${row.n.toLowerCase()}|${row.t}`);
    if (!hit) return row;
    return {
      ...row,
      ...(hit.ortg != null ? { ortg: hit.ortg } : {}),
      ...(hit.drtg != null ? { drtg: hit.drtg } : {}),
    };
  });
}

function advancedNeedsRates(rows) {
  if (!rows?.length) return true;
  return rows.every((r) => r.orbPct == null && r.astPct == null);
}

function advancedNeedsRatings(rows) {
  if (!rows?.length) return true;
  return rows.every((r) => r.ortg == null && r.drtg == null);
}

function perGameNeedsCounting(rows) {
  if (!rows?.length) return true;
  return rows.every((r) => r.fgm == null && r.fga == null);
}

let previous = { version: SNAPSHOT_VERSION, seasons: {} };
try {
  previous = JSON.parse(await fs.readFile(OUT, "utf8"));
} catch {
  // first run
}

const seasons = { ...(previous.seasons ?? {}) };

// Repair cached seasons that still include playoff duplicates.
for (const [canonical, block] of Object.entries(seasons)) {
  if (block?.advanced?.length) {
    block.advanced = dedupeByPlayerTeam(block.advanced);
  }
  if (block?.perGame?.length) {
    block.perGame = dedupeByPlayerTeam(block.perGame);
  }
  seasons[canonical] = block;
}

for (const start of ADV_START_YEARS) {
  const canonical = canonicalSeason(start);
  const existing = seasons[canonical]?.advanced;
  if (existing?.length && !advancedNeedsRates(existing)) {
    console.log(
      `[bref-snapshot] ${canonical} advanced cached (${existing.length})`
    );
    continue;
  }
  const year = brefYear(canonical);
  process.stdout.write(`[bref-snapshot] ${canonical} advanced… `);
  try {
    const html = await fetchHtml(
      `https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`
    );
    const advanced = dedupeByPlayerTeam(parseTable(html, mapAdvanced));
    // Preserve ortg/drtg if we already merged them.
    const prevByKey = new Map(
      (existing ?? []).map((r) => [`${r.n.toLowerCase()}|${r.t}`, r])
    );
    const merged = advanced.map((row) => {
      const prev = prevByKey.get(`${row.n.toLowerCase()}|${row.t}`);
      if (!prev) return row;
      return {
        ...row,
        ...(prev.ortg != null ? { ortg: prev.ortg } : {}),
        ...(prev.drtg != null ? { drtg: prev.drtg } : {}),
        ...(prev.e ? { e: prev.e } : {}),
      };
    });
    seasons[canonical] = { ...(seasons[canonical] ?? {}), advanced: merged };
    console.log(merged.length);
  } catch (error) {
    console.log(`FAIL ${error instanceof Error ? error.message : error}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

for (const start of PG_START_YEARS) {
  const canonical = canonicalSeason(start);
  const existing = seasons[canonical]?.perGame;
  if (existing?.length && !perGameNeedsCounting(existing)) {
    console.log(
      `[bref-snapshot] ${canonical} per-game cached (${existing.length})`
    );
    continue;
  }
  const year = brefYear(canonical);
  process.stdout.write(`[bref-snapshot] ${canonical} per-game… `);
  try {
    const html = await fetchHtml(
      `https://www.basketball-reference.com/leagues/NBA_${year}_per_game.html`
    );
    const perGame = dedupeByPlayerTeam(parseTable(html, mapPerGame));
    const prevByKey = new Map(
      (existing ?? []).map((r) => [`${r.n.toLowerCase()}|${r.t}`, r])
    );
    const merged = perGame.map((row) => {
      const prev = prevByKey.get(`${row.n.toLowerCase()}|${row.t}`);
      return prev?.e ? { ...row, e: prev.e } : row;
    });
    seasons[canonical] = { ...(seasons[canonical] ?? {}), perGame: merged };
    console.log(merged.length);
  } catch (error) {
    console.log(`FAIL ${error instanceof Error ? error.message : error}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

for (const start of PG_START_YEARS) {
  const canonical = canonicalSeason(start);
  const existing = seasons[canonical]?.advanced;
  if (existing?.length && !advancedNeedsRatings(existing)) {
    console.log(`[bref-snapshot] ${canonical} ratings cached`);
    continue;
  }
  if (!existing?.length) continue;
  const year = brefYear(canonical);
  process.stdout.write(`[bref-snapshot] ${canonical} per-poss… `);
  try {
    const html = await fetchHtml(
      `https://www.basketball-reference.com/leagues/NBA_${year}_per_poss.html`
    );
    const ratings = dedupeByPlayerTeam(parseTable(html, mapPerPoss));
    seasons[canonical] = {
      ...(seasons[canonical] ?? {}),
      advanced: mergeRatings(existing, ratings),
    };
    console.log(ratings.length);
  } catch (error) {
    console.log(`FAIL ${error instanceof Error ? error.message : error}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

const keepSeasons = new Set(
  [...ADV_START_YEARS, ...PG_START_YEARS].map((start) => canonicalSeason(start))
);

const payload = {
  version: SNAPSHOT_VERSION,
  generatedAt: new Date().toISOString(),
  seasons: Object.fromEntries(
    Object.entries(seasons).filter(([canonical]) => keepSeasons.has(canonical))
  ),
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
console.log(
  `[bref-snapshot] wrote ${Object.keys(payload.seasons).length} seasons → ${OUT} (gzip ~${gz} bytes)`
);
