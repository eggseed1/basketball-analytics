/**
 * Portrait fallbacks for player routes the main registry misses
 * (mostly `bref:{name}` routes). Writes `src/data/media/portrait-fallbacks.json`.
 *
 * For each route with no registry portrait, resolve the player to one NBA
 * PERSON_ID (nba_api static list, unique names only), then take the first of:
 *   1. a registry portrait already keyed by that NBA id or BRef slug
 *   2. a validated cdn.nba.com headshot
 *   3. a validated Basketball-Reference headshot (slug from Wikidata)
 *   4. the player's Wikidata image (Wikimedia Commons, free license), kept
 *      only when macOS Vision finds one clear face; stored with face crop and
 *      photo credit (see src/lib/portrait-photo.ts)
 *
 * Usage: npx tsx scripts/build-player-photo-fallbacks.ts   (macOS; needs `swift`)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { expandPortraitIds } from "../src/data/media/get-player-media";
import { lookupRegistryPortraitUrl } from "../src/data/media/portrait-lookup-store";
import { getBundledBrefSearchIndex } from "../src/data/runtime/bref-advanced-snapshot";
import { normalizeEspnLookupName } from "../src/data/runtime/espn-name-index";
import searchSnapshot from "../src/data/runtime/player-search-snapshot.json";
import { encodePortraitPhoto } from "../src/lib/portrait-photo";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src/data/media/portrait-fallbacks.json");
const CACHE_DIR = path.join(ROOT, "data/cache/player-photos");
const CACHE_FILE = path.join(CACHE_DIR, "verdicts.json");
/** Wikimedia asks for an identifying agent; the NBA CDN resets non-Mozilla agents. */
const UA =
  "basketball-analytics/1.0 (https://basketball-analytics.drbl-analytics.workers.dev; educational)";
const CDN_UA = "Mozilla/5.0 (compatible; BasketballAnalytics/portrait-rebuild; educational)";
const agentFor = (url: string) =>
  /wikimedia\.org|wikidata\.org|wikipedia\.org/.test(url) ? UA : CDN_UA;
const NBA_API_URL =
  "https://raw.githubusercontent.com/swar/nba_api/master/src/nba_api/stats/library/data.py";
const BREF_DELAY_MS = Number(process.env.BREF_DELAY_MS || 3200);
const NBA_PLACEHOLDER_SHA =
  "b3ebe78bfd1cecb8880e51e6a48c9093c5cfb7065f981826d12fb4c01a1b0965";
const FREE_LICENSE = /^(cc by(-sa)?( \d(\.\d)?)?|cc0|public domain|pd)/i;
/** Largest render is a 140px circle at 2x DPR; face fills 40% of it (FACE_SHARE). */
const FACE_PX_NEEDED = 140 * 2 * 0.4;
const THUMB_WIDTHS = [330, 500, 960, 1280, 1920];

type Verdicts = Record<string, boolean>;
type Fallback = { url: string; source: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, init: RequestInit = {}, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        ...init,
        headers: { "User-Agent": agentFor(url), ...(init.headers ?? {}) },
      });
      if (res.status === 429 && i < tries - 1) {
        await sleep(5000 * (i + 1));
        continue;
      }
      return res;
    } catch (err) {
      if (i >= tries - 1) throw err;
      await sleep(1500 * (i + 1));
    }
  }
}

