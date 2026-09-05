/**
 * Rebuild portrait-lookup with typed, validated CDN assets.
 *
 * Rules:
 * - NBA PERSON_ID → prefer cdn.nba.com/…/{nbaId}.png (reject placeholders)
 * - ESPN athlete ID → prefer a.espncdn.com/…/full/{espnId}.png
 * - Never key an ESPN id to NBA CDN using that same number (ID collision)
 * - Dual-key nba + espn + bref:{slug} when known
 * - BRef headshot fallback for historical slugs when NBA/ESPN CDNs fail
 * - Alias/legend dual-keys are authoritative (applied last)
 *
 *   node scripts/build-runtime-portrait-lookup.mjs
 */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src", "data", "media", "portrait-lookup.json");
const RUNTIME = path.join(ROOT, "src", "data", "runtime");

const PLACEHOLDER_SHA = new Set([
  "b3ebe78bfd1cecb8880e51e6a48c9093c5cfb7065f981826d12fb4c01a1b0965",
]);
const SIZE_FLOOR_NBA_ESPN = 8000;
const SIZE_FLOOR_BREF = 2500;
const UA =
  "Mozilla/5.0 (compatible; BasketballAnalytics/portrait-rebuild; educational)";

/** NBA latest CDN is coach-era / wrong for these PERSON_IDs — force ESPN. */
const BLOCKED_NBA_LATEST = new Set(["959"]); // Steve Nash

function nbaUrl(id) {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
}
function espnUrl(id) {
  return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
}
function brefUrl(slug) {
  return `https://www.basketball-reference.com/req/202106291/images/headshots/${slug}.jpg`;
}
function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
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

const validateCache = new Map();
async function validate(url, sizeFloor = SIZE_FLOOR_NBA_ESPN) {
  const cacheKey = `${url}|${sizeFloor}`;
  if (validateCache.has(cacheKey)) return validateCache.get(cacheKey);
  const pending = (async () => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (PLACEHOLDER_SHA.has(sha(buf)) || buf.length < sizeFloor) return null;
      const ct = String(res.headers.get("content-type") ?? "");
      if (!ct.includes("image")) return null;
      return url;
    } catch {
      return null;
    }
  })();
  validateCache.set(cacheKey, pending);
  return pending;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

function readJson(filePath) {
  return fs.readFile(filePath, "utf8").then(JSON.parse);
}

/**
 * Merge person records by nbaId / espnId / bref slug so alias ESPN ids
 * are not wiped by later darko/search upserts.
 * @typedef {{ nbaId: string, espnId: string, brefSlug: string, name: string, locked?: boolean }} Person
 */
const byNba = new Map();
const byEspn = new Map();
const byBref = new Map();
/** @type {Person[]} */
const people = [];

function touchPerson(partial, { lock = false } = {}) {
  const nbaId = partial.nbaId ? String(partial.nbaId).trim() : "";
  const espnId = partial.espnId ? String(partial.espnId).trim() : "";
  const brefSlug = partial.brefSlug
    ? String(partial.brefSlug).trim().toLowerCase()
    : "";
  const name = partial.name ? String(partial.name).trim() : "";

  let person =
    (nbaId && byNba.get(nbaId)) ||
    (espnId && byEspn.get(espnId)) ||
    (brefSlug && byBref.get(brefSlug)) ||
    null;

  if (!person) {
    person = { nbaId: "", espnId: "", brefSlug: "", name: "", locked: false };
    people.push(person);
  }

  if (lock) person.locked = true;

  if (nbaId) {
    if (!person.nbaId || person.locked || !byNba.has(nbaId)) {
      person.nbaId = nbaId;
    }
    byNba.set(nbaId, person);
  }
  if (espnId) {
    // Locked alias/legend ESPN wins over earlier guesses.
    if (!person.espnId || lock || !person.locked) {
      if (!person.espnId || lock) person.espnId = espnId;
    }
    if (lock) person.espnId = espnId;
    byEspn.set(person.espnId, person);
  }
  if (brefSlug) {
    if (!person.brefSlug || lock) person.brefSlug = brefSlug;
    byBref.set(person.brefSlug, person);
  }
  if (name) {
    if (!person.name || lock) person.name = name;
    else if (!person.locked) person.name = name;
  }
}

