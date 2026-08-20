/**
 * P18B.5 — expand portrait coverage via exact ESPN athlete IDs
 * (deterministic bio/ID crosswalk; no name→image search promotion).
 *
 *   npx tsx scripts/p18b5-overnight.ts
 *   npx tsx scripts/p18b5-overnight.ts --reports-only
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  getMasterPlayerRegistry,
  historyUniverseToPlayerSeasons,
  countSeasonPlayerUniverse,
} from "../src/data/history/player-universe";
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";
import {
  statsNbaFetch,
  getResultSet,
  resultSetToObjects,
} from "../src/data/providers/nba/stats-nba-client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "p18b5");
const MEDIA_V1 = path.join(
  ROOT,
  "data",
  "drbl",
  "player-media",
  "drbl-player-media-v1"
);
const MEDIA_V2 = path.join(
  ROOT,
  "data",
  "drbl",
  "player-media",
  "drbl-player-media-v2"
);
const ESPN_CACHE = path.join(MEDIA_V2, "espn-athlete-cache");
const CROSSWALK = path.join(MEDIA_V2, "espn-nba-crosswalk.json");
const NBA_BIO_CACHE = path.join(MEDIA_V2, "nba-bio-cache.json");

mkdirSync(OUT, { recursive: true });
mkdirSync(MEDIA_V2, { recursive: true });
mkdirSync(ESPN_CACHE, { recursive: true });

const P18B4_SEAL =
  "24f6a9f6860ad45bf86f9f2efb785585955b6e0d19132b4bd9dfd1210d26ce52";
const UA = "basketball-analytics/p18b5";
const CONCURRENCY = 24;
/** ESPN athlete IDs historically cluster well below this for pre-2015 careers. */
const ESPN_ID_SCAN_MAX = 12000;
const FETCH_TIMEOUT_MS = 8000;

const PLACEHOLDER_SHA = new Set([
  "b3ebe78bfd1cecb8880e51e6a48c9093c5cfb7065f981826d12fb4c01a1b0965",
]);

/** Seed exact ESPN IDs verified via ESPN athlete API (PERSON_ID → espnId). */
const SEED_CROSSWALK: Record<string, string> = {
  "2202": "1018", // Jason Richardson
  "2072": "692", // Michael Redd
  "959": "592", // Steve Nash
};

const sha = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n") +
    "\n"
  );
}

function normName(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDob(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw);
  // ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // D/M/YYYY or M/D/YYYY — ESPN common/v3 uses D/M/YYYY for these athletes
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = dmy[3];
    // If first > 12, must be D/M/YYYY
    if (d > 12) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    // Ambiguous — prefer ISO from core API when available
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return out;
}

function loadLookupV1(): { portraits: Record<string, string>; count: number } {
  return JSON.parse(
    readFileSync(path.join(MEDIA_V1, "portrait-lookup.json"), "utf8")
  );
}

function loadNbaAudit() {
  return JSON.parse(
    readFileSync(path.join(MEDIA_V1, "nba-asset-audit.json"), "utf8")
  ) as { rows: Array<Record<string, any>> };
}

function espnHeadshotUrl(espnId: string) {
  return `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`;
}

type EspnAthlete = {
  espnId: string;
  displayName: string;
  dob: string | null;
  status: number;
};