/** Fetch + body read with retries (CDNs drop HTTP/2 streams mid-body). */
async function fetchBuffer(url: string, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetchWithRetry(url);
      const buf = Buffer.from(await res.arrayBuffer());
      return { res, buf };
    } catch (err) {
      if (i >= tries - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
}

async function loadNbaPlayers(): Promise<Map<string, string[]>> {
  const py = await (await fetchWithRetry(NBA_API_URL)).text();
  const block = py.slice(py.indexOf("players = ["), py.indexOf("wnba_players = ["));
  const byName = new Map<string, string[]>();
  for (const m of block.matchAll(
    /\[(\d+), "(?:[^"\\]|\\.)*", "(?:[^"\\]|\\.)*", "((?:[^"\\]|\\.)*)", (?:True|False)\]/g
  )) {
    const key = normalizeEspnLookupName(m[2].replace(/\\"/g, '"'));
    byName.set(key, [...(byName.get(key) ?? []), m[1]]);
  }
  if (byName.size < 4000) throw new Error(`nba_api list too short: ${byName.size}`);
  return byName;
}

const stripSuffix = (key: string) => key.replace(/ (jr|sr|ii|iii|iv)$/, "");

function makeNameResolver(byName: Map<string, string[]>) {
  const byStripped = new Map<string, Set<string>>();
  for (const [key, ids] of byName) {
    const s = stripSuffix(key);
    const set = byStripped.get(s) ?? new Set<string>();
    ids.forEach((id) => set.add(id));
    byStripped.set(s, set);
  }
  return (name: string): string | null => {
    const key = normalizeEspnLookupName(name);
    const exact = byName.get(key);
    if (exact) return exact.length === 1 ? exact[0] : null;
    const loose = byStripped.get(stripSuffix(key));
    return loose && loose.size === 1 ? [...loose][0] : null;
  };
}

type WikidataRow = { slug: string | null; image: string | null };

async function loadWikidata(): Promise<Map<string, WikidataRow>> {
  const query = `SELECT ?nba ?bref ?image WHERE {
    ?item wdt:P3647 ?nba .
    OPTIONAL { ?item wdt:P2685 ?bref . }
    OPTIONAL { ?item wdt:P18 ?image . }
  }`;
  const res = await fetchWithRetry("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query }).toString(),
  });
  if (!res.ok) throw new Error(`Wikidata SPARQL → HTTP ${res.status}`);
  const json = (await res.json()) as {
    results: { bindings: Array<Record<string, { value: string } | undefined>> };
  };
  const byNba = new Map<string, WikidataRow>();
  for (const b of json.results.bindings) {
    const nba = b.nba?.value;
    if (!nba) continue;
    const row = byNba.get(nba) ?? { slug: null, image: null };
    // Wikidata stores some slugs with the BRef letter folder ("o/okanito01").
    row.slug ??= b.bref?.value.split("/").pop()?.toLowerCase() ?? null;
    row.image ??= b.image?.value ?? null;
    byNba.set(nba, row);
  }
  return byNba;
}

async function readVerdicts(): Promise<Verdicts> {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf8")) as Verdicts;
  } catch {
    return {};
  }
}

async function validNbaHeadshot(id: string, verdicts: Verdicts): Promise<string | null> {
  const url = `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
  if (!(url in verdicts)) {
    const { res, buf } = await fetchBuffer(url);
    const sha = createHash("sha256").update(buf).digest("hex");
    verdicts[url] = res.ok && buf.length >= 8000 && sha !== NBA_PLACEHOLDER_SHA;
    await fs.writeFile(CACHE_FILE, JSON.stringify(verdicts));
  }
  return verdicts[url] ? url : null;
}

async function validBrefHeadshot(slug: string, verdicts: Verdicts): Promise<string | null> {
  const url = `https://www.basketball-reference.com/req/202106291/images/headshots/${slug}.jpg`;
  if (!(url in verdicts)) {
    await sleep(BREF_DELAY_MS);
    const { res, buf } = await fetchBuffer(url);
    const type = res.headers.get("content-type") ?? "";
    if (res.status === 429) throw new Error("Basketball-Reference rate limit hit; rerun later");
    verdicts[url] = res.ok && type.startsWith("image/") && buf.length >= 2500;
    await fs.writeFile(CACHE_FILE, JSON.stringify(verdicts));
  }
  return verdicts[url] ? url : null;
}

