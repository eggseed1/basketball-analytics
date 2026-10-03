/**
 * Bake Basketball-Reference career tables for pre-1996-97 players.
 *
 * Workers cannot fetch BRef player pages at request time, so legends
 * (Cousy, Russell, Wilt, …) had empty careers in production. This script
 * downloads each page once at BRef's rate limit, caches the parsed result in
 * data/cache/bref-players/, and writes compact shards to
 * public/runtime/legend-careers/{letter}.json.
 *
 *   npx tsx scripts/build-legend-careers.ts            # fetch missing, then emit
 *   npx tsx scripts/build-legend-careers.ts --emit     # emit shards from cache only
 *   npx tsx scripts/build-legend-careers.ts --limit 50 # fetch at most 50 pages
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseBrefPlayerHtml,
  type BrefCountingRow,
  type BrefPlayerAdvancedRow,
} from "../src/data/providers/nba/bref-player-page";

const ROOT = process.cwd();
const SEARCH = path.join(ROOT, "src/data/runtime/player-search-snapshot.json");
const AWARDS = path.join(ROOT, "src/data/runtime/player-awards-snapshot.json");
const CACHE_DIR = path.join(ROOT, "data/cache/bref-players");
/** Static assets, not the Worker bundle (which sits near its 10 MB cap). */
const OUT_DIR = path.join(ROOT, "public/runtime/legend-careers");
const MODERN_FIRST_SEASON = "1996-97";
const UA = "Mozilla/5.0 (compatible; BasketballAnalytics/legend-careers; educational)";
/** BRef allows 20 requests a minute; stay under it. */
const DELAY_MS = 3500;
const JAIL_WAIT_MS = 15 * 60 * 1000;

type CachedPage =
  | { slug: string; missing: true }
  | {
      slug: string;
      bio: ReturnType<typeof parseBrefPlayerHtml>["bio"];
      totals: BrefCountingRow[];
      advanced: BrefPlayerAdvancedRow[];
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function legendSlugs(): Promise<string[]> {
  const snap = JSON.parse(await fs.readFile(SEARCH, "utf8")) as {
    players: [string, string, string, string, number, string?][];
  };
  // Search rows keyed by ESPN id (Bird, Jordan, …) carry no slug; the awards
  // bake maps their names to BRef slugs.
  const awards = JSON.parse(await fs.readFile(AWARDS, "utf8")) as {
    names?: Record<string, string>;
    slugs?: Record<string, string>;
  };
  const slugByName = new Map<string, string>();
  for (const [nbaId, name] of Object.entries(awards.names ?? {})) {
    const slug = awards.slugs?.[nbaId];
    if (slug) slugByName.set(name.toLowerCase(), slug);
  }
  const slugs = new Set<string>();
  for (const row of snap.players) {
    if ((row[5] || row[3]) >= MODERN_FIRST_SEASON) continue;
    const m = /^bref:([a-z]{3,12}\d{2})$/.exec(String(row[0]));
    const slug = m?.[1] ?? slugByName.get(String(row[1]).toLowerCase());
    if (slug) slugs.add(slug);
  }
  return [...slugs].sort();
}

async function readCache(slug: string): Promise<CachedPage | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${slug}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function fetchPage(slug: string): Promise<CachedPage> {
  const url = `https://www.basketball-reference.com/players/${slug[0]}/${slug}.html`;
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(30000),
    }).catch(() => null);
    if (res?.status === 404) return { slug, missing: true };
    if (res?.ok) {
      const page = parseBrefPlayerHtml(await res.text(), slug);
      return {
        slug,
        bio: page.bio,
        totals: page.regular.totals,
        advanced: page.regular.advanced,
      };
    }
    if (res?.status === 429) {
      console.warn(`[legend-careers] 429 on ${slug}; waiting ${JAIL_WAIT_MS / 60000} min`);
      await sleep(JAIL_WAIT_MS);
      continue;
    }
    if (attempt >= 3) throw new Error(`${slug}: HTTP ${res?.status ?? "error"}`);
    await sleep(DELAY_MS * (attempt + 2));
  }
}

/**
 * One row per season: the combined line when traded, else the only team.
 * Skips BRef note rows ("Did Not Play - …") that sit in the team column.
 */
function onePerSeason<T extends { season: string; teamAbbr: string; combined: boolean }>(
  rows: T[]
): T[] {
  const bySeason = new Map<string, T>();
  for (const row of rows) {
    if (!/^[A-Z0-9]{2,4}$/.test(row.teamAbbr)) continue;
    const prev = bySeason.get(row.season);
    if (!prev || (row.combined && !prev.combined)) bySeason.set(row.season, row);
  }
  return [...bySeason.values()].sort((a, b) => a.season.localeCompare(b.season));
}