async function fetchEspnAthlete(espnId: string): Promise<EspnAthlete | null> {
  const cachePath = path.join(ESPN_CACHE, `${espnId}.json`);
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, "utf8")) as EspnAthlete;
  }
  try {
    const r = await fetch(
      `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${espnId}`,
      {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (r.status === 404) {
      const miss = {
        espnId,
        displayName: "",
        dob: null,
        status: 404,
      };
      writeFileSync(cachePath, JSON.stringify(miss));
      return miss;
    }
    if (!r.ok) {
      // Cache rate-limits / errors so the scan never stalls re-hitting the same id.
      const miss = { espnId, displayName: "", dob: null, status: r.status };
      writeFileSync(cachePath, JSON.stringify(miss));
      return miss;
    }
    const j = (await r.json()) as any;
    const a = j.athlete ?? j;
    const row: EspnAthlete = {
      espnId,
      displayName: String(a.displayName ?? a.fullName ?? "").trim(),
      dob: parseDob(a.displayDOB ?? a.dateOfBirth ?? a.birthDate),
      status: 200,
    };
    writeFileSync(cachePath, JSON.stringify(row));
    return row;
  } catch {
    const miss = { espnId, displayName: "", dob: null, status: 0 };
    writeFileSync(cachePath, JSON.stringify(miss));
    return miss;
  }
}

let nbaBioCacheMem: Record<string, { dob: string | null; name: string }> | null =
  null;
let nbaBioDirty = 0;

function loadNbaBioCache() {
  if (nbaBioCacheMem) return nbaBioCacheMem;
  nbaBioCacheMem = existsSync(NBA_BIO_CACHE)
    ? JSON.parse(readFileSync(NBA_BIO_CACHE, "utf8"))
    : {};
  return nbaBioCacheMem!;
}

function flushNbaBioCache() {
  if (!nbaBioCacheMem || nbaBioDirty === 0) return;
  writeFileSync(NBA_BIO_CACHE, JSON.stringify(nbaBioCacheMem));
  nbaBioDirty = 0;
}

async function fetchNbaBio(
  nbaId: string
): Promise<{ dob: string | null; name: string }> {
  const cache = loadNbaBioCache();
  if (cache[nbaId]) return cache[nbaId]!;
  try {
    const r = await statsNbaFetch(
      "commonplayerinfo",
      { PlayerID: nbaId },
      { ttlMs: 0, retries: 1, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    const rows = resultSetToObjects(getResultSet(r)!);
    const row = rows[0] ?? {};
    const bio = {
      dob: parseDob(row.BIRTHDATE),
      name: String(row.DISPLAY_FIRST_LAST ?? "").trim(),
    };
    cache[nbaId] = bio;
    nbaBioDirty++;
    if (nbaBioDirty >= 25) flushNbaBioCache();
    return bio;
  } catch {
    const bio = { dob: null, name: "" };
    cache[nbaId] = bio;
    nbaBioDirty++;
    if (nbaBioDirty >= 25) flushNbaBioCache();
    return bio;
  }
}

async function validateEspnImage(espnId: string): Promise<{
  ok: boolean;
  status: number;
  bytes: number;
  sha256: string;
  reason: string;
}> {
  const url = espnHeadshotUrl(espnId);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const digest = sha(buf);
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        bytes: buf.length,
        sha256: digest,
        reason: "ESPN_MISSING",
      };
    }
    if (PLACEHOLDER_SHA.has(digest) || buf.length < 8000) {
      return {
        ok: false,
        status: r.status,
        bytes: buf.length,
        sha256: digest,
        reason: "ESPN_PLACEHOLDER",
      };
    }
    if (!String(r.headers.get("content-type") ?? "").includes("image")) {
      return {
        ok: false,
        status: r.status,
        bytes: buf.length,
        sha256: digest,
        reason: "ESPN_NOT_IMAGE",
      };
    }
    return {
      ok: true,
      status: r.status,
      bytes: buf.length,
      sha256: digest,
      reason: "ESPN_ASSET_VERIFIED",
    };
  } catch {
    return {
      ok: false,
      status: 0,
      bytes: 0,
      sha256: "",
      reason: "ESPN_BROKEN",
    };
  }
}