type CommonsInfo = {
  file: string;
  thumb: string;
  original: string;
  width: number;
  height: number;
  credit: string | null;
};

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function commonsInfo(files: string[]): Promise<Map<string, CommonsInfo>> {
  const out = new Map<string, CommonsInfo>();
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: "500",
      titles: batch.map((f) => `File:${f}`).join("|"),
    });
    const res = await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${params}`);
    const json = (await res.json()) as {
      query?: {
        normalized?: Array<{ from: string; to: string }>;
        pages?: Record<string, {
          title: string;
          imageinfo?: Array<{
            thumburl?: string;
            url: string;
            width: number;
            height: number;
            extmetadata?: Record<string, { value?: string } | undefined>;
          }>;
        }>;
      };
    };
    const back = new Map(
      (json.query?.normalized ?? []).map((n) => [n.to, n.from.replace(/^File:/, "")])
    );
    for (const page of Object.values(json.query?.pages ?? {})) {
      const ii = page.imageinfo?.[0];
      if (!ii) continue;
      const file = back.get(page.title) ?? page.title.replace(/^File:/, "");
      const meta = ii.extmetadata ?? {};
      const license = stripHtml(meta.LicenseShortName?.value ?? "");
      const artist = stripHtml(meta.Artist?.value ?? "");
      const credit = FREE_LICENSE.test(license)
        ? `Photo: ${artist || "Unknown photographer"}, ${license}, via Wikimedia Commons`
        : null;
      out.set(file.replace(/ /g, "_"), {
        file,
        thumb: ii.thumburl ?? ii.url,
        original: ii.url,
        width: ii.width,
        height: ii.height,
        credit,
      });
    }
    await sleep(500);
  }
  return out;
}

type FaceRow = {
  file: string;
  width: number;
  height: number;
  faces: Array<{ x: number; y: number; w: number; h: number; confidence: number }>;
};

function detectFaces(paths: string[]): Map<string, FaceRow> {
  const out = new Map<string, FaceRow>();
  for (let i = 0; i < paths.length; i += 60) {
    const stdout = execFileSync(
      "swift",
      [path.join(ROOT, "scripts/face-boxes.swift"), ...paths.slice(i, i + 60)],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
    );
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as FaceRow;
      out.set(row.file, row);
    }
  }
  return out;
}

function thumbForWidth(info: CommonsInfo, needed: number): string {
  const width = THUMB_WIDTHS.find((w) => w >= needed);
  if (!width || width >= info.width) return info.original;
  return info.thumb.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
}

async function main() {
  const [byName, wikidata] = await Promise.all([loadNbaPlayers(), loadWikidata()]);
  const resolveNbaId = makeNameResolver(byName);
  const verdicts = await readVerdicts();
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const routes = new Map<string, string>();
  for (const row of getBundledBrefSearchIndex()) routes.set(row.id, row.name);
  for (const [id, name] of (searchSnapshot as { players: Array<[string, string]> }).players) {
    if (!routes.has(id)) routes.set(id, name);
  }

  const missing = [...routes].filter(
    ([id]) => !lookupRegistryPortraitUrl(...expandPortraitIds(id))
  );
  console.log(`routes ${routes.size}; without a registry portrait ${missing.length}`);

  const fallbacks: Record<string, Fallback> = {};
  const needPhoto: Array<{ route: string; nbaId: string; file: string }> = [];
  const tally: Record<string, number> = {};
  const bump = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);

  let done = 0;
  for (const [route, name] of missing) {
    if (++done % 100 === 0) console.log(`  ${done}/${missing.length}`, JSON.stringify(tally));
    const nbaId = resolveNbaId(name);
    if (!nbaId) {
      bump("no unique NBA id");
      continue;
    }
    const wd = wikidata.get(nbaId);
    // Bare numeric registry keys are also ESPN ids (NBA 37 is Greg Graham,
    // ESPN 37 is Charles Barkley), so an NBA-id hit must be that id's own CDN shot.
    const byNba = lookupRegistryPortraitUrl(nbaId);
    const registry =
      (wd?.slug ? lookupRegistryPortraitUrl(`bref:${wd.slug}`) : null) ??
      (byNba?.includes(`/${nbaId}.png`) ? byNba : null);
    if (registry) {
      fallbacks[route] = { url: registry, source: "registry" };
      bump("registry");
      continue;
    }
    const nba = await validNbaHeadshot(nbaId, verdicts);
    if (nba) {
      fallbacks[route] = { url: nba, source: "cdn.nba.com" };
      bump("cdn.nba.com");
      continue;
    }
    const bref = wd?.slug ? await validBrefHeadshot(wd.slug, verdicts) : null;
    if (bref) {
      fallbacks[route] = { url: bref, source: "basketball-reference.com" };
      bump("basketball-reference.com");
      continue;
    }
    if (wd?.image) {
      const file = decodeURIComponent(wd.image.split("/Special:FilePath/")[1] ?? "");
      if (file) {
        needPhoto.push({ route, nbaId, file: file.replace(/ /g, "_") });
        continue;
      }
    }
    bump("nothing found");
  }
  await fs.writeFile(CACHE_FILE, JSON.stringify(verdicts));

  const infos = await commonsInfo([...new Set(needPhoto.map((n) => n.file))]);
  const downloads: Array<{ file: string; local: string }> = [];
  for (const { file } of needPhoto) {
    const info = infos.get(file);
    if (!info?.credit) continue;
    const local = path.join(CACHE_DIR, createHash("sha1").update(file).digest("hex") + ".jpg");
    try {
      await fs.access(local);
    } catch {
      const { res, buf } = await fetchBuffer(info.thumb);
      if (!res.ok) continue;
      await fs.writeFile(local, buf);
      await sleep(250);
    }
    downloads.push({ file, local });
  }
  const faces = detectFaces([...new Set(downloads.map((d) => d.local))]);
  const localByFile = new Map(downloads.map((d) => [d.file, d.local]));

  for (const { route, file } of needPhoto) {
    const info = infos.get(file);
    const local = localByFile.get(file);
    const row = local ? faces.get(local) : undefined;
    if (!info?.credit || !row) {
      bump(info && !info.credit ? "photo license not free" : "photo unavailable");
      continue;
    }
    const sorted = row.faces
      .filter((f) => f.confidence >= 0.5)
      .sort((a, b) => b.w * b.h - a.w * a.h);
    const face = sorted[0];
    const second = sorted[1];
    const facePxAtOriginal = face ? face.h * info.height : 0;
    if (!face || (second && second.w * second.h > 0.5 * face.w * face.h) || facePxAtOriginal < 48) {
      bump("photo rejected (no single clear face)");
      continue;
    }
    const aspect = info.width / info.height;
    const neededHeight = FACE_PX_NEEDED / face.h;
    const src = thumbForWidth(info, Math.ceil(neededHeight * aspect));
    fallbacks[route] = {
      url: encodePortraitPhoto(
        src,
        { cx: face.x + face.w / 2, cy: face.y + face.h / 2, fh: face.h, aspect },
        info.credit
      ),
      source: "commons.wikimedia.org",
    };
    bump("commons.wikimedia.org");
  }

  const portraits = Object.fromEntries(
    Object.entries(fallbacks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([route, f]) => [route, f.url])
  );
  await fs.writeFile(
    OUT,
    JSON.stringify(
      {
        version: "drbl-portrait-fallbacks-v1",
        updatedAt: new Date().toISOString(),
        note: "Routes the main registry misses. Commons photos carry face crop + credit in the URL fragment.",
        count: Object.keys(portraits).length,
        portraits,
      },
      null,
      1
    ) + "\n"
  );
  console.log(tally);
  console.log(`wrote ${Object.keys(portraits).length} fallbacks → ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