const r4 = (n: number | null) => (n == null ? null : Math.round(n * 10000) / 10000);

function compact(page: Extract<CachedPage, { bio: unknown }>) {
  const b = page.bio;
  const bio: Record<string, string | number> = {};
  const put = (key: string, value: string | number | null) => {
    if (value != null && value !== "") bio[key] = value;
  };
  // parseBio falls back to Luka's name when the page has no h1.
  if (page.slug === "doncilu01" || b.displayName !== "Luka Dončić") {
    put("n", b.displayName);
  }
  put("pos", b.positionLine);
  put("sh", b.shoots);
  put("h", b.heightInches);
  put("w", b.weightLbs);
  put("bd", b.birthDate);
  put("bp", b.birthPlace);
  put("dr", b.draftLine);
  put("j", b.jersey);
  return {
    b: bio,
    t: onePerSeason(page.totals).map((r) => [
      r.season, r.teamAbbr, r.combined ? 1 : 0, r.gamesPlayed, r.gamesStarted,
      r.minutes, r.points, r.rebounds, r.assists, r.steals, r.blocks,
      r.turnovers, r4(r.fieldGoalPct), r4(r.threePointPct), r4(r.freeThrowPct),
      r4(r.effectiveFieldGoalPct),
      r.fieldGoalsMade ?? null, r.fieldGoalsAttempted ?? null,
      r.threePointersMade ?? null, r.threePointersAttempted ?? null,
      r.freeThrowsMade ?? null, r.freeThrowsAttempted ?? null,
      r.offensiveRebounds ?? null, r.defensiveRebounds ?? null,
      r.personalFouls ?? null, r.age,
    ]),
    a: onePerSeason(page.advanced).map((r) => [
      r.season, r.teamAbbr, r.combined ? 1 : 0, r.per, r4(r.trueShootingPct),
      r4(r.usagePct), r4(r.turnoverPct), r4(r.assistPct), r4(r.reboundPct),
      r.bpm, r.vorp, r.winShares, r.offensiveRating, r.defensiveRating,
      r4(r.offensiveReboundPct ?? null), r4(r.defensiveReboundPct ?? null),
      r4(r.stealPct ?? null), r4(r.blockPct ?? null),
      r4(r.threePointAttemptRate ?? null), r4(r.freeThrowRate ?? null),
      r.offensiveWinShares ?? null, r.defensiveWinShares ?? null,
      r.winSharesPer48 ?? null, r.offensiveBpm ?? null, r.defensiveBpm ?? null,
    ]),
  };
}

async function emit(slugs: string[]) {
  const shards = new Map<string, Record<string, unknown>>();
  for (const letter of "abcdefghijklmnopqrstuvwxyz") shards.set(letter, {});
  let players = 0;
  for (const slug of slugs) {
    const cached = await readCache(slug);
    if (!cached || "missing" in cached || !cached.totals.length) continue;
    shards.get(slug[0])![slug] = compact(cached);
    players += 1;
  }
  await fs.mkdir(OUT_DIR, { recursive: true });
  let bytes = 0;
  for (const [letter, players] of shards) {
    const text = JSON.stringify(players);
    bytes += text.length;
    await fs.writeFile(path.join(OUT_DIR, `${letter}.json`), text);
  }
  console.log(
    `[legend-careers] wrote ${players}/${slugs.length} players → ${OUT_DIR} (${Math.round(bytes / 1024)} KiB)`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const emitOnly = args.includes("--emit");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
  const slugs = await legendSlugs();
  await fs.mkdir(CACHE_DIR, { recursive: true });

  if (!emitOnly) {
    const todo: string[] = [];
    for (const slug of slugs) if (!(await readCache(slug))) todo.push(slug);
    const batch = todo.slice(0, limit);
    console.log(`[legend-careers] ${slugs.length} legends, ${todo.length} uncached, fetching ${batch.length}`);
    let done = 0;
    for (const slug of batch) {
      try {
        const page = await fetchPage(slug);
        await fs.writeFile(path.join(CACHE_DIR, `${slug}.json`), JSON.stringify(page));
      } catch (error) {
        console.warn(`[legend-careers] ${error instanceof Error ? error.message : error}`);
      }
      done += 1;
      if (done % 50 === 0) {
        console.log(`[legend-careers] ${done}/${batch.length}`);
        await emit(slugs);
      }
      await sleep(DELAY_MS);
    }
  }
  await emit(slugs);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
