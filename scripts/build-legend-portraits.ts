/**
 * Playing-days portraits for baked legends (public/runtime/legend-careers).
 * Writes `src/data/media/legend-portraits.json`, keyed by `bref:{slug}`; the
 * lookup checks it before the main registry, whose legend photos are often
 * post-career (retired-player headshots) or keyed to the wrong person.
 *
 * Per legend, a Wikimedia Commons photo from the player's category (or
 * Wikidata image) dated inside the player's seasons, free license, one clear
 * face. Legends without one keep whatever the registry had.
 *
 * Usage: npx tsx scripts/build-legend-portraits.ts   (macOS; needs `swift`)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { encodePortraitPhoto } from "../src/lib/portrait-photo";

const ROOT = process.cwd();
const SHARDS = path.join(ROOT, "public/runtime/legend-careers");
const OUT = path.join(ROOT, "src/data/media/legend-portraits.json");
const CACHE_DIR = path.join(ROOT, "data/cache/player-photos");
const COMMONS_CACHE = path.join(CACHE_DIR, "legend-commons.json");
const UA =
  "basketball-analytics/1.0 (https://drbl.io; educational)";
const FREE_LICENSE = /^(cc by(-sa)?( \d(\.\d)?)?|cc0|public domain|pd)/i;
const FACE_PX_NEEDED = 140 * 2 * 0.4;
const THUMB_WIDTHS = [330, 500, 960, 1280, 1920];
const MAX_CANDIDATES = 8;

type Legend = { slug: string; name: string; first: number; last: number };
type Candidate = {
  file: string;
  thumb: string;
  original: string;
  width: number;
  height: number;
  credit: string;
  year: number;
  named: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const fold = (s: string) =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

async function get(url: string, init: RequestInit = {}, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        ...init,
        headers: {
          "User-Agent": UA,
          ...(init.headers ?? {}),
        },
      });
      if ((res.status === 429 || res.status >= 500) && i < tries - 1 && !url.includes("basketball-reference")) {
        await sleep(5000 * (i + 1));
        continue;
      }
      return res;
    } catch (err) {
      if (i >= tries - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function loadLegends(): Promise<Legend[]> {
  const out: Legend[] = [];
  for (const f of (await fs.readdir(SHARDS)).sort()) {
    const shard = JSON.parse(await fs.readFile(path.join(SHARDS, f), "utf8")) as Record<
      string,
      { b?: { n?: string }; t?: Array<[string, ...unknown[]]> }
    >;
    for (const [slug, row] of Object.entries(shard)) {
      const seasons = (row.t ?? []).map((r) => Number(String(r[0]).slice(0, 4))).filter(Boolean);
      if (!row.b?.n || !seasons.length) continue;
      out.push({ slug, name: row.b.n, first: Math.min(...seasons), last: Math.max(...seasons) + 1 });
    }
  }
  return out;
}

async function wikidataBySlug(): Promise<Map<string, { cat: string | null; image: string | null }>> {
  const query = `SELECT ?bref ?cat ?image WHERE {
    ?item wdt:P2685 ?bref .
    OPTIONAL { ?item wdt:P373 ?cat . }
    OPTIONAL { ?item wdt:P18 ?image . }
  }`;
  const res = await get("https://query.wikidata.org/sparql", {
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
  const out = new Map<string, { cat: string | null; image: string | null }>();
  for (const b of json.results.bindings) {
    const slug = b.bref?.value.split("/").pop()?.toLowerCase();
    if (!slug) continue;
    const row = out.get(slug) ?? { cat: null, image: null };
    row.cat ??= b.cat?.value ?? null;
    row.image ??= b.image?.value
      ? decodeURIComponent(b.image.value.split("/Special:FilePath/")[1] ?? "") || null
      : null;
    out.set(slug, row);
  }
  return out;
}

async function categoryFiles(cat: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "categorymembers",
    cmtitle: `Category:${cat}`,
    cmtype: "file",
    cmlimit: "200",
  });
  const res = await get(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { query?: { categorymembers?: Array<{ title: string }> } };
  return (json.query?.categorymembers ?? []).map((m) => m.title.replace(/^File:/, ""));
}

type Info = Omit<Candidate, "year" | "named"> & { date: string };

async function fileInfo(files: string[]): Promise<Map<string, Info>> {
  const out = new Map<string, Info>();
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
    const res = await get(`https://commons.wikimedia.org/w/api.php?${params}`);
    if (!res.ok) continue;
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
      if (!FREE_LICENSE.test(license)) continue;
      const artist = stripHtml(meta.Artist?.value ?? "");
      out.set(file, {
        file,
        thumb: ii.thumburl ?? ii.url,
        original: ii.url,
        width: ii.width,
        height: ii.height,
        credit: `Photo: ${artist || "Unknown photographer"}, ${license}, via Wikimedia Commons`,
        date: stripHtml(meta.DateTimeOriginal?.value ?? ""),
      });
    }
    await sleep(300);
  }
  return out;
}

/** Year the photo was taken: metadata date first, then a year in the file name. */
function photoYear(info: Info): number | null {
  const fromDate = info.date.match(/\b(18|19|20)\d{2}\b/);
  if (fromDate) return Number(fromDate[0]);
  const fromName = info.file.match(/\b(19|20)\d{2}\b/);
  return fromName ? Number(fromName[0]) : null;
}