const [
  priorLookup,
  aliasesSnap,
  legend,
  awards,
  impact,
  searchSnap,
] = await Promise.all([
  readJson(OUT).catch(() => ({ portraits: {} })),
  readJson(path.join(RUNTIME, "player-id-aliases-snapshot.json")).catch(() => ({
    aliases: [],
  })),
  readJson(path.join(ROOT, "data", "impact", "legend-player-aliases.json")).catch(
    () => ({ aliases: [] })
  ),
  readJson(path.join(RUNTIME, "player-awards-snapshot.json")).catch(() => ({
    names: {},
    slugs: {},
  })),
  readJson(path.join(RUNTIME, "impact-overlay-snapshot.json")).catch(() => ({
    darko: {},
  })),
  readJson(path.join(RUNTIME, "player-search-snapshot.json")).catch(() => ({
    players: [],
  })),
]);

// Soft sources first…
for (const rows of Object.values(impact.darko ?? {})) {
  if (!Array.isArray(rows)) continue;
  for (const row of rows) {
    const nbaId = String(row?.[0] ?? "").trim();
    const name = String(row?.[1] ?? "").trim();
    if (!nbaId) continue;
    touchPerson({ nbaId, name });
  }
}
for (const [nbaId, name] of Object.entries(awards.names ?? {})) {
  touchPerson({
    nbaId,
    brefSlug: awards.slugs?.[nbaId],
    name,
  });
}
for (const p of searchSnap.players ?? []) {
  if (!Array.isArray(p)) continue;
  const id = String(p[0] ?? "").trim();
  const name = String(p[1] ?? "").trim();
  if (id.startsWith("bref:")) {
    touchPerson({ brefSlug: id.slice(5), name });
  } else if (/^\d+$/.test(id)) {
    // Search numeric ids are often ESPN athlete ids — do not treat as NBA.
    touchPerson({ espnId: id, name });
  }
}
for (const row of aliasesSnap.aliases ?? []) {
  touchPerson({
    nbaId: row.nbaPlayerId,
    espnId: row.espnPlayerId,
    brefSlug: row.brefSlug,
    name: row.playerName,
  });
}
// …authoritative legend seeds last (lock espn↔nba↔bref).
for (const row of legend.aliases ?? []) {
  touchPerson(
    {
      nbaId: row.nbaPlayerId,
      espnId: row.espnPlayerId,
      brefSlug: row.brefSlug,
      name: row.playerName,
    },
    { lock: true }
  );
}

// Unique-name bridge: bref-only → NBA id
const nameToNba = new Map();
const nameAmbiguous = new Set();
for (const person of people) {
  if (!person.nbaId || !person.name) continue;
  const key = normalizeName(person.name);
  if (!key) continue;
  if (nameAmbiguous.has(key)) continue;
  if (nameToNba.has(key) && nameToNba.get(key) !== person.nbaId) {
    nameToNba.delete(key);
    nameAmbiguous.add(key);
    continue;
  }
  nameToNba.set(key, person.nbaId);
}

let brefBridged = 0;
for (const person of people) {
  if (person.nbaId || !person.brefSlug || !person.name) continue;
  const nbaId = nameToNba.get(normalizeName(person.name));
  if (!nbaId) continue;
  const target = byNba.get(nbaId);
  if (!target) {
    person.nbaId = nbaId;
    byNba.set(nbaId, person);
  } else {
    if (person.espnId && !target.espnId) target.espnId = person.espnId;
    if (person.brefSlug && !target.brefSlug) target.brefSlug = person.brefSlug;
    if (person.name && !target.name) target.name = person.name;
    byBref.set(person.brefSlug, target);
  }
  brefBridged += 1;
}

const list = people.filter((p) => p.nbaId || p.espnId || p.brefSlug);
console.log(
  `[portraits] candidates=${list.length} brefBridged=${brefBridged} validateCache starting…`
);

