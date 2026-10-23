/**
 * Copy Cloudflare-safe product assets onto the Next module graph.
 * Workers cannot read process.cwd()/data via node:fs.
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const RUNTIME = path.join(ROOT, "src", "data", "runtime");

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

/**
 * Legend HOF seeds are authoritative for their ESPN + NBA ids.
 * Replace stale seeds (including wrong espnPlayerId === nbaPlayerId rows).
 */
function mergeLegendAliases(baseAliases, legendRows) {
  const rows = Array.isArray(legendRows) ? legendRows : [];
  if (rows.length === 0) {
    return { aliases: Array.isArray(baseAliases) ? [...baseAliases] : [], added: 0 };
  }
  const legendNba = new Set(
    rows.map((row) => String(row.nbaPlayerId ?? "").trim()).filter(Boolean)
  );
  const legendEspn = new Set(
    rows.map((row) => String(row.espnPlayerId ?? "").trim()).filter(Boolean)
  );
  const aliases = (Array.isArray(baseAliases) ? baseAliases : []).filter((row) => {
    const nba = String(row.nbaPlayerId ?? "").trim();
    const espn = String(row.espnPlayerId ?? "").trim();
    return !(legendNba.has(nba) || legendEspn.has(espn));
  });
  for (const row of rows) {
    aliases.push(row);
  }
  return { aliases, added: rows.length };
}

await fs.mkdir(RUNTIME, { recursive: true });

const sentimentSrc = path.join(ROOT, "data", "sentiment", "v1", "snapshot.json");
const sentimentDest = path.join(RUNTIME, "sentiment-snapshot.json");
try {
  await fs.copyFile(sentimentSrc, sentimentDest);
  console.log(`[cf-assets] sentiment → ${sentimentDest}`);
} catch (error) {
  console.warn(
    `[cf-assets] sentiment copy skipped: ${
      error instanceof Error ? error.message : error
    }`
  );
}

const aliasPath = path.join(ROOT, "data", "impact", "player-id-aliases.json");
const legendAliasPath = path.join(
  ROOT,
  "data",
  "impact",
  "legend-player-aliases.json"
);
try {
  const raw = JSON.parse(await fs.readFile(aliasPath, "utf8"));
  let aliases = Array.isArray(raw.aliases) ? raw.aliases : [];
  try {
    const legend = JSON.parse(await fs.readFile(legendAliasPath, "utf8"));
    const merged = mergeLegendAliases(aliases, legend.aliases);
    aliases = merged.aliases;
    if (merged.added) {
      console.log(`[cf-assets] merged ${merged.added} legend aliases into name index`);
    }
  } catch {
    /* optional */
  }
  const byName = {};
  for (const row of aliases) {
    if (!row?.espnPlayerId || !row?.playerName) continue;
    for (const key of nameKeys(row.playerName)) {
      if (!byName[key]) byName[key] = String(row.espnPlayerId);
    }
  }
  const dest = path.join(RUNTIME, "espn-name-index.json");
  await fs.writeFile(
    dest,
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), byName })
  );
  console.log(
    `[cf-assets] espn-name-index → ${dest} (${Object.keys(byName).length} keys)`
  );
} catch (error) {
  console.warn(
    `[cf-assets] espn-name-index skipped: ${
      error instanceof Error ? error.message : error
    }`
  );
}