const GROUP = /\b(and|with|vs\.?|versus|team|squad|roster|&)\b/i;
const NOT_A_PHOTO =
  /\.(svg|pdf|tiff?|webm|ogv|gif)$|signature|autograph|logo|grave|plaque|statue|jersey|card back|\bpage\b|newspaper|chronicle|program|sketch|drawing|painting|caricature|illustration|baseball|football|red sox|,[^,]*,/i;

function candidatesFor(legend: Legend, infos: Info[]): Candidate[] {
  const surname = fold(legend.name.replace(/,? (jr|sr|ii|iii|iv)\.?$/i, "").split(" ").pop() ?? "");
  return infos
    .filter((i) => !NOT_A_PHOTO.test(i.file) && !GROUP.test(i.file.replace(/_/g, " ")))
    .map((i) => ({ ...i, year: photoYear(i) ?? 0, named: fold(i.file).includes(surname) }))
    // Category files often show teammates or opponents; the name must be in the title.
    .filter((c) => c.named && c.year >= legend.first && c.year <= legend.last)
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, MAX_CANDIDATES);
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
      if (line.trim()) {
        const row = JSON.parse(line) as FaceRow;
        out.set(row.file, row);
      }
    }
  }
  return out;
}

function thumbForWidth(c: Candidate, needed: number): string {
  const width = THUMB_WIDTHS.find((w) => w >= needed);
  if (!width || width >= c.width) return c.original;
  return c.thumb.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
}

async function commonsPhotos(legends: Legend[]): Promise<Map<string, string>> {
  const wikidata = await wikidataBySlug();
  console.log(`wikidata rows with a BRef id: ${wikidata.size}`);
  const cache = await readJson<Record<string, Candidate[]>>(COMMONS_CACHE, {});
  let n = 0;
  for (const legend of legends) {
    if (legend.slug in cache) continue;
    const wd = wikidata.get(legend.slug);
    const files = new Set<string>();
    if (wd?.image) files.add(wd.image);
    if (wd?.cat) (await categoryFiles(wd.cat)).forEach((f) => files.add(f));
    cache[legend.slug] = files.size ? candidatesFor(legend, [...(await fileInfo([...files])).values()]) : [];
    if (++n % 50 === 0) {
      await fs.writeFile(COMMONS_CACHE, JSON.stringify(cache));
      console.log(`  commons listed ${n}`);
    }
  }
  await fs.writeFile(COMMONS_CACHE, JSON.stringify(cache));
  for (const slug of Object.keys(cache)) {
    cache[slug] = cache[slug].filter((c) => c.named && !NOT_A_PHOTO.test(c.file));
  }

  const local = (c: Candidate) =>
    path.join(CACHE_DIR, createHash("sha1").update(c.file.replace(/ /g, "_")).digest("hex") + ".jpg");
  const toScan: string[] = [];
  for (const legend of legends) {
    for (const c of cache[legend.slug] ?? []) {
      const file = local(c);
      try {
        await fs.access(file);
      } catch {
        const res = await get(c.thumb);
        if (!res.ok) continue;
        await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
        await sleep(200);
      }
      toScan.push(file);
    }
  }
  const faces = detectFaces([...new Set(toScan)]);

  const out = new Map<string, string>();
  for (const legend of legends) {
    for (const c of cache[legend.slug] ?? []) {
      const row = faces.get(local(c));
      if (!row) continue;
      const sorted = row.faces
        .filter((f) => f.confidence >= 0.5)
        .sort((a, b) => b.w * b.h - a.w * a.h);
      const [face, second] = sorted;
      if (!face || (second && second.w * second.h > 0.35 * face.w * face.h)) continue;
      if (face.h * c.height < 72) continue;
      const aspect = c.width / c.height;
      const src = thumbForWidth(c, Math.ceil((FACE_PX_NEEDED / face.h) * aspect));
      out.set(
        legend.slug,
        encodePortraitPhoto(
          src,
          { cx: face.x + face.w / 2, cy: face.y + face.h / 2, fh: face.h, aspect },
          c.credit
        )
      );
      break;
    }
  }
  return out;
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const legends = await loadLegends();
  const phase = process.argv[2] ?? "all";
  console.log(`legends ${legends.length}; phase ${phase}`);

  const commons = await commonsPhotos(legends);
  console.log(`commons in-career photos ${commons.size}`);
  if (phase === "commons") {
    await fs.writeFile(
      path.join(CACHE_DIR, "legend-commons-picks.json"),
      JSON.stringify(Object.fromEntries(commons), null, 1)
    );
    return;
  }

  const portraits: Record<string, string> = {};
  for (const { slug } of legends) {
    const url = commons.get(slug);
    if (url) portraits[`bref:${slug}`] = url;
  }
  await fs.writeFile(
    OUT,
    JSON.stringify(
      {
        version: "drbl-legend-portraits-v1",
        updatedAt: new Date().toISOString(),
        note: "Playing-days photos for pre-1996-97 players. Checked before the main registry.",
        count: Object.keys(portraits).length,
        portraits: Object.fromEntries(Object.entries(portraits).sort(([a], [b]) => a.localeCompare(b))),
      },
      null,
      1
    ) + "\n"
  );
  console.log(`wrote ${Object.keys(portraits).length} → ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