const portraits = {};
let promoted = 0;
let failed = 0;
let brefFallback = 0;

await mapPool(list, 16, async (person) => {
  const nbaId = person.nbaId || "";
  const espnId = person.espnId || "";
  const brefSlug = person.brefSlug || "";

  let nbaOk = null;
  let espnOk = null;
  let brefOk = null;

  if (nbaId && !BLOCKED_NBA_LATEST.has(nbaId)) {
    nbaOk = await validate(nbaUrl(nbaId));
  }
  if (espnId) {
    espnOk = await validate(espnUrl(espnId));
  }
  if (brefSlug && !nbaOk && !espnOk) {
    brefOk = await validate(brefUrl(brefSlug), SIZE_FLOOR_BREF);
    if (brefOk) brefFallback += 1;
  }

  const bestNba = nbaOk;
  const bestEspn = espnOk;
  const best = bestNba || bestEspn || brefOk;
  if (!best) {
    failed += 1;
    return;
  }

  if (nbaId) portraits[nbaId] = bestNba || bestEspn || brefOk;
  if (espnId) {
    // ESPN athlete keys must never point at NBA CDN for the ESPN number.
    const espnPortrait = bestEspn || (bestNba && !isCollisionNbaCdn(espnId, bestNba) ? bestNba : null) || brefOk;
    if (espnPortrait) {
      portraits[espnId] = espnPortrait;
      portraits[`espn:${espnId}`] = espnPortrait;
    }
  }
  if (brefSlug) {
    portraits[`bref:${brefSlug}`] = bestNba || bestEspn || brefOk;
  }
  promoted += 1;
});

function isCollisionNbaCdn(key, url) {
  const bare = String(key).startsWith("espn:")
    ? String(key).slice(5)
    : String(key);
  return (
    /^\d+$/.test(bare) &&
    typeof url === "string" &&
    url.includes("cdn.nba.com") &&
    url.includes(`/260x190/${bare}.png`)
  );
}

/** Force alias/legend dual-keys after concurrent writes (authoritative). */
for (const row of [...(aliasesSnap.aliases ?? []), ...(legend.aliases ?? [])]) {
  const nbaId = String(row.nbaPlayerId ?? "").trim();
  const espnId = String(row.espnPlayerId ?? "").trim();
  const brefSlug = String(row.brefSlug ?? "")
    .trim()
    .toLowerCase();
  if (!nbaId && !espnId) continue;

  let nbaPortrait = nbaId ? portraits[nbaId] : null;
  let espnPortrait = espnId ? portraits[espnId] : null;

  if (espnId) {
    const ok = await validate(espnUrl(espnId));
    if (ok) {
      espnPortrait = ok;
      portraits[espnId] = ok;
      portraits[`espn:${espnId}`] = ok;
    }
  }
  if (nbaId && !BLOCKED_NBA_LATEST.has(nbaId)) {
    const ok = await validate(nbaUrl(nbaId));
    if (ok) nbaPortrait = ok;
  }
  if (nbaId) {
    // Prefer real NBA CDN; else alias ESPN; never a foreign ESPN athlete.
    const next =
      nbaPortrait ||
      espnPortrait ||
      (brefSlug ? await validate(brefUrl(brefSlug), SIZE_FLOOR_BREF) : null);
    if (next) portraits[nbaId] = next;
  }
  if (brefSlug && (portraits[nbaId] || portraits[espnId])) {
    portraits[`bref:${brefSlug}`] = portraits[nbaId] || portraits[espnId];
  }
}

// Preserve prior verified keys we didn't re-evaluate, but drop collision-shaped
// ESPN-number→NBA-CDN entries and wrong nba→foreign-espncdn rows for aliased ids.
const prior =
  priorLookup.portraits && typeof priorLookup.portraits === "object"
    ? priorLookup.portraits
    : {};
