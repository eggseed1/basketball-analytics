/**
 * Bake ESPN player game logs into public/ for Cloudflare Static Assets.
 * Live ESPN gamelog is flaky/slow from Workers; splits/highs/games need this.
 *
 * Output: public/runtime/player-game-logs/{season}/{nbaPlayerId}.json
 *
 *   node scripts/build-runtime-player-game-logs.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "public", "runtime", "player-game-logs");
const BREF = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "bref-advanced-snapshot.json"
);
const ALIASES = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "player-id-aliases-snapshot.json"
);

const FORCE = process.env.FORCE === "1";
/** Re-fetch files that have points but zero rebounds (broken older bakes). */
const REPAIR_ZERO_REB = process.env.REPAIR_ZERO_REB === "1" || FORCE;
/**
 * Rewrite seasonType in place when playoffs-tagged games fall in the
 * regular-season calendar window (ESPN seasontype=3 fallback bug).
 */
const REPAIR_SEASON_TYPE = process.env.REPAIR_SEASON_TYPE === "1";
const MIN_GP = Number(process.env.GAMELOG_MIN_GP || 15);
const CONCURRENCY = Number(process.env.GAMELOG_CONCURRENCY || 6);
/** Limit to these seasons (comma-separated). Empty = BRef window. */
const SEASON_FILTER = String(process.env.GAMELOG_SEASONS || "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => /^\d{4}-\d{2}$/.test(s));
/** 0 = all seasons present in the BRef snapshot (full CF career coverage). */
const SEASON_LIMIT = Number(process.env.GAMELOG_SEASON_LIMIT || 0);
const SITE =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function seasonsFromBref(bref, limit) {
  let seasons = Object.keys(bref.seasons || {})
    .filter((season) => (bref.seasons[season]?.advanced || []).length > 0)
    .sort((a, b) => b.localeCompare(a));
  if (SEASON_FILTER.length) {
    const want = new Set(SEASON_FILTER);
    seasons = seasons.filter((season) => want.has(season));
  }
  if (Number.isFinite(limit) && limit > 0) return seasons.slice(0, limit);
  return seasons;
}

function needsReboundRepair(dest) {
  if (!REPAIR_ZERO_REB || !existsSync(dest)) return false;
  try {
    const raw = JSON.parse(
      // sync read is fine in repair gate
      require("node:fs").readFileSync(dest, "utf8")
    );
    const games = Array.isArray(raw?.games) ? raw.games : [];
    if (!games.length) return false;
    let pts = 0;
    let reb = 0;
    let fga = 0;
    for (const g of games) {
      pts += Number(g.points || 0);
      reb += Number(g.rebounds || 0);
      fga += Number(g.fga || 0);
    }
    return pts > 0 && (reb === 0 || fga === 0);
  } catch {
    return true;
  }
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKeys(name) {
  const n = normalizeName(name);
  if (!n) return [];
  const stripped = n
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped && stripped !== n ? [n, stripped] : [n];
}

function espnYear(season) {
  const start = Number(String(season).slice(0, 4));
  return Number.isFinite(start) ? start + 1 : null;
}

function num(stats, names, key) {
  const i = names.indexOf(key);
  if (i < 0) return 0;
  const v = Number(stats?.[i]);
  return Number.isFinite(v) ? v : 0;
}

/** ESPN packs made-attempted as "8-21" under a combined name. */
function pair(stats, names, key) {
  const i = names.indexOf(key);
  if (i < 0) return { made: 0, att: 0 };
  const raw = String(stats?.[i] ?? "");
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(raw);
  if (!m) return { made: 0, att: 0 };
  return { made: Number(m[1]) || 0, att: Number(m[2]) || 0 };
}

function parseMinutes(stats, names) {
  const raw = stats?.[names.indexOf("minutes")] ?? stats?.[names.indexOf("MIN")];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "");
  if (!s || s === "-") return 0;
  if (s.includes(":")) {
    const [m, sec] = s.split(":").map(Number);
    return (m || 0) + (sec || 0) / 60;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function compactFromEspn(entry, meta, names, season, teamId) {
  const stats = entry.stats ?? meta.stats ?? [];
  const minutesNum = parseMinutes(stats, names);
  const isHome = Boolean(meta?.atVs === "vs" || meta?.homeAway === "home");
  const opp =
    meta?.opponent?.abbreviation ||
    meta?.opponentAthlete?.abbreviation ||
    meta?.opponentAbbreviation ||
    "OPP";
  const resultRaw = String(meta?.gameResult ?? meta?.result ?? "");
  const result = /^W/i.test(resultRaw) ? "W" : /^L/i.test(resultRaw) ? "L" : "—";
  const fg = pair(stats, names, "fieldGoalsMade-fieldGoalsAttempted");
  const tp = pair(
    stats,
    names,
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted"
  );
  const ft = pair(stats, names, "freeThrowsMade-freeThrowsAttempted");
  return {
    gameId: String(entry.eventId ?? meta.id ?? ""),
    season,
    date: String(meta?.gameDate ?? meta?.date ?? "").slice(0, 10),
    teamNbaId: String(teamId ?? meta?.team?.id ?? ""),
    opponentNbaId: String(meta?.opponent?.id ?? ""),
    teamAbbr: String(meta?.team?.abbreviation ?? ""),
    opponentAbbr: String(opp).slice(0, 4),
    homeAway: isHome ? "home" : "away",
    result,
    starter: null,
    minutes: minutesNum > 0 ? minutesNum.toFixed(1) : null,
    minutesNum,
    points: num(stats, names, "points") || num(stats, names, "PTS"),
    rebounds:
      num(stats, names, "totalRebounds") ||
      num(stats, names, "rebounds") ||
      num(stats, names, "REB") ||
      num(stats, names, "offensiveRebounds") +
        num(stats, names, "defensiveRebounds"),
    assists: num(stats, names, "assists") || num(stats, names, "AST"),
    steals: num(stats, names, "steals") || num(stats, names, "STL"),
    blocks: num(stats, names, "blocks") || num(stats, names, "BLK"),
    turnovers: num(stats, names, "turnovers") || num(stats, names, "TO"),
    fgm: fg.made || num(stats, names, "fieldGoalsMade") || num(stats, names, "FGM"),
    fga: fg.att || num(stats, names, "fieldGoalsAttempted") || num(stats, names, "FGA"),
    threePm:
      tp.made ||
      num(stats, names, "threePointFieldGoalsMade") ||
      num(stats, names, "3PM"),
    threePa:
      tp.att ||
      num(stats, names, "threePointFieldGoalsAttempted") ||
      num(stats, names, "3PA"),
    ftm: ft.made || num(stats, names, "freeThrowsMade") || num(stats, names, "FTM"),
    fta: ft.att || num(stats, names, "freeThrowsAttempted") || num(stats, names, "FTA"),
    orb: names.includes("offensiveRebounds") || names.includes("OREB")
      ? num(stats, names, "offensiveRebounds") || num(stats, names, "OREB")
      : null,
    drb: names.includes("defensiveRebounds") || names.includes("DREB")
      ? num(stats, names, "defensiveRebounds") || num(stats, names, "DREB")
      : null,
    pf: num(stats, names, "fouls") || num(stats, names, "PF") || null,
    plusMinus: num(stats, names, "plusMinus"),
    seasonType: "regular",
  };
}

function seasonTypeFromBlockName(displayName, fallback) {
  const label = String(displayName ?? "");
  if (/postseason|playoffs?/i.test(label)) return "playoffs";
  if (/regular season/i.test(label)) return "regular";
  if (/preseason/i.test(label)) return "preseason";
  return fallback;
}

/**
 * ESPN seasontype=3 responses sometimes omit a Postseason block and dump the
 * full seasonTypes list instead. Never fall back to unrelated blocks — that
 * used to overwrite regular-season rows as playoffs in the merge step.
 */
async function fetchEspnLog(espnId, season, seasonType) {
  const year = espnYear(season);
  if (!year) return [];
  const url =
    `${SITE}/${encodeURIComponent(espnId)}/gamelog` +
    `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=${seasonType}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  const names = payload.names ?? [];
  const metadata = payload.events ?? {};
  const wanted =
    seasonType === 2 ? /regular season/i : /postseason|playoffs?/i;
  const fallbackType = seasonType === 3 ? "playoffs" : "regular";
  const blocks = (payload.seasonTypes ?? []).filter((block) =>
    wanted.test(block.displayName ?? "")
  );
  const rows = [];
  for (const block of blocks) {
    const blockType = seasonTypeFromBlockName(
      block.displayName,
      fallbackType
    );
    for (const category of block.categories ?? []) {
      const entries = Array.isArray(category.events) ? category.events : [];
      for (const entry of entries) {
        if (!entry?.eventId) continue;
        const meta = metadata[entry.eventId] ?? { id: entry.eventId };
        const row = compactFromEspn(entry, meta, names, season, "");
        if (!row.gameId || !row.date) continue;
        row.seasonType = blockType;
        rows.push(row);
      }
    }
  }
  return rows;
}

/** Calendar repair for the seasontype=3 fallback mis-tag (Oct–early Apr). */
function inferredSeasonType(date, current) {
  const stamp = String(date ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stamp);
  if (!m) return current;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const inRegularWindow =
    month >= 10 || month <= 3 || (month === 4 && day < 15);
  if (current === "playoffs" && inRegularWindow) return "regular";
  return current;
}

async function repairSeasonTypesOnDisk(seasons) {
  let repairedFiles = 0;
  let repairedGames = 0;
  for (const season of seasons) {
    const seasonDir = path.join(OUT_ROOT, season);
    let names = [];
    try {
      names = await fs.readdir(seasonDir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const dest = path.join(seasonDir, name);
      let payload;
      try {
        payload = JSON.parse(await fs.readFile(dest, "utf8"));
      } catch {
        continue;
      }
      const games = Array.isArray(payload?.games) ? payload.games : [];
      if (!games.length) continue;
      let changed = 0;
      for (const game of games) {
        const next = inferredSeasonType(game.date, game.seasonType);
        if (next !== game.seasonType) {
          game.seasonType = next;
          changed += 1;
        }
      }
      if (!changed) continue;
      payload.games = games;
      payload.seasonTypeRepairedAt = new Date().toISOString();
      await fs.writeFile(dest, JSON.stringify(payload));
      repairedFiles += 1;
      repairedGames += changed;
    }
  }
  console.log(
    `[player-game-logs] seasonType repair files=${repairedFiles} games=${repairedGames}`
  );
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

const bref = JSON.parse(await fs.readFile(BREF, "utf8"));
const aliasFile = JSON.parse(await fs.readFile(ALIASES, "utf8"));
const nbaByEspn = new Map();
const nbaByName = new Map();
const espnByName = new Map();
for (const a of aliasFile.aliases || []) {
  if (!a?.nbaPlayerId || !a?.playerName) continue;
  const nbaId = String(a.nbaPlayerId);
  const espnId = a.espnPlayerId ? String(a.espnPlayerId) : null;
  if (espnId) nbaByEspn.set(espnId, nbaId);
  for (const key of nameKeys(a.playerName)) {
    if (!nbaByName.has(key)) nbaByName.set(key, nbaId);
    if (espnId && !espnByName.has(key)) espnByName.set(key, espnId);
  }
}

const seasons = seasonsFromBref(bref, SEASON_LIMIT);

if (REPAIR_SEASON_TYPE) {
  await repairSeasonTypesOnDisk(seasons);
  process.exit(0);
}

let written = 0;
let skipped = 0;
let failed = 0;

for (const season of seasons) {
  const advanced = bref.seasons[season].advanced || [];
  const targets = [];
  const seen = new Set();
  for (const row of advanced) {
    if ((row.gp ?? 0) < MIN_GP) continue;
    const keys = nameKeys(row.n);
    const espnId =
      (row.e ? String(row.e) : null) ||
      keys.map((k) => espnByName.get(k)).find(Boolean) ||
      null;
    if (!espnId) continue; // ESPN gamelog requires ESPN athlete id
    const nbaId =
      nbaByEspn.get(espnId) ||
      keys.map((k) => nbaByName.get(k)).find(Boolean) ||
      espnId;
    if (seen.has(nbaId)) continue;
    seen.add(nbaId);
    targets.push({ nbaId, espnId, name: row.n, gp: row.gp });
  }

  const seasonDir = path.join(OUT_ROOT, season);
  await fs.mkdir(seasonDir, { recursive: true });
  console.log(
    `[player-game-logs] ${season}: ${targets.length} players (gp>=${MIN_GP})`
  );

  await mapPool(targets, CONCURRENCY, async (target) => {
    const dest = path.join(seasonDir, `${target.nbaId}.json`);
    const repair = needsReboundRepair(dest);
    if (!FORCE && existsSync(dest) && !repair) {
      skipped += 1;
      return;
    }
    try {
      const [reg, po] = await Promise.all([
        fetchEspnLog(target.espnId, season, 2),
        fetchEspnLog(target.espnId, season, 3).catch(() => []),
      ]);
      const byId = new Map();
      // Prefer regular-season rows when both fetches share a gameId — the
      // playoffs request historically fell back to the full season dump.
      for (const row of [...po, ...reg]) {
        if (row.gameId) byId.set(row.gameId, row);
      }
      const games = [...byId.values()].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      if (!games.length) {
        failed += 1;
        return;
      }
      const payload = {
        playerId: target.nbaId,
        espnId: target.espnId,
        season,
        games,
        generatedAt: new Date().toISOString(),
        source: "espn/gamelog",
      };
      await fs.writeFile(dest, JSON.stringify(payload));
      // Also alias by ESPN id for route ids that are ESPN athletes.
      await fs.writeFile(
        path.join(seasonDir, `${target.espnId}.json`),
        JSON.stringify(payload)
      );
      written += 1;
      if (written % 25 === 0) {
        console.log(
          `[player-game-logs] wrote ${written}…${repair ? " (repair)" : ""}`
        );
      }
    } catch (error) {
      failed += 1;
      if (failed <= 8) {
        console.warn(
          `[player-game-logs] fail ${target.name} ${season}: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
      // Soft backoff when ESPN rate-limits.
      if (/429|HTTP 429/i.test(String(error))) {
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  });
}

await fs.mkdir(OUT_ROOT, { recursive: true });

const seasonCounts = {};
for (const season of seasons) {
  try {
    const dir = path.join(OUT_ROOT, season);
    const names = await fs.readdir(dir);
    // Count NBA-id files only (skip espn duplicate aliases when possible).
    seasonCounts[season] = names.filter((name) => name.endsWith(".json")).length;
  } catch {
    seasonCounts[season] = 0;
  }
}
const usableSeasons = Object.entries(seasonCounts)
  .filter(([, count]) => Number(count) >= 25)
  .map(([season]) => season)
  .sort((a, b) => b.localeCompare(a));

await fs.writeFile(
  path.join(OUT_ROOT, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      seasons,
      seasonCounts,
      usableSeasons,
      written,
      skipped,
      failed,
      minGp: MIN_GP,
    },
    null,
    2
  )
);

// Always reclassify calendar-window games mis-tagged as playoffs.
await repairSeasonTypesOnDisk(Object.keys(seasonCounts));

console.log(
  `[player-game-logs] done written=${written} skipped=${skipped} failed=${failed} → ${OUT_ROOT}`
);