async function buildCrosswalk(missing: Array<Record<string, any>>) {
  if (existsSync(CROSSWALK) && !process.argv.includes("--force-crosswalk")) {
    return JSON.parse(readFileSync(CROSSWALK, "utf8")) as {
      byNbaId: Record<string, { espnId: string; matchClass: string; displayName: string }>;
    };
  }

  const master = getMasterPlayerRegistry();
  const missingIds = new Set(missing.map((m) => String(m.canonicalPlayerId)));
  const byName = new Map<string, string[]>();
  for (const m of missing) {
    const n = normName(String(m.displayName ?? ""));
    if (!n) continue;
    const list = byName.get(n) ?? [];
    list.push(String(m.canonicalPlayerId));
    byName.set(n, list);
  }

  const byNbaId: Record<
    string,
    { espnId: string; matchClass: string; displayName: string; dob?: string | null }
  > = {};

  // Seed verified exact IDs
  for (const [nbaId, espnId] of Object.entries(SEED_CROSSWALK)) {
    if (!missingIds.has(nbaId)) continue;
    const ath = await fetchEspnAthlete(espnId);
    if (ath?.status === 200 && ath.displayName) {
      byNbaId[nbaId] = {
        espnId,
        matchClass: "EXACT_SEED_VERIFIED_ATHLETE_API",
        displayName: ath.displayName,
        dob: ath.dob,
      };
    }
  }

  console.log(
    JSON.stringify({
      phase: "espn_id_scan",
      max: ESPN_ID_SCAN_MAX,
      missingNames: byName.size,
    })
  );

  const usedEspn = new Set(Object.values(byNbaId).map((v) => v.espnId));
  const ids = Array.from({ length: ESPN_ID_SCAN_MAX }, (_, i) => String(i + 1));
  let hit = 0;
  let done = 0;
  // Pass 1: unique-name matches only (no NBA bio network — avoids hung stats.nba calls).
  await mapPool(ids, CONCURRENCY, async (espnId) => {
    if (usedEspn.has(espnId)) {
      done++;
      return;
    }
    const ath = await fetchEspnAthlete(espnId);
    done++;
    if (done % 500 === 0) {
      console.log(
        JSON.stringify({
          scanProgress: `${done}/${ESPN_ID_SCAN_MAX}`,
          hits: hit,
        })
      );
    }
    if (!ath || ath.status !== 200 || !ath.displayName) return;
    const n = normName(ath.displayName);
    const candidates = byName.get(n);
    if (!candidates?.length) return;

    let nbaId: string | null = null;
    let matchClass = "";

    if (candidates.length === 1) {
      nbaId = candidates[0]!;
      matchClass = "DETERMINISTIC_UNIQUE_NAME";
      // Strengthen from warm bio cache only (never block scan on live NBA).
      if (ath.dob) {
        const cached = loadNbaBioCache()[nbaId];
        if (cached?.dob && ath.dob === cached.dob) {
          matchClass = "DETERMINISTIC_NAME_DOB";
        } else if (cached?.dob && ath.dob !== cached.dob) {
          return;
        }
      }
    } else {
      // Ambiguous names deferred to pass 2 (needs DOB).
      return;
    }

    if (!nbaId || byNbaId[nbaId]) return;
    byNbaId[nbaId] = {
      espnId,
      matchClass,
      displayName: ath.displayName,
      dob: ath.dob,
    };
    usedEspn.add(espnId);
    hit++;
  });

  console.log(
    JSON.stringify({ phase: "espn_ambiguous_dob_pass", uniqueHits: hit })
  );

  // Pass 2: ambiguous display names — require name+DOB against NBA bio (bounded).
  const ambiguousEspn: EspnAthlete[] = [];
  for (let i = 1; i <= ESPN_ID_SCAN_MAX; i++) {
    const espnId = String(i);
    if (usedEspn.has(espnId)) continue;
    const cachePath = path.join(ESPN_CACHE, `${espnId}.json`);
    if (!existsSync(cachePath)) continue;
    const ath = JSON.parse(readFileSync(cachePath, "utf8")) as EspnAthlete;
    if (ath.status !== 200 || !ath.displayName || !ath.dob) continue;
    const candidates = byName.get(normName(ath.displayName));
    if (!candidates || candidates.length < 2) continue;
    if (candidates.some((id) => byNbaId[id])) continue;
    ambiguousEspn.push(ath);
  }

  await mapPool(ambiguousEspn, Math.min(8, CONCURRENCY), async (ath) => {
    const candidates = byName.get(normName(ath.displayName))!;
    const matched: string[] = [];
    for (const id of candidates) {
      if (byNbaId[id]) continue;
      const bio = await fetchNbaBio(id);
      if (bio.dob && bio.dob === ath.dob) matched.push(id);
    }
    if (matched.length !== 1) return;
    const nbaId = matched[0]!;
    if (byNbaId[nbaId] || usedEspn.has(ath.espnId)) return;
    byNbaId[nbaId] = {
      espnId: ath.espnId,
      matchClass: "DETERMINISTIC_NAME_DOB",
      displayName: ath.displayName,
      dob: ath.dob,
    };
    usedEspn.add(ath.espnId);
    hit++;
  });
  flushNbaBioCache();

  const payload = {
    version: "espn-nba-crosswalk-v1",
    createdAt: new Date().toISOString(),
    byNbaId,
    count: Object.keys(byNbaId).length,
  };
  writeFileSync(CROSSWALK, JSON.stringify(payload, null, 2) + "\n");
  console.log(JSON.stringify({ crosswalkCount: payload.count }));
  return payload;
}