const aliasedNba = new Map(
  list.filter((p) => p.nbaId && p.espnId).map((p) => [p.nbaId, p.espnId])
);
let preserved = 0;
let droppedCollision = 0;
for (const [key, url] of Object.entries(prior)) {
  if (portraits[key]) continue;
  if (isCollisionNbaCdn(key, url)) {
    droppedCollision += 1;
    continue;
  }
  const bare = key.startsWith("espn:") ? key.slice(5) : key;
  if (
    /^\d+$/.test(bare) &&
    aliasedNba.has(bare) &&
    typeof url === "string" &&
    url.includes("espncdn.com") &&
    !url.includes(`/full/${aliasedNba.get(bare)}.png`)
  ) {
    droppedCollision += 1;
    continue;
  }
  if (typeof url === "string" && url.startsWith("http")) {
    portraits[key] = url;
    preserved += 1;
  }
}

// Attach bref search slugs via unique-name → already-synced NBA portrait
let brefAttached = 0;
for (const p of searchSnap.players ?? []) {
  if (!Array.isArray(p)) continue;
  const id = String(p[0] ?? "");
  if (!id.startsWith("bref:") || portraits[id]) continue;
  const nbaId = nameToNba.get(normalizeName(p[1]));
  if (!nbaId || !portraits[nbaId]) continue;
  portraits[id] = portraits[nbaId];
  brefAttached += 1;
}

// Award / legend slug keys are authoritative when a portrait exists.
for (const [nbaId, slugRaw] of Object.entries(awards.slugs ?? {})) {
  const slug = String(slugRaw ?? "").trim().toLowerCase();
  if (!slug) continue;
  if (portraits[nbaId]) {
    portraits[`bref:${slug}`] = portraits[nbaId];
  } else {
    const ok = await validate(brefUrl(slug), SIZE_FLOOR_BREF);
    if (ok) {
      portraits[`bref:${slug}`] = ok;
      portraits[nbaId] = ok;
      brefFallback += 1;
    }
  }
}
for (const row of legend.aliases ?? []) {
  const nbaId = String(row.nbaPlayerId ?? "").trim();
  const slug = String(row.brefSlug ?? "").trim().toLowerCase();
  if (!nbaId || !slug || !portraits[nbaId]) continue;
  portraits[`bref:${slug}`] = portraits[nbaId];
}

// Historical search coverage: validate BRef headshots for remaining bref: slugs.
const brefSearchSlugs = [];
for (const p of searchSnap.players ?? []) {
  if (!Array.isArray(p)) continue;
  const id = String(p[0] ?? "");
  if (!id.startsWith("bref:") || portraits[id]) continue;
  const slug = id.slice(5).toLowerCase();
  if (/^[a-z0-9]+$/.test(slug)) brefSearchSlugs.push(slug);
}
console.log(
  `[portraits] bref search fill candidates=${brefSearchSlugs.length}…`
);
await mapPool(brefSearchSlugs, 16, async (slug) => {
  const ok = await validate(brefUrl(slug), SIZE_FLOOR_BREF);
  if (!ok) return;
  portraits[`bref:${slug}`] = ok;
  brefFallback += 1;
});

const payload = {
  version: "drbl-player-media-v2",
  updatedAt: new Date().toISOString(),
  note:
    "Validated NBA/ESPN/BRef portraits; dual-key nba+espn+bref; no ESPN-id→NBA-CDN collisions; legend seeds authoritative",
  portraits,
  count: Object.keys(portraits).length,
};

await fs.writeFile(OUT, JSON.stringify(payload));
for (const mirror of [
  path.join(
    ROOT,
    "data",
    "drbl",
    "player-media",
    "drbl-player-media-v2",
    "portrait-lookup.json"
  ),
  path.join(
    ROOT,
    "data",
    "drbl",
    "player-media",
    "drbl-player-media-v1",
    "portrait-lookup.json"
  ),
]) {
  try {
    await fs.mkdir(path.dirname(mirror), { recursive: true });
    await fs.writeFile(mirror, JSON.stringify(payload));
  } catch {
    /* optional */
  }
}

console.log(
  `[portraits] wrote ${OUT} count=${payload.count} promoted=${promoted} failed=${failed} preserved=${preserved} droppedCollision=${droppedCollision} brefAttached=${brefAttached} brefFallback=${brefFallback}`
);
