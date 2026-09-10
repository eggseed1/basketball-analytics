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
 * Completed seasons only by default (skip empty upcoming league year).
 * Daily in-season refresh sets BREF_INCLUDE_CURRENT=1 so the live year is baked.
 */
const INCLUDE_CURRENT = process.env.BREF_INCLUDE_CURRENT === "1";
/**
 * When refreshing a short window, keep previously baked seasons on disk
 * (daily job). Full rebuilds can set BREF_PRUNE=1 to drop outside the window.
 */
const PRESERVE_OUTSIDE_WINDOW =
  process.env.BREF_PRESERVE_OUTSIDE_WINDOW === "1" ||
  process.env.BREF_PRUNE !== "1";
const BREF_SEASON_WINDOW = Number(process.env.BREF_SEASON_WINDOW || 30);
const windowAnchor = INCLUDE_CURRENT ? currentStart : currentStart - 1;
const ADV_START_YEARS = Array.from(
  { length: BREF_SEASON_WINDOW },
  (_, i) => windowAnchor - i
);
/** Per-game + per-poss in lockstep with advanced so career sheets aren't empty. */
const PG_START_YEARS = Array.from(
  { length: BREF_SEASON_WINDOW },
  (_, i) => windowAnchor - i
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
  return team === "2TM" || team === "3TM" || team === "4TM" || team === "TOT";
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

/**
 * One row per player for explore boards: prefer BRef combined season (TOT/2TM/…)
 * over mid-season trade stints so Kyrie/etc. are not duplicated.
 */
function collapseToSeasonGrain(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.n ?? "")
      .toLowerCase()
      .trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const out = [];
  for (const list of groups.values()) {
    const combined = list.find((r) => isCombined(String(r.t ?? "").toUpperCase()));
    if (combined) {
      out.push(combined);
      continue;
    }
    // No TOT in source: keep the heaviest stint (last resort).
    let best = list[0];
    for (const row of list) {
      if ((row.gp ?? 0) > (best.gp ?? 0)) best = row;
      else if (
        (row.gp ?? 0) === (best.gp ?? 0) &&
        (row.mp ?? 0) > (best.mp ?? 0)
      ) {
        best = row;
      }
    }
    if (best) out.push(best);
  }
  return out;
}

function hasMultiTeamDuplicates(rows) {
  const byName = new Map();
  for (const row of rows ?? []) {
    const name = String(row.n ?? "")
      .toLowerCase()
      .trim();
    if (!name) continue;
    const team = String(row.t ?? "")
      .toUpperCase()
      .trim();
    if (!team || isCombined(team)) continue;
    const set = byName.get(name) ?? new Set();
    set.add(team);
    byName.set(name, set);
  }
  for (const teams of byName.values()) {
    if (teams.size > 1) return true;
  }
  return false;
}