// Season rows carry ESPN ids from scripts/build-season-tables.ts, which settles
// father/son name clashes by NBA person id. Don't re-match them by name here.
try {
  const snap = JSON.parse(
    await fs.readFile(path.join(RUNTIME, "season-tables-snapshot.json"), "utf8")
  );

  /** Slim header-search index — keeps /api/players/search off the 10MB BRef module. */
  function normName(name) {
    return String(name ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  const byKey = new Map();
  const seasonKeys = Object.keys(snap.seasons ?? {}).sort((a, b) =>
    b.localeCompare(a)
  );
  const earliestSeason = new Map();
  for (const season of seasonKeys) {
    for (const adv of snap.seasons[season]?.advanced ?? []) {
      if (adv.p != null) earliestSeason.set(String(adv.p), season);
    }
  }
  const firstTableSeason = seasonKeys.at(-1);
  for (const season of seasonKeys) {
    const advanced = snap.seasons[season]?.advanced ?? [];
    const perGame = snap.seasons[season]?.perGame ?? [];
    const pgByKey = new Map(
      perGame.map((r) => [`${String(r.n).toLowerCase()}|${r.t}`, r])
    );
    for (const adv of advanced) {
      const pg = pgByKey.get(`${String(adv.n).toLowerCase()}|${adv.t}`);
      const espnId = String(adv.e || pg?.e || "").trim();
      const nameKey = normName(adv.n);
      const dedupe = espnId || (adv.p != null ? `nba:${adv.p}` : nameKey);
      if (!dedupe || byKey.has(dedupe)) continue;
      const gp = Math.max(1, Number(adv.gp) || Number(pg?.gp) || 0);
      const mpg =
        Number(pg?.mp) ||
        (Number(adv.mp) > 0 && Number(adv.gp) > 0
          ? Number(adv.mp) / Number(adv.gp)
          : 0);
      // Row: [id, name, team, lastSeason, minutes, firstSeason?]
      const row = [
        espnId || `bref:${nameKey}`,
        String(adv.n),
        String(adv.t || ""),
        season,
        Math.round(mpg * gp),
      ];
      // A career that shows up in the first table season may have started earlier.
      const first = earliestSeason.get(String(adv.p));
      if (first && first !== firstTableSeason) row[5] = first;
      byKey.set(dedupe, row);
    }
  }

  // All-era rows (Russell, Cousy, Wilt, …) and first seasons came from an earlier
  // Basketball-Reference index pull, frozen in player-search-frozen.json. Never refetch them.
  const endYear = (season) => Number(String(season).slice(0, 4)) + 1;
  const searchDest = path.join(RUNTIME, "player-search-snapshot.json");
  const previous = JSON.parse(
    await fs.readFile(path.join(RUNTIME, "player-search-frozen.json"), "utf8")
  );
  // NBA and Basketball-Reference disagree on suffixes ("Marcus Morris Sr." / "Marcus Morris").
  const baseName = (name) =>
    normName(name).replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
  const previousById = new Map();
  const previousByName = new Map();
  for (const row of previous.players) {
    if (!row?.[5]) continue;
    previousById.set(String(row[0]), row);
    const key = baseName(row[1]);
    previousByName.set(key, [...(previousByName.get(key) ?? []), row]);
  }
  const claimed = new Set();
  const current = [...byKey.values()];
  const claim = (row, match) => {
    claimed.add(match);
    row[5] = match[5];
    // Keep bref:{slug} ids so legend player pages resolve (Jordan, Barkley, …).
    const curId = String(row[0]);
    if (
      curId.toLowerCase().startsWith("bref:") &&
      !/^[a-z]{3,12}\d{2}$/i.test(curId.slice(5)) &&
      /^bref:[a-z]{3,12}\d{2}$/i.test(String(match[0]))
    ) {
      row[0] = match[0];
    }
  };
  const unmatched = [];
  for (const row of current) {
    const match = previousById.get(String(row[0]));
    if (match && !claimed.has(match)) claim(row, match);
    else unmatched.push(row);
  }
  // Same name is not the same player (Tim Hardaway / Tim Hardaway Jr.):
  // join by name only when careers end together.
  const renamed = [];
  for (const row of unmatched) {
    const match = (previousByName.get(baseName(row[1])) ?? [])
      .filter((prev) => !claimed.has(prev) && Math.abs(endYear(prev[3]) - endYear(row[3])) <= 1)
      .sort((a, b) => Math.abs(endYear(a[3]) - endYear(row[3])) - Math.abs(endYear(b[3]) - endYear(row[3])))[0];
    if (match) claim(row, match);
    else renamed.push(row);
  }
  // Spelled differently ("Ha Ha" / "Ha Seung-Jin"): same last season, team and minutes.
  for (const row of renamed) {
    const candidates = previous.players.filter(
      (prev) =>
        prev?.[5] &&
        !claimed.has(prev) &&
        prev[3] === row[3] &&
        prev[2] === row[2] &&
        Math.abs(Number(prev[4]) - Number(row[4])) <= 10
    );
    if (candidates.length === 1) claim(row, candidates[0]);
  }
  const usedIds = new Set(current.map((row) => String(row[0])));
  let allEraAdded = 0;
  let unclaimedModern = 0;
  for (const row of previous.players) {
    if (!row?.[5] || claimed.has(row) || usedIds.has(String(row[0]))) continue;
    // Careers that reached the season tables are already listed under NBA's name.
    if (String(row[3]) >= firstTableSeason) {
      unclaimedModern += 1;
      continue;
    }
    usedIds.add(String(row[0]));
    byKey.set(`carried:${row[0]}`, row);
    allEraAdded += 1;
  }
  if (unclaimedModern) {
    console.warn(`[cf-assets] ${unclaimedModern} earlier search rows had no season-table match`);
  }

  const players = [...byKey.values()];
  await fs.writeFile(
    searchDest,
    JSON.stringify({
      version: 2,
      generatedAt: new Date().toISOString(),
      players,
    })
  );
  const searchPublic = path.join(
    ROOT,
    "public",
    "runtime",
    "player-search-snapshot.json"
  );
  await fs.mkdir(path.dirname(searchPublic), { recursive: true });
  await fs.copyFile(searchDest, searchPublic);
  console.log(
    `[cf-assets] player-search-snapshot → ${searchPublic} (${players.length} players, +${allEraAdded} all-era; src mirror ${searchDest})`
  );
} catch (error) {
  console.warn(
    `[cf-assets] bref espn bake skipped: ${
      error instanceof Error ? error.message : error
    }`
  );
}

/** Bundle ESPN↔NBA aliases (identity resolve) — node:fs is empty on Workers. */
try {
  const src = path.join(ROOT, "data", "impact", "player-id-aliases.json");
  const dest = path.join(RUNTIME, "player-id-aliases-snapshot.json");
  const raw = JSON.parse(await fs.readFile(src, "utf8"));
  let aliases = Array.isArray(raw.aliases) ? [...raw.aliases] : [];
  try {
    const legend = JSON.parse(await fs.readFile(legendAliasPath, "utf8"));
    const merged = mergeLegendAliases(aliases, legend.aliases);
    aliases = merged.aliases;
    if (merged.added) {
      console.log(
        `[cf-assets] merged ${merged.added} legend aliases into identity snapshot`
      );
    }
  } catch {
    /* optional */
  }
  const body = JSON.stringify({
    ...raw,
    aliases,
    legendMergedAt: new Date().toISOString(),
  });
  await fs.writeFile(dest, body);
  const destPublic = path.join(ROOT, "public", "runtime", "player-id-aliases-snapshot.json");
  await fs.mkdir(path.dirname(destPublic), { recursive: true });
  await fs.writeFile(destPublic, body);
  console.log(
    `[cf-assets] player-id-aliases → ${destPublic} (${aliases.length} rows; src mirror ${dest})`
  );
} catch (error) {
  console.warn(
    `[cf-assets] player-id-aliases skipped: ${
      error instanceof Error ? error.message : error
    }`
  );
}

/** Keep runtime legend seed in sync for Workers imports. */
try {
  const src = path.join(ROOT, "data", "impact", "legend-player-aliases.json");
  const dest = path.join(RUNTIME, "legend-player-aliases.json");
  await fs.copyFile(src, dest);
  console.log(`[cf-assets] legend-player-aliases → ${dest}`);
} catch (error) {
  console.warn(
    `[cf-assets] legend-player-aliases skipped: ${
      error instanceof Error ? error.message : error
    }`
  );
}
