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
let nameIndexByName = {};
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
  nameIndexByName = byName;
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

/** Bake ESPN athlete ids onto BRef rows so peer boards skip runtime name scans. */
try {
  const brefPath = path.join(RUNTIME, "bref-advanced-snapshot.json");
  const snap = JSON.parse(await fs.readFile(brefPath, "utf8"));
  let hit = 0;
  let miss = 0;
  for (const block of Object.values(snap.seasons ?? {})) {
    for (const key of ["advanced", "perGame"]) {
      const rows = block?.[key];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        let id = null;
        for (const k of nameKeys(row?.n)) {
          if (nameIndexByName[k]) {
            id = nameIndexByName[k];
            break;
          }
        }
        if (id) {
          row.e = id;
          hit += 1;
        } else {
          delete row.e;
          miss += 1;
        }
      }
    }
  }
  await fs.writeFile(brefPath, JSON.stringify(snap));
  console.log(`[cf-assets] bref espn ids baked (hit=${hit} miss=${miss})`);

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
  /** BRef year_max 1969 → canonical 1968-69. */
  function seasonFromEndYear(year) {
    const y = Number(year);
    if (!Number.isFinite(y) || y < 1947 || y > 2100) return null;
    return `${y - 1}-${String(y).slice(2)}`;
  }
  const byKey = new Map();
  const seasonKeys = Object.keys(snap.seasons ?? {}).sort((a, b) =>
    b.localeCompare(a)
  );
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
      const dedupe = espnId || nameKey;
      if (!dedupe || byKey.has(dedupe)) continue;
      const gp = Math.max(1, Number(adv.gp) || Number(pg?.gp) || 0);
      const mpg =
        Number(pg?.mp) ||
        (Number(adv.mp) > 0 && Number(adv.gp) > 0
          ? Number(adv.mp) / Number(adv.gp)
          : 0);
      // Row: [id, name, team, lastSeason, minutes, firstSeason?]
      byKey.set(dedupe, [
        espnId || (nameIndexByName[nameKey] ?? `bref:${nameKey}`),
        String(adv.n),
        String(adv.t || ""),
        season,
        Math.round(mpg * gp),
      ]);
    }
  }

  // All-era BRef letter index so legends (Russell, Cousy, Wilt, …) are searchable
  // even when they predate the modern advanced-board bake window.
  const BREF_UA =
    "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)";
  let allEraAdded = 0;
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  for (const letter of letters) {
    try {
      const url = `https://www.basketball-reference.com/players/${letter}/`;
      const res = await fetch(url, {
        headers: { Accept: "text/html", "User-Agent": BREF_UA },
      });
      if (!res.ok) {
        console.warn(`[cf-assets] bref index ${letter}/ HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const rowRe =
        /data-append-csv="([^"]+)"[\s\S]*?href="\/players\/[^"]+"[^>]*>([^<]+)<\/a>[\s\S]*?data-stat="year_min"\s*>\s*(\d{4})[\s\S]*?data-stat="year_max"\s*>\s*(\d{4})/gi;
      let match;
      while ((match = rowRe.exec(html)) !== null) {
        const slug = String(match[1] ?? "")
          .trim()
          .toLowerCase();
        const name = String(match[2] ?? "")
          .replace(/\*/g, "")
          .trim();
        const first = seasonFromEndYear(match[3]);
        const last = seasonFromEndYear(match[4]);
        if (!slug || !name || !last) continue;
        const nameKey = normName(name);
        const espnId = nameIndexByName[nameKey] ?? "";
        const dedupe = espnId || nameKey || slug;
        if (!dedupe) continue;
        if (byKey.has(dedupe)) {
          // Keep modern board row; backfill firstSeason when missing.
          const existing = byKey.get(dedupe);
          if (existing && !existing[5] && first) existing[5] = first;
          // Upgrade name-shaped bref: ids to bref:{slug} so player pages can
          // scrape the full career (Jordan/Barkley/etc. are not ESPN-linked).
          const curId = String(existing?.[0] ?? "");
          if (
            existing &&
            curId.toLowerCase().startsWith("bref:") &&
            !/^[a-z]{3,12}\d{2}$/i.test(curId.slice(curId.indexOf(":") + 1))
          ) {
            existing[0] = espnId || `bref:${slug}`;
          }
          continue;
        }
        byKey.set(dedupe, [
          espnId || `bref:${slug}`,
          name,
          "",
          last,
          0,
          first || last,
        ]);
        allEraAdded += 1;
      }
      await new Promise((r) => setTimeout(r, 700));
    } catch (error) {
      console.warn(
        `[cf-assets] bref index ${letter}/ skipped: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  const searchDest = path.join(RUNTIME, "player-search-snapshot.json");
  const players = [...byKey.values()];
  await fs.writeFile(
    searchDest,
    JSON.stringify({
      version: 2,
      generatedAt: new Date().toISOString(),
      players,
    })
  );
  console.log(
    `[cf-assets] player-search-snapshot → ${searchDest} (${players.length} players, +${allEraAdded} all-era)`
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
  await fs.writeFile(
    dest,
    JSON.stringify({
      ...raw,
      aliases,
      legendMergedAt: new Date().toISOString(),
    })
  );
  console.log(`[cf-assets] player-id-aliases → ${dest} (${aliases.length} rows)`);
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