function parseTable(html, mapRow, { includeCombined = false } = {}) {
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
    if (!teamAbbr) continue;
    if (!includeCombined && isCombined(teamAbbr)) continue;
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
  const byName = new Map();
  for (const r of ratings) {
    const name = String(r.n).toLowerCase();
    const prev = byName.get(name);
    if (!prev || isCombined(String(r.t ?? "").toUpperCase())) {
      byName.set(name, r);
    }
  }
  return advanced.map((row) => {
    const hit =
      byKey.get(`${row.n.toLowerCase()}|${row.t}`) ??
      byName.get(row.n.toLowerCase());
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
/** Seasons re-fetched to pick up TOT/2TM — also refresh per-poss ratings. */
const refreshedForTot = new Set();

for (const start of ADV_START_YEARS) {
  const canonical = canonicalSeason(start);
  const existing = seasons[canonical]?.advanced;
  const staleSplits = hasMultiTeamDuplicates(existing);
  if (existing?.length && !advancedNeedsRates(existing) && !staleSplits) {
    console.log(
      `[bref-snapshot] ${canonical} advanced cached (${existing.length})`
    );
    continue;
  }
  const year = brefYear(canonical);
  process.stdout.write(
    `[bref-snapshot] ${canonical} advanced${staleSplits ? " (collapse TOT)" : ""}… `
  );
  try {
    const html = await fetchHtml(
      `https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`
    );
    const advanced = collapseToSeasonGrain(
      dedupeByPlayerTeam(parseTable(html, mapAdvanced, { includeCombined: true }))
    );
    // Preserve ortg/drtg / espn ids if we already merged them.
    const prevByKey = new Map(
      (existing ?? []).map((r) => [`${r.n.toLowerCase()}|${r.t}`, r])
    );
    const prevByName = new Map(
      (existing ?? []).map((r) => [String(r.n).toLowerCase(), r])
    );
    const merged = advanced.map((row) => {
      const prev =
        prevByKey.get(`${row.n.toLowerCase()}|${row.t}`) ??
        prevByName.get(row.n.toLowerCase());
      if (!prev) return row;
      return {
        ...row,
        ...(prev.ortg != null ? { ortg: prev.ortg } : {}),
        ...(prev.drtg != null ? { drtg: prev.drtg } : {}),
        ...(prev.e ? { e: prev.e } : {}),
      };
    });
    seasons[canonical] = { ...(seasons[canonical] ?? {}), advanced: merged };
    if (staleSplits) refreshedForTot.add(canonical);
    console.log(merged.length);
  } catch (error) {
    console.log(`FAIL ${error instanceof Error ? error.message : error}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

for (const start of PG_START_YEARS) {
  const canonical = canonicalSeason(start);
  const existing = seasons[canonical]?.perGame;
  const staleSplits = hasMultiTeamDuplicates(existing);
  if (existing?.length && !perGameNeedsCounting(existing) && !staleSplits) {
    console.log(
      `[bref-snapshot] ${canonical} per-game cached (${existing.length})`
    );
    continue;
  }
  const year = brefYear(canonical);
  process.stdout.write(
    `[bref-snapshot] ${canonical} per-game${staleSplits ? " (collapse TOT)" : ""}… `
  );
  try {
    const html = await fetchHtml(
      `https://www.basketball-reference.com/leagues/NBA_${year}_per_game.html`
    );
    const perGame = collapseToSeasonGrain(
      dedupeByPlayerTeam(parseTable(html, mapPerGame, { includeCombined: true }))
    );
    const prevByKey = new Map(
      (existing ?? []).map((r) => [`${r.n.toLowerCase()}|${r.t}`, r])
    );
    const prevByName = new Map(
      (existing ?? []).map((r) => [String(r.n).toLowerCase(), r])
    );
    const merged = perGame.map((row) => {
      const prev =
        prevByKey.get(`${row.n.toLowerCase()}|${row.t}`) ??
        prevByName.get(row.n.toLowerCase());
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
  const forceTotRatings = refreshedForTot.has(canonical);
  if (
    existing?.length &&
    !advancedNeedsRatings(existing) &&
    !forceTotRatings
  ) {
    console.log(`[bref-snapshot] ${canonical} ratings cached`);
    continue;
  }
  if (!existing?.length) continue;
  const year = brefYear(canonical);
  process.stdout.write(
    `[bref-snapshot] ${canonical} per-poss${forceTotRatings ? " (TOT)" : ""}… `
  );
  try {
    const html = await fetchHtml(
      `https://www.basketball-reference.com/leagues/NBA_${year}_per_poss.html`
    );
    const ratings = collapseToSeasonGrain(
      dedupeByPlayerTeam(parseTable(html, mapPerPoss, { includeCombined: true }))
    );
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

// Last-resort collapse if a fetch failed mid-run (e.g. BRef 429) and stints remain.
for (const block of Object.values(seasons)) {
  if (block?.advanced?.length) {
    block.advanced = collapseToSeasonGrain(dedupeByPlayerTeam(block.advanced));
  }
  if (block?.perGame?.length) {
    block.perGame = collapseToSeasonGrain(dedupeByPlayerTeam(block.perGame));
  }
}

const payload = {
  version: SNAPSHOT_VERSION,
  generatedAt: new Date().toISOString(),
  seasons: Object.fromEntries(
    Object.entries(seasons).filter(([canonical]) => {
      if (keepSeasons.has(canonical)) return true;
      // Daily / incremental runs: retain historical seasons already on disk.
      return (
        PRESERVE_OUTSIDE_WINDOW && previous.seasons?.[canonical] != null
      );
    })
  ),
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
console.log(
  `[bref-snapshot] wrote ${Object.keys(payload.seasons).length} seasons → ${OUT} (gzip ~${gz} bytes)`
);