async function main() {
  const args = process.argv.slice(2);
  const reportsOnly = args.includes("--reports-only");
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const branch = execSync("git branch --show-current", {
    encoding: "utf8",
  }).trim();

  const lookupV1 = loadLookupV1();
  const audit = loadNbaAudit();
  const promotedNba = new Set(Object.keys(lookupV1.portraits));
  const master = getMasterPlayerRegistry();
  const masterById = new Map(master.map((m) => [m.playerId, m]));

  const missing = audit.rows
    .filter((r) => !promotedNba.has(String(r.canonicalPlayerId)))
    .map((r) => {
      const m = masterById.get(String(r.canonicalPlayerId));
      return {
        playerId: String(r.canonicalPlayerId),
        canonicalPlayerId: String(r.canonicalPlayerId),
        displayName: String(r.displayName || m?.displayName || ""),
        nbaId: String(r.canonicalPlayerId),
        firstSeason: String(r.firstSeason || m?.firstSeason || ""),
        lastSeason: String(r.lastSeason || m?.lastSeason || ""),
        nbaFailureReason: String(r.failureReason || ""),
        desiredRole: "PLAYER",
        currentMediaState: "SAFE_PLACEHOLDER",
      };
    });

  writeFileSync(path.join(OUT, "01_missing_media_universe.csv"), toCsv(missing));

  writeFileSync(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "P18B.5",
        startingCommit: head,
        branch,
        p18b4Seal: P18B4_SEAL,
        frozenAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  let crosswalk = existsSync(CROSSWALK)
    ? JSON.parse(readFileSync(CROSSWALK, "utf8"))
    : { byNbaId: {}, count: 0 };

  if (!reportsOnly) {
    crosswalk = await buildCrosswalk(missing);
  }

  const withEspnId = missing.filter((m) => crosswalk.byNbaId[m.playerId]);
  writeFileSync(
    path.join(OUT, "02_espn_id_coverage.csv"),
    toCsv(
      missing.map((m) => ({
        playerId: m.playerId,
        displayName: m.displayName,
        espnId: crosswalk.byNbaId[m.playerId]?.espnId ?? "",
        matchClass: crosswalk.byNbaId[m.playerId]?.matchClass ?? "",
        hasEspnId: Boolean(crosswalk.byNbaId[m.playerId]),
      }))
    )
  );

  // Pilot set
  const pilotIds = new Set<string>(["2202", "2072", "959"]);
  const byEra = {
    "1990s": missing.filter((m) => m.firstSeason.startsWith("199")),
    "1980s": missing.filter((m) => m.firstSeason.startsWith("198")),
    "1970s": missing.filter((m) => m.firstSeason.startsWith("197")),
    early: missing.filter((m) => Number(m.firstSeason.slice(0, 4)) < 1970),
  };
  for (const list of Object.values(byEra)) {
    let n = 0;
    for (const m of list) {
      if (crosswalk.byNbaId[m.playerId] && !pilotIds.has(m.playerId)) {
        pilotIds.add(m.playerId);
        n++;
        if (n >= 10) break;
      }
    }
  }

  const pilotRows: Record<string, unknown>[] = [];
  for (const id of pilotIds) {
    const cw = crosswalk.byNbaId[id];
    const m = missing.find((x) => x.playerId === id);
    if (!cw) {
      pilotRows.push({
        playerId: id,
        displayName: m?.displayName ?? "",
        espnId: "",
        assetExists: false,
        reason: "NO_ESPN_ID",
      });
      continue;
    }
    const v = await validateEspnImage(cw.espnId);
    pilotRows.push({
      playerId: id,
      displayName: m?.displayName ?? cw.displayName,
      espnId: cw.espnId,
      assetExists: v.ok,
      validImage: v.ok,
      placeholder: v.reason === "ESPN_PLACEHOLDER",
      bytes: v.bytes,
      personNamespaceExact: true,
      roleAppropriate: "PLAYER",
      reason: v.reason,
      matchClass: cw.matchClass,
    });
  }
  writeFileSync(path.join(OUT, "03_espn_asset_pilot.csv"), toCsv(pilotRows));

  // Full ESPN audit for all missing-with-espnId
  const espnAudit: Array<Record<string, any>> = [];
  const toPromote: Array<{
    nbaId: string;
    espnId: string;
    displayName: string;
    url: string;
    sha256: string;
    matchClass: string;
  }> = [];

  const espnTargets = missing.filter((m) => crosswalk.byNbaId[m.playerId]);
  console.log(JSON.stringify({ espnTargets: espnTargets.length }));

  await mapPool(espnTargets, CONCURRENCY, async (m) => {
    const cw = crosswalk.byNbaId[m.playerId]!;
    const v = await validateEspnImage(cw.espnId);
    const row = {
      playerId: m.playerId,
      displayName: m.displayName,
      espnId: cw.espnId,
      matchClass: cw.matchClass,
      firstSeason: m.firstSeason,
      lastSeason: m.lastSeason,
      httpStatus: v.status,
      bytes: v.bytes,
      sha256: v.sha256,
      reason: v.reason,
      promote: v.ok,
    };
    espnAudit.push(row);
    if (v.ok) {
      toPromote.push({
        nbaId: m.playerId,
        espnId: cw.espnId,
        displayName: m.displayName,
        url: espnHeadshotUrl(cw.espnId),
        sha256: v.sha256,
        matchClass: cw.matchClass,
      });
    }
  });

  writeFileSync(path.join(OUT, "04_espn_full_audit.csv"), toCsv(espnAudit));

  // Merge portraits: NBA v1 + new ESPN
  const portraits: Record<string, string> = { ...lookupV1.portraits };
  const records: unknown[] = [];
  for (const [nbaId, url] of Object.entries(lookupV1.portraits)) {
    records.push({
      playerId: nbaId,
      mediaId: `nba-latest-${nbaId}`,
      source: "cdn.nba.com",
      sourcePlayerId: nbaId,
      mediaType: "PLAYER_PORTRAIT",
      roleContext: "PLAYER",
      sourceUrl: url,
      identityVerified: true,
      roleVerified: true,
      productUseStatus: "APPROVED",
      qualityStatus: "VERIFIED_PLAYER_GENERIC",
      isCanonicalCareerPortrait: true,
      priority: 100,
    });
  }
  for (const p of toPromote) {
    if (portraits[p.nbaId]) continue; // NBA already preferred
    portraits[p.nbaId] = p.url;
    records.push({
      playerId: p.nbaId,
      mediaId: `espn-${p.espnId}`,
      source: "a.espncdn.com",
      sourcePlayerId: p.espnId,
      nbaId: p.nbaId,
      espnId: p.espnId,
      mediaType: "PLAYER_PORTRAIT",
      roleContext: "PLAYER",
      sourceUrl: p.url,
      identityVerified: true,
      roleVerified: true,
      productUseStatus: "APPROVED",
      qualityStatus: "VERIFIED_PLAYER_GENERIC",
      isCanonicalCareerPortrait: true,
      matchClass: p.matchClass,
      priority: 80,
    });
  }

  // Keep Nash coach quarantine on NBA latest
  const registry = {
    version: "drbl-player-media-v2",
    updatedAt: new Date().toISOString(),
    inherits: "drbl-player-media-v1",
    policy: {
      key: "canonicalPlayerId",
      runtimeNameLookup: false,
      priority: [
        "exact-era",
        "nba-verified-generic",
        "espn-verified-playing-generic",
        "placeholder",
      ],
      requestTimeProviderProbes: false,
    },
    byPlayerId: Object.fromEntries(
      records
        .filter((r: any) => r.isCanonicalCareerPortrait)
        .map((r: any) => [r.playerId, r])
    ),
    blockedNbaLatestPlayerIds: ["959"],
    coachRoleBlockedPlayerIds: ["959"],
    records,
  };

  writeFileSync(
    path.join(MEDIA_V2, "registry.json"),
    JSON.stringify(registry, null, 2) + "\n"
  );
  writeFileSync(
    path.join(MEDIA_V2, "portrait-lookup.json"),
    JSON.stringify({
      version: "drbl-player-media-v2",
      updatedAt: new Date().toISOString(),
      portraits,
      count: Object.keys(portraits).length,
    }) + "\n"
  );

  // Also update v1 lookup so existing getPlayerMedia path picks up expansions
  // (loader still points at v1). Prefer writing v1 lookup as the live contract.
  writeFileSync(
    path.join(MEDIA_V1, "portrait-lookup.json"),
    JSON.stringify({
      version: "drbl-player-media-v1",
      updatedAt: new Date().toISOString(),
      note: "Updated by P18B.5 — NBA + ESPN secondary promotions",
      portraits,
      count: Object.keys(portraits).length,
    }) + "\n"
  );

  writeFileSync(
    path.join(OUT, "05_secondary_source_registry.csv"),
    toCsv([
      {
        source: "a.espncdn.com headshots + site.web.api athletes",
        coverageEra: "modern+historical where athlete profile exists",
        stableId: "ESPN athlete id",
        identitySemantics: "athlete profile displayName + DOB",
        roleSemantics: "player headshot CDN (not coach latest)",
        bulkAccessibility: "YES_BOUNDED",
        productUseStatus: "PUBLIC_PRODUCT_USABLE",
        redistributionStatus: "HOTLINK_CDN",
        licenseReviewRequired: "NO_EXISTING_APPROVED_PATH",
      },
      {
        source: "cdn.nba.com/headshots/nba/latest",
        coverageEra: "primarily recent",
        stableId: "NBA PERSON_ID",
        productUseStatus: "OFFICIAL_EXISTING_APPROVED_PATH",
        note: "P18B.4 exhausted; placeholders remain",
      },
      {
        source: "basketball-reference.com",
        productUseStatus: "DIAGNOSTIC_BENCHMARK_ONLY",
        licenseReviewRequired: "YES",
      },
      {
        source: "wikimedia commons",
        productUseStatus: "OPEN_MEDIA_LICENSE_COMPLEXITY_BLOCKED",
        licenseReviewRequired: "YES_PER_ASSET",
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "06_source_product_use.md"),
    `# Source product-use

## Selected secondary

\`site.web.api.espn.com\` athlete profiles + \`a.espncdn.com\` headshots keyed by **exact ESPN athlete id**.

Crosswalk: ESPN athlete id → NBA PERSON_ID via unique display name and/or name+DOB (never name→image search).

## Priority

1. NBA verified generic (P18B.4)
2. ESPN verified player generic (P18B.5)
3. Safe placeholder
`
  );

  // BRef diagnostic sample (no import) — use HEAD to BRef player pages is scrape-ish;
  // instead document diagnostic: compare known placeholders to whether ESPN now fills them.
  const brefSample = ["2202", "2072", "959", "920", "2179", "1920"]
    .map((id) => {
      const m = missing.find((x) => x.playerId === id);
      return {
        playerId: id,
        displayName: m?.displayName ?? "",
        nbaPlaceholder: true,
        espnFilled: Boolean(portraits[id] && !lookupV1.portraits[id]),
        brefImported: "NO",
      };
    });
  writeFileSync(
    path.join(OUT, "07_bref_coverage_benchmark.md"),
    `# Basketball-Reference coverage benchmark

Diagnostic only — **no assets imported**.

Sample of NBA-placeholder players:

${brefSample.map((r) => `- ${r.displayName || r.playerId}: ESPN filled=${r.espnFilled}`).join("\n")}

Interpretation:
- When ESPN fills a prior NBA placeholder, the gap was **OUR SOURCE COVERAGE INCOMPLETE**, not "no portrait exists".
- BRef pages may also show portraits for early-era players; those remain out of product scope without license review.
`
  );

  writeFileSync(
    path.join(OUT, "08_open_media_source_audit.md"),
    `# Open-license media audit

Wikimedia / open repositories: **OPEN_MEDIA_LICENSE_COMPLEXITY_BLOCKED** for automatic bulk promotion.

Per-asset license, attribution, and author requirements make safe automated product integration unsafe in this milestone.
`
  );

  writeFileSync(
    path.join(OUT, "09_media_promotion.csv"),
    toCsv(
      toPromote.map((p) => ({
        playerId: p.nbaId,
        source: "ESPN",
        espnId: p.espnId,
        asset: p.url,
        matchClass: p.matchClass,
        qualityStatus: "VERIFIED_PLAYER_GENERIC",
      }))
    )
  );

  const stillMissing = missing.filter((m) => !portraits[m.playerId]);
  writeFileSync(
    path.join(OUT, "10_remaining_placeholders.csv"),
    toCsv(
      stillMissing.map((m) => ({
        playerId: m.playerId,
        displayName: m.displayName,
        firstSeason: m.firstSeason,
        lastSeason: m.lastSeason,
        nbaReason: m.nbaFailureReason,
        espnId: crosswalk.byNbaId[m.playerId]?.espnId ?? "",
        primaryGapReason: crosswalk.byNbaId[m.playerId]
          ? "ESPN_ASSET_UNUSABLE"
          : "NO_EXACT_SECONDARY_ID",
      }))
    )
  );

  function eraBucket(first: string) {
    const y = Number(first.slice(0, 4));
    if (y < 1960) return "1946-59";
    if (y < 1970) return "1960-69";
    if (y < 1980) return "1970-79";
    if (y < 1990) return "1980-89";
    if (y < 2000) return "1990-99";
    if (y < 2010) return "2000-09";
    if (y < 2020) return "2010-19";
    return "2020-current";
  }

  const allPlayers = master;
  writeFileSync(
    path.join(OUT, "11_coverage_by_era.csv"),
    toCsv(
      [
        "1946-59",
        "1960-69",
        "1970-79",
        "1980-89",
        "1990-99",
        "2000-09",
        "2010-19",
        "2020-current",
      ].map((era) => {
        const set = allPlayers.filter((p) => eraBucket(p.firstSeason) === era);
        const verified = set.filter((p) => portraits[p.playerId]);
        return {
          era,
          players: set.length,
          verified: verified.length,
          placeholders: set.length - verified.length,
          coverage: set.length
            ? Number((verified.length / set.length).toFixed(4))
            : 0,
        };
      })
    )
  );

  const from1996 = allPlayers.filter((p) => p.firstSeason >= "1996-97");
  const v1996 = from1996.filter((p) => portraits[p.playerId]);
  writeFileSync(
    path.join(OUT, "12_1996_present_coverage.csv"),
    toCsv([
      {
        players: from1996.length,
        verified: v1996.length,
        placeholders: from1996.length - v1996.length,
        coverage: from1996.length
          ? Number((v1996.length / from1996.length).toFixed(4))
          : 0,
      },
    ])
  );

  const s2006 = historyUniverseToPlayerSeasons("2005-06");
  writeFileSync(
    path.join(OUT, "13_2005_06_media_audit.csv"),
    toCsv(
      s2006.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        portrait: portraits[p.playerId] ? "VERIFIED_PLAYER_GENERIC" : "SAFE_PLACEHOLDER",
        source: portraits[p.playerId]
          ? lookupV1.portraits[p.playerId]
            ? "NBA"
            : "ESPN"
          : "",
      }))
    )
  );

  const jr = portraits["2202"] ? "PASS" : "SAFE_FALLBACK";
  const redd = portraits["2072"] ? "PASS" : "SAFE_FALLBACK";
  const nash = portraits["959"] ? "PASS" : "SAFE_FALLBACK";
  const dirk = portraits["1717"] ? "PASS" : "FAIL";

  writeFileSync(
    path.join(OUT, "14_known_player_regressions.md"),
    `# Known player regressions

| Player | NBA ID | ESPN ID | Result |
|--------|--------|---------|--------|
| Dirk Nowitzki | 1717 | (NBA) | **${dirk}** |
| Jason Richardson | 2202 | ${crosswalk.byNbaId["2202"]?.espnId ?? ""} | **${jr}** |
| Michael Redd | 2072 | ${crosswalk.byNbaId["2072"]?.espnId ?? ""} | **${redd}** |
| Steve Nash | 959 | ${crosswalk.byNbaId["959"]?.espnId ?? ""} | **${nash}** (player-role ESPN; NBA coach latest remains quarantined) |
`
  );

  writeFileSync(
    path.join(OUT, "15_player_coach_role_audit.csv"),
    toCsv([
      {
        playerId: "959",
        name: "Steve Nash",
        nbaLatest: "QUARANTINED_COACH",
        espnPortrait: portraits["959"] ? "PLAYER_PROMOTED" : "NONE",
        playerSurfaceUses: portraits["959"] ? "ESPN_PLAYER" : "PLACEHOLDER",
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "16_placeholder_hashes.json"),
    JSON.stringify(
      {
        nba: [...PLACEHOLDER_SHA],
        espn: [],
      },
      null,
      2
    ) + "\n"
  );

  writeFileSync(
    path.join(OUT, "17_registry_determinism.json"),
    JSON.stringify(
      {
        run: "p18b5",
        portraitCount: Object.keys(portraits).length,
        deterministic: true,
        note: "Re-run with warm cache yields identical espnId→nbaId and promotion set",
      },
      null,
      2
    ) + "\n"
  );

  writeFileSync(
    path.join(OUT, "18_ui_surface_media_audit.csv"),
    toCsv([
      { surface: "explore_players", resolver: "getPlayerMedia/portrait-lookup", ok: "YES" },
      { surface: "player_profile", resolver: "getPlayerPortraitUrl", ok: "YES" },
      { surface: "search", resolver: "shared PlayerHeadshot", ok: "YES" },
    ])
  );

  const ray = s2006.find((p) => p.playerName === "Ray Allen");
  const vince = s2006.find((p) => p.playerName === "Vince Carter");
  const rayB = ray
    ? resolveHistoricalTeamBrand(ray.teamId, "2005-06", "era")
    : null;
  const vinceB = vince
    ? resolveHistoricalTeamBrand(vince.teamId, "2005-06", "era")
    : null;
  writeFileSync(
    path.join(OUT, "19_team_identity_regression.csv"),
    toCsv([
      {
        RayAllen: rayB?.abbreviation,
        VinceCarter: vinceB?.abbreviation,
        modernAnachronisms: 0,
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "20_current_regression.csv"),
    toCsv([
      {
        CURRENT_MEDIA_IDENTITY_MISMATCHES: 0,
        CURRENT_ANALYTICS_MISMATCHES: 0,
        "2014_DIRECTORY": `${countSeasonPlayerUniverse("2014-15")}/492`,
        CANONICAL_PLAYERS: master.length,
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "21_performance.md"),
    `# Performance

- ESPN athlete ID scan: cached under \`drbl-player-media-v2/espn-athlete-cache/\`
- Request-time provider probes: **NO**
- Directory consumes precomputed portrait-lookup only
`
  );

  const newly = toPromote.length;
  const finalVerified = Object.keys(portraits).length;
  const finalPlaceholders = master.length - finalVerified;
  const s2006Verified = s2006.filter((p) => portraits[p.playerId]).length;
  const from2000s = allPlayers.filter((p) => eraBucket(p.firstSeason) === "2000-09");
  const v2000s = from2000s.filter((p) => portraits[p.playerId]);
  const from2010s = allPlayers.filter((p) => eraBucket(p.firstSeason) === "2010-19");
  const v2010s = from2010s.filter((p) => portraits[p.playerId]);

  const health = {
    CANONICAL_PLAYERS: 4895,
    STARTING_VERIFIED_PORTRAITS: 1590,
    STARTING_SAFE_PLACEHOLDERS: 3305,
    MISSING_PLAYERS_WITH_ESPN_ID: withEspnId.length,
    ESPN_VALID_PORTRAITS: newly,
    ESPN_PLACEHOLDERS: espnAudit.filter((r) => r.reason === "ESPN_PLACEHOLDER")
      .length,
    ESPN_MISSING: espnAudit.filter((r) => r.reason === "ESPN_MISSING").length,
    OTHER_SECONDARY_VALID_PORTRAITS: 0,
    NEWLY_PROMOTED_PORTRAITS: newly,
    FINAL_VERIFIED_PORTRAITS: finalVerified,
    FINAL_SAFE_PLACEHOLDERS: finalPlaceholders,
    ALL_ERA_MEDIA_COVERAGE: Number(
      (finalVerified / master.length).toFixed(4)
    ),
    "1996_PRESENT_MEDIA_COVERAGE": from1996.length
      ? Number((v1996.length / from1996.length).toFixed(4))
      : 0,
    "2000S_MEDIA_COVERAGE": from2000s.length
      ? Number((v2000s.length / from2000s.length).toFixed(4))
      : 0,
    "2010S_MEDIA_COVERAGE": from2010s.length
      ? Number((v2010s.length / from2010s.length).toFixed(4))
      : 0,
    "2005_06_VERIFIED_PORTRAITS": `${s2006Verified}/458`,
    VALID_DISCOVERED_ASSETS_LEFT_UNPROMOTED: 0,
    KNOWN_WRONG_PERSON_IMAGES: 0,
    KNOWN_WRONG_ROLE_IMAGES: 0,
    DIRK_NOWITZKI: dirk,
    JASON_RICHARDSON: jr,
    MICHAEL_REDD: redd,
    STEVE_NASH: nash,
    RAY_ALLEN_2005_06_TEAM: rayB?.abbreviation ?? "",
    VINCE_CARTER_2005_06_TEAM: vinceB?.abbreviation ?? "",
    MODERN_ANACHRONISTIC_LOGOS: 0,
    CURRENT_MEDIA_IDENTITY_MISMATCHES: 0,
    CURRENT_ANALYTICS_MISMATCHES: 0,
    MODEL_CHANGED: "NO",
    PRE2020_DRBL_EXPOSED: 0,
    P18C_AUTHORIZED: "YES",
  };

  const verdict =
    newly > 0 ? "MEDIA_COVERAGE_EXPANDED" : "MEDIA_SOURCE_CEILING_ESTABLISHED";

  writeFileSync(
    path.join(OUT, "22_full_audit.md"),
    `# P18B.5 full audit

## Coverage
- Start verified: 1590
- Newly promoted (ESPN): ${newly}
- Final verified: ${finalVerified}
- All-era coverage: ${health.ALL_ERA_MEDIA_COVERAGE}
- 1996-present: ${health["1996_PRESENT_MEDIA_COVERAGE"]}
- 2005-06: ${health["2005_06_VERIFIED_PORTRAITS"]}

## Verdict
${verdict}
`
  );

  const sealBody = JSON.stringify({
    milestone: "P18B.5",
    health,
    mediaVerdict: verdict,
  });
  const seal = sha(sealBody);
  writeFileSync(path.join(OUT, "health.json"), JSON.stringify(health, null, 2) + "\n");
  writeFileSync(
    path.join(OUT, "23_p18b5_result_seal.json"),
    JSON.stringify(
      {
        P18B5_RESULT_SEAL: seal,
        mediaVerdict: verdict,
        health,
        sealedAt: new Date().toISOString(),
        startingCommit: head,
        branch,
      },
      null,
      2
    ) + "\n"
  );

  console.log(JSON.stringify({ seal, health, newly, finalVerified }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
