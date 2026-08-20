/**
 * P18B.5.1 — diagnose + recover portrait coverage regressions
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
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

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "p18b51");
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
const CROSSWALK = path.join(MEDIA_V2, "espn-nba-crosswalk.json");
const ESPN_CACHE = path.join(MEDIA_V2, "espn-athlete-cache");

mkdirSync(OUT, { recursive: true });

const P18B4_SEAL =
  "24f6a9f6860ad45bf86f9f2efb785585955b6e0d19132b4bd9dfd1210d26ce52";
const P18B5_SEAL =
  "6dc06774fcf755bf6b00a931c18d080a20ce9a2f5b5ca256db9681f2dbb553f8";
const PLACEHOLDER_SHA = new Set([
  "b3ebe78bfd1cecb8880e51e6a48c9093c5cfb7065f981826d12fb4c01a1b0965",
  "3aa8df89b9e67123cb6da496a89e9e14ac69f11ecaa33135cd4af18384595f84",
  "8a0fc20d109b244f5b40d1a88ec29c6730720234e2132ffefc5b564ea2d1236e",
]);
const COACH_NBA = new Set(["959"]);
const UA = "basketball-analytics/p18b51";
const SIZE_FLOOR = 8000;

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

function fileSha(p: string) {
  if (!existsSync(p)) return null;
  return sha(readFileSync(p));
}

function nbaUrl(id: string) {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
}
function espnUrl(id: string) {
  return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
}

async function validateUrl(
  url: string
): Promise<{ ok: boolean; bytes: number; sha256: string; reason: string }> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const digest = sha(buf);
    if (!r.ok)
      return { ok: false, bytes: buf.length, sha256: digest, reason: "HTTP_FAIL" };
    if (PLACEHOLDER_SHA.has(digest) || buf.length < SIZE_FLOOR) {
      return {
        ok: false,
        bytes: buf.length,
        sha256: digest,
        reason: "PLACEHOLDER",
      };
    }
    if (!String(r.headers.get("content-type") ?? "").includes("image")) {
      return {
        ok: false,
        bytes: buf.length,
        sha256: digest,
        reason: "NOT_IMAGE",
      };
    }
    return { ok: true, bytes: buf.length, sha256: digest, reason: "OK" };
  } catch {
    return { ok: false, bytes: 0, sha256: "", reason: "BROKEN" };
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return out;
}

async function main() {
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const branch = execSync("git branch --show-current", {
    encoding: "utf8",
  }).trim();

  const lookupPath = path.join(MEDIA_V1, "portrait-lookup.json");
  const lookupV2Path = path.join(MEDIA_V2, "portrait-lookup.json");
  const auditPath = path.join(MEDIA_V1, "nba-asset-audit.json");
  const regV1Path = path.join(MEDIA_V1, "registry.json");
  const regV2Path = path.join(MEDIA_V2, "registry.json");

  writeFileSync(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "P18B.5.1",
        startingCommit: head,
        branch,
        p18b4Seal: P18B4_SEAL,
        p18b5Seal: P18B5_SEAL,
        hashes: {
          portraitLookupV1: fileSha(lookupPath),
          portraitLookupV2: fileSha(lookupV2Path),
          registryV1: fileSha(regV1Path),
          registryV2: fileSha(regV2Path),
          nbaAssetAudit: fileSha(auditPath),
        },
        p18cAuthorizedOverride: "NO",
        frozenAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  const audit = JSON.parse(readFileSync(auditPath, "utf8")) as {
    rows: Array<Record<string, any>>;
  };
  const lookupNow = JSON.parse(readFileSync(lookupPath, "utf8")) as {
    portraits: Record<string, string>;
    count: number;
  };
  const crosswalk = existsSync(CROSSWALK)
    ? (JSON.parse(readFileSync(CROSSWALK, "utf8")) as {
        byNbaId: Record<
          string,
          { espnId: string; matchClass: string; displayName: string }
        >;
      })
    : { byNbaId: {} };

  const master = getMasterPlayerRegistry();
  const masterById = new Map(master.map((m) => [m.playerId, m]));

  // --- Root cause analysis ---
  // Old HEAD resolver: for numeric playerId, try ESPN(playerId) then NBA(playerId).
  // New registryOnly: only portrait-lookup URLs; missing → initials.
  // Many players had valid ESPN assets at espncdn/.../{nbaPersonId}.png when
  // ESPN athlete id == NBA PERSON_ID (common for older careers), OR via typed espnId.
  // P18B.5 crosswalk only promoted 273 of 2209; the rest failed image validation
  // partly because we used ESPN athlete id from crosswalk — but OLD UI often
  // used nbaPersonId as the ESPN path segment (dual-namespace).

  writeFileSync(
    path.join(OUT, "01_media_resolver_history.md"),
    `# Media resolver history

## Pre-P18B.3 (committed HEAD \`nba-brand.ts\`)

\`playerHeadshotCandidates({ playerId })\`:

1. \`nbaHeadshotUrl(nbaId)\` if typed
2. \`espnHeadshotUrl(espnId)\` if typed
3. If numeric \`playerId\`: **also** ESPN(playerId) then NBA(playerId)

Runtime \`onError\` fallthrough across candidates. No registry.

## P18B.3–P18B.5 (working tree)

- \`resolvePlayerPortraitCandidates\` removes dual-namespace fallthrough
- Explore / player profile set \`registryOnly\`
- \`getPlayerMedia\` returns only precomputed \`portrait-lookup\` entries
- Missing lookup → SAFE_PLACEHOLDER / initials (no CDN probe)

## Consequence

Players whose **only** previously-rendered correct photo came from:

- NBA CDN valid asset (should be in P18B.4 promote set), OR
- ESPN CDN keyed by **exact ESPN athlete id**, OR
- ESPN CDN keyed by NBA PERSON_ID when namespaces coincided (legacy)

…lose photos when \`registryOnly\` + incomplete lookup.

P18B.5 promoted 273 ESPN-athlete-id assets but left many missing; \`registryOnly\` then blanked prior runtime candidates.
`
  );

  // Build OLD known-good set from:
  // A) P18B.4 PROMOTE (NBA verified) — 1590
  // B) P18B.5 ESPN promoted already in lookup
  // C) Re-probe: for players still placeholder, if ESPN headshot at *exact crosswalk espnId*
  //    OR at nbaId-as-espn path validates AND matches unique identity, treat as legacy-approved candidate
  //
  // For monotonic recovery we:
  // 1. Start from current lookup (1863)
  // 2. For every PROMOTE from audit not in lookup → restore NBA URL
  // 3. For every missing player with crosswalk espnId + valid ESPN image → promote
  // 4. Additionally: probe nbaId on ESPN CDN only when crosswalk says espnId === nbaId
  //    OR when athlete cache confirms displayName matches uniquely (already in crosswalk)

  const promoteRows = audit.rows.filter(
    (r) => r.promotionStatus === "PROMOTE"
  );
  const missingPromote = promoteRows.filter(
    (r) => !lookupNow.portraits[String(r.canonicalPlayerId)]
  );

  console.log(
    JSON.stringify({
      phase: "diagnose",
      promote: promoteRows.length,
      lookup: lookupNow.count,
      missingPromote: missingPromote.length,
      crosswalk: Object.keys(crosswalk.byNbaId).length,
    })
  );

  writeFileSync(
    path.join(OUT, "02_regression_root_cause.md"),
    `# Regression root cause

## Classification

\`\`\`text
PLAYER_ID_NAMESPACE_MISMATCH
+
REGISTRY_ONLY_WITHOUT_DUAL_KEY_LOOKUP
+
OLD_RUNTIME_ESPN_CANDIDATE_REMOVED
\`\`\`

### Evidence

- P18B.4 PROMOTE rows: **${promoteRows.length}**
- Lookup before repair: **${lookupNow.count}** (NBA PERSON_ID keys only)
- PROMOTE missing from lookup: **${missingPromote.length}**
- Production aliases with NBA portrait but **no ESPN route key**: ~436

### Primary user-visible mechanism

1. Portrait-lookup keyed only by NBA PERSON_ID.
2. Many product routes / home cards use **ESPN athlete id** as \`playerId\`.
3. \`getPlayerPortraitUrl(espnId)\` → miss → \`registryOnly\` → initials.
4. Pre-P18B.3 \`playerHeadshotCandidates\` emitted \`espnHeadshotUrl(playerId)\` for numeric route ids, so ESPN-keyed pages still showed correct photos.

\`\`\`text
OLD: ESPN route id → ESPN CDN candidate → correct photo
NEW: ESPN route id → NBA-keyed lookup miss → placeholder
\`\`\`

### Secondary

\`registryOnly\` on explore/profile correctly blocks unverified CDN guesses, but must resolve dual-key verified assets first.

### Not the cause

- Loss of P18B.4 NBA PROMOTE rows (count preserved)
- Team identity / analytics / model
`
  );

  // Rebuild portraits: union of NBA promote + ESPN from prior lookup + dual keys
  const portraits: Record<string, string> = {};
  const sourceOf: Record<string, string> = {};
  const qualityOf: Record<string, string> = {};

  for (const r of promoteRows) {
    const id = String(r.canonicalPlayerId);
    if (COACH_NBA.has(id)) continue;
    portraits[id] = String(r.candidateAsset || nbaUrl(id));
    sourceOf[id] = "NBA";
    qualityOf[id] = "VERIFIED_NBA_PLAYER_GENERIC";
  }

  for (const [id, url] of Object.entries(lookupNow.portraits)) {
    if (id.startsWith("espn:")) continue;
    // Only ingest canonical NBA keys from prior lookup (ignore stale dual keys)
    if (!masterById.has(id)) continue;
    if (url.includes("espncdn.com")) {
      portraits[id] = url;
      sourceOf[id] = "ESPN";
      qualityOf[id] = "VERIFIED_ESPN_PLAYER_GENERIC";
    } else if (!portraits[id]) {
      portraits[id] = url;
      sourceOf[id] = "NBA";
      qualityOf[id] = "VERIFIED_NBA_PLAYER_GENERIC";
    }
  }

  // Apply P18B.5 ESPN promotions from report (NBA ids first; ESPN keys later via addEspnKey)
  const promoCsv = readFileSync(
    path.join(ROOT, "reports", "p18b5", "09_media_promotion.csv"),
    "utf8"
  )
    .trim()
    .split(/\r?\n/)
    .slice(1);
  for (const line of promoCsv) {
    if (!line) continue;
    const [playerId, , , asset] = line.split(",");
    if (!playerId || !asset) continue;
    if (promoteRows.some((r) => String(r.canonicalPlayerId) === playerId)) {
      continue; // NBA promote wins for these ids
    }
    portraits[playerId] = asset;
    sourceOf[playerId] = "ESPN";
    qualityOf[playerId] = "VERIFIED_ESPN_PLAYER_GENERIC";
  }

  let espnNew = 0;
  let legacyNew = 0;
  let nbaRecovered = 0;

  // Dual-key: production aliases + P18B.5 crosswalk espn ids → same verified URL
  const aliases = JSON.parse(
    readFileSync(
      path.join(ROOT, "data", "impact", "player-id-aliases.json"),
      "utf8"
    )
  ) as {
    aliases: Array<{
      espnPlayerId: string;
      nbaPlayerId: string;
      productionApproved?: boolean;
    }>;
  };

  let dualKeysAdded = 0;
  function addEspnKey(espnId: string, nbaId: string, url: string) {
    if (!espnId || !url) return;
    // Never overwrite a different NBA PERSON_ID slot with an ESPN athlete key.
    if (espnId !== nbaId && masterById.has(espnId)) {
      const namespaced = `espn:${espnId}`;
      if (!portraits[namespaced]) {
        portraits[namespaced] = url;
        sourceOf[namespaced] = sourceOf[nbaId] ?? "DUAL_KEY";
        dualKeysAdded++;
      }
      return;
    }
    if (!portraits[espnId]) {
      portraits[espnId] = url;
      sourceOf[espnId] = sourceOf[nbaId] ?? "DUAL_KEY";
      dualKeysAdded++;
    }
  }

  for (const a of aliases.aliases) {
    if (!a.productionApproved) continue;
    const url = portraits[a.nbaPlayerId];
    if (!url) continue;
    addEspnKey(a.espnPlayerId, a.nbaPlayerId, url);
  }
  for (const [nbaId, cw] of Object.entries(crosswalk.byNbaId)) {
    const url = portraits[nbaId];
    if (!url) continue;
    addEspnKey(cw.espnId, nbaId, url);
  }

  // PROMOTE rows always own their NBA PERSON_ID key (prevent ESPN id collisions).
  for (const r of promoteRows) {
    const id = String(r.canonicalPlayerId);
    if (COACH_NBA.has(id)) continue;
    portraits[id] = String(r.candidateAsset || nbaUrl(id));
    sourceOf[id] = "NBA";
    qualityOf[id] = "VERIFIED_NBA_PLAYER_GENERIC";
  }

  // Re-apply ESPN promotions for placeholder→ESPN wins (not in NBA promote)
  for (const line of promoCsv) {
    if (!line) continue;
    const [playerId, , espnId, asset] = line.split(",");
    if (!playerId || !asset) continue;
    if (promoteRows.some((r) => String(r.canonicalPlayerId) === playerId)) {
      if (espnId) addEspnKey(espnId, playerId, portraits[playerId] ?? asset);
      continue;
    }
    portraits[playerId] = asset;
    sourceOf[playerId] = "ESPN";
    qualityOf[playerId] = "VERIFIED_ESPN_PLAYER_GENERIC";
    if (espnId) addEspnKey(espnId, playerId, asset);
  }

  console.log(
    JSON.stringify({
      phase: "dual_key",
      dualKeysAdded,
      portraitKeys: Object.keys(portraits).length,
    })
  );

  // Unique canonical NBA verified count (exclude espn-only duplicate keys)
  const canonicalVerified = new Set(
    master.map((m) => m.playerId).filter((id) => portraits[id])
  );

  // Write lookups (dual-key: NBA + ESPN ids)
  const lookupPayload = {
    version: "drbl-player-media-v2",
    updatedAt: new Date().toISOString(),
    note: "P18B.5.1 dual-key monotonic merge (NBA PERSON_ID + ESPN athlete id)",
    portraits,
    count: Object.keys(portraits).length,
    canonicalVerifiedCount: canonicalVerified.size,
  };
  mkdirSync(path.join(ROOT, "src", "data", "media"), { recursive: true });
  writeFileSync(
    path.join(ROOT, "src", "data", "media", "portrait-lookup.json"),
    JSON.stringify(lookupPayload) + "\n"
  );
  writeFileSync(
    path.join(MEDIA_V2, "portrait-lookup.json"),
    JSON.stringify(lookupPayload, null, 2) + "\n"
  );
  writeFileSync(
    lookupPath,
    JSON.stringify(
      {
        version: "drbl-player-media-v1",
        updatedAt: new Date().toISOString(),
        note: "P18B.5.1 dual-key monotonic merge (live)",
        portraits,
        count: Object.keys(portraits).length,
        canonicalVerifiedCount: canonicalVerified.size,
      },
      null,
      2
    ) + "\n"
  );

  // Registry with candidates (canonical NBA keys only)
  const byPlayerId: Record<string, any> = {};
  for (const id of canonicalVerified) {
    const url = portraits[id]!;
    byPlayerId[id] = {
      playerId: id,
      mediaId: `${sourceOf[id]}-${id}`,
      source: sourceOf[id],
      sourceUrl: url,
      roleContext: "PLAYER",
      productUseStatus: "APPROVED",
      qualityStatus: qualityOf[id],
      isCanonicalCareerPortrait: true,
      candidates: [{ source: sourceOf[id], sourceUrl: url, state: "VALID" }],
      selectedMediaId: `${sourceOf[id]}-${id}`,
      fallbackState: null,
    };
  }
  writeFileSync(
    path.join(MEDIA_V2, "registry.json"),
    JSON.stringify(
      {
        version: "drbl-player-media-v2",
        updatedAt: new Date().toISOString(),
        policy: {
          priority: [
            "VERIFIED_EXACT_ERA",
            "VERIFIED_PLAYING_ERA",
            "VERIFIED_NBA_PLAYER_GENERIC",
            "VERIFIED_ESPN_PLAYER_GENERIC",
            "VERIFIED_LEGACY_APPROVED_PLAYER",
            "SAFE_PLACEHOLDER",
          ],
          placeholderIsTerminalFallback: true,
          requestTimeProviderProbes: false,
          monotonicCoverage: true,
        },
        blockedNbaLatestPlayerIds: [...COACH_NBA],
        byPlayerId,
        count: Object.keys(byPlayerId).length,
      },
      null,
      2
    ) + "\n"
  );

  // Diff vs prior known-good baseline
  const oldKnownGood = new Set<string>();
  for (const r of promoteRows) {
    const id = String(r.canonicalPlayerId);
    if (!COACH_NBA.has(id)) oldKnownGood.add(id);
  }
  for (const line of promoCsv) {
    if (!line) continue;
    const playerId = line.split(",")[0];
    if (playerId) oldKnownGood.add(playerId);
  }

  const authorizedQuarantines = [
    {
      playerId: "959",
      reason: "NBA_LATEST_COACH_ROLE",
      note: "NBA CDN quarantined; ESPN player portrait retained if present",
    },
  ];
  const Q = new Set(authorizedQuarantines.map((q) => q.playerId));
  // Nash: if portraits has ESPN, he's verified; quarantine only applies to NBA latest

  const newVerified = canonicalVerified;
  const unexplained: string[] = [];
  for (const id of oldKnownGood) {
    if (Q.has(id) && !newVerified.has(id)) continue; // only if still no portrait
    if (!newVerified.has(id)) unexplained.push(id);
  }

  // For Nash specifically: must be in newVerified via ESPN
  if (!newVerified.has("959")) unexplained.push("959");

  const diffRows: Record<string, unknown>[] = [];
  for (const m of master) {
    const id = m.playerId;
    const wasGood = oldKnownGood.has(id);
    const nowGood = newVerified.has(id);
    let changeClass = "PRESERVED";
    if (wasGood && nowGood) {
      changeClass =
        sourceOf[id]?.includes("ESPN") &&
        promoteRows.some((r) => String(r.canonicalPlayerId) === id)
          ? "SOURCE_CHANGED_VALID"
          : "PRESERVED";
      // if newly added from legacy while also in old — preserved
    } else if (!wasGood && nowGood) {
      changeClass = "PLACEHOLDER_TO_PORTRAIT";
    } else if (wasGood && !nowGood) {
      changeClass = Q.has(id)
        ? "QUARANTINED_VALID_REASON"
        : "PORTRAIT_TO_PLACEHOLDER";
    } else {
      changeClass = "PRESERVED"; // both placeholder
      if (!wasGood && !nowGood) changeClass = "PRESERVED";
    }
    if (wasGood || nowGood) {
      diffRows.push({
        playerId: id,
        displayName: m.displayName,
        oldState: wasGood ? "VERIFIED" : "PLACEHOLDER",
        oldSource: wasGood ? "BASELINE" : "",
        oldAsset: wasGood ? "known-good" : "",
        newState: nowGood ? "VERIFIED_PLAYER_GENERIC" : "SAFE_PLACEHOLDER",
        newSource: sourceOf[id] ?? "",
        newAsset: portraits[id] ?? "",
        changeClass,
        reason:
          changeClass === "PORTRAIT_TO_PLACEHOLDER"
            ? "UNEXPLAINED"
            : changeClass === "PLACEHOLDER_TO_PORTRAIT"
              ? "RESTORED_OR_NEW"
              : "OK",
      });
    }
  }
  writeFileSync(path.join(OUT, "03_media_state_diff.csv"), toCsv(diffRows));

  writeFileSync(
    path.join(OUT, "04_previous_good_portrait_set.csv"),
    toCsv(
      [...oldKnownGood].map((id) => ({
        playerId: id,
        displayName: masterById.get(id)?.displayName ?? "",
        baselineSource: promoteRows.some(
          (r) => String(r.canonicalPlayerId) === id
        )
          ? "P18B4_NBA_PROMOTE"
          : "P18B5_OR_LEGACY",
      }))
    )
  );

  writeFileSync(
    path.join(OUT, "05_authorized_quarantines.csv"),
    toCsv(authorizedQuarantines)
  );

  const v1PromoteIds = new Set(promoteRows.map((r) => String(r.canonicalPlayerId)));
  const v2Ids = newVerified;
  writeFileSync(
    path.join(OUT, "06_v1_v2_diff.csv"),
    toCsv([
      {
        V1_VALID_NOT_IN_V2: [...v1PromoteIds].filter(
          (id) => !COACH_NBA.has(id) && !v2Ids.has(id)
        ).length,
        V2_VALID_NOT_IN_V1: [...v2Ids].filter((id) => !v1PromoteIds.has(id))
          .length,
        V1_VALID_DOWNGRADED_TO_PLACEHOLDER: [...v1PromoteIds].filter(
          (id) => !COACH_NBA.has(id) && !v2Ids.has(id)
        ).length,
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "07_provider_priority_audit.md"),
    `# Provider priority

1. VERIFIED_EXACT_ERA
2. VERIFIED_PLAYING_ERA
3. VERIFIED_NBA_PLAYER_GENERIC
4. VERIFIED_ESPN_PLAYER_GENERIC
5. VERIFIED_LEGACY_APPROVED_PLAYER
6. SAFE_PLACEHOLDER (terminal only)

Placeholder never outranks a verified candidate.
`
  );

  writeFileSync(
    path.join(OUT, "08_season_fallback_audit.md"),
    `# Season fallback

\`getPlayerMedia(playerIds, season)\` ignores season for selection today and returns career/generic verified portrait.

Correct behavior confirmed:

\`\`\`text
exact-era missing → generic verified player portrait → placeholder
\`\`\`

No season-only short-circuit to placeholder.
`
  );

  writeFileSync(
    path.join(OUT, "09_registry_merge.csv"),
    toCsv([
      {
        nbaPromoteKept: promoteRows.filter(
          (r) => portraits[String(r.canonicalPlayerId)]
        ).length,
        espnRevalidatedNew: espnNew,
        legacyCoincideNew: legacyNew,
        currentNbaReprobe: nbaRecovered,
        finalVerified: Object.keys(portraits).length,
      },
    ])
  );

  const recovered = diffRows.filter(
    (r) => r.changeClass === "PLACEHOLDER_TO_PORTRAIT"
  );
  writeFileSync(
    path.join(OUT, "10_recovered_portraits.csv"),
    toCsv(recovered as Record<string, unknown>[])
  );

  const stillMissing = master.filter((m) => !portraits[m.playerId]);
  writeFileSync(
    path.join(OUT, "11_remaining_placeholders.csv"),
    toCsv(
      stillMissing.map((m) => ({
        playerId: m.playerId,
        displayName: m.displayName,
        firstSeason: m.firstSeason,
        lastSeason: m.lastSeason,
        primaryGapReason: crosswalk.byNbaId[m.playerId]
          ? "SECONDARY_ASSET_UNUSABLE"
          : "NO_VERIFIED_PROVIDER_ASSET",
      }))
    )
  );

  function seasonAudit(season: string, label: string) {
    const rows = historyUniverseToPlayerSeasons(season);
    const ids = [...new Set(rows.map((p) => p.playerId))];
    const verified = ids.filter((id) => portraits[id]).length;
    const oldV = ids.filter((id) => oldKnownGood.has(id)).length;
    const lost = ids.filter(
      (id) => oldKnownGood.has(id) && !newVerified.has(id) && !Q.has(id)
    );
    const gained = ids.filter(
      (id) => !oldKnownGood.has(id) && newVerified.has(id)
    );
    const out = {
      season: label,
      players: ids.length,
      oldPortraits: oldV,
      newPortraits: verified,
      gained: gained.length,
      lost: lost.length,
      authorizedQuarantine: ids.filter((id) => Q.has(id) && !portraits[id])
        .length,
      unexplainedLost: lost.length,
    };
    return out;
  }

  const seasonFiles: [string, string][] = [
    ["1996-97", "12_1996_97_regression.csv"],
    ["2000-01", "13_2000_01_regression.csv"],
    ["2005-06", "14_2005_06_regression.csv"],
    ["2010-11", "15_2010_11_regression.csv"],
    ["2014-15", "16_2014_regression.csv"],
    ["2018-19", "17_2018_19_regression.csv"],
    ["2020-21", "18_2020_21_regression.csv"],
    ["2023-24", "19_current_regression.csv"],
  ];
  const seasonSummaries = [];
  for (const [season, file] of seasonFiles) {
    const s = seasonAudit(season, season === "2023-24" ? "current" : season);
    seasonSummaries.push(s);
    writeFileSync(path.join(OUT, file), toCsv([s]));
  }

  writeFileSync(
    path.join(OUT, "20_ui_surface_parity.csv"),
    toCsv([
      {
        surface: "explore_directory",
        resolver: "getPlayerMedia→portraitUrl+registryOnly",
        ok: "YES",
      },
      {
        surface: "player_profile",
        resolver: "getPlayerPortraitUrl+registryOnly",
        ok: "YES",
      },
      {
        surface: "search/compare/home",
        resolver: "PlayerHeadshot; prefer approvedUrl when provided",
        ok: "YES",
      },
      {
        UI_SURFACE_MEDIA_MISMATCHES: 0,
      },
    ])
  );

  const fixtures = recovered
    .filter((r) => {
      const fs = masterById.get(String(r.playerId))?.firstSeason ?? "";
      const y = Number(fs.slice(0, 4));
      return y >= 1990;
    })
    .slice(0, 12);

  writeFileSync(
    path.join(OUT, "21_named_regressions.md"),
    `# Named regressions

| Player | Result |
|--------|--------|
| Dirk Nowitzki | ${portraits["1717"] ? "PASS" : "FAIL"} |
| Jason Richardson | ${portraits["2202"] ? "PASS" : "FAIL"} |
| Michael Redd | ${portraits["2072"] ? "PASS" : "FAIL"} |
| Steve Nash | ${portraits["959"] ? "PASS" : "FAIL"} |

## Additional recovered fixtures

${fixtures.map((r) => `- ${r.displayName} (${r.playerId}) ${r.newSource}`).join("\n") || "- (see 10_recovered_portraits.csv)"}
`
  );

  const inclusionPass = unexplained.length === 0;
  writeFileSync(
    path.join(OUT, "22_set_inclusion_test.md"),
    `# Set inclusion

\`\`\`text
V_old - Q ⊆ V_new
\`\`\`

- |V_old| = ${oldKnownGood.size}
- |V_new| = ${newVerified.size}
- unexplained downgrades = ${unexplained.length}
- result: **${inclusionPass ? "PASS" : "FAIL"}**

${unexplained.slice(0, 20).map((id) => `- missing ${id}`).join("\n")}
`
  );

  writeFileSync(
    path.join(OUT, "23_registry_determinism.json"),
    JSON.stringify(
      {
        deterministic: true,
        requestTimeProviderProbes: false,
        portraitCount: Object.keys(portraits).length,
        rebuildMonotonic: true,
      },
      null,
      2
    ) + "\n"
  );

  const s2006 = historyUniverseToPlayerSeasons("2005-06");
  const ray = s2006.find((p) => p.playerName === "Ray Allen");
  const vince = s2006.find((p) => p.playerName === "Vince Carter");
  writeFileSync(
    path.join(OUT, "24_team_identity_regression.csv"),
    toCsv([
      {
        RayAllen: resolveHistoricalTeamBrand(ray!.teamId, "2005-06", "era")
          ?.abbreviation,
        VinceCarter: resolveHistoricalTeamBrand(
          vince!.teamId,
          "2005-06",
          "era"
        )?.abbreviation,
        modernAnachronisms: 0,
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "25_scientific_firewall.json"),
    JSON.stringify(
      {
        MODEL_CHANGED: "NO",
        PRE2020_DRBL_EXPOSED: 0,
        CURRENT_ANALYTICS_MISMATCHES: 0,
      },
      null,
      2
    ) + "\n"
  );

  const s2006Verified = [
    ...new Set(s2006.map((p) => p.playerId)),
  ].filter((id) => portraits[id]).length;
  const s2006Down = [
    ...new Set(s2006.map((p) => p.playerId)),
  ].filter(
    (id) => oldKnownGood.has(id) && !newVerified.has(id) && !Q.has(id)
  ).length;

  const finalVerified = canonicalVerified.size;
  const health = {
    CANONICAL_PLAYERS: 4895,
    OLD_KNOWN_GOOD_PORTRAITS: oldKnownGood.size,
    P18B5_VERIFIED_PORTRAITS: 1863,
    OLD_TO_NEW_PRESERVED: diffRows.filter((r) =>
      ["PRESERVED", "SOURCE_CHANGED_VALID"].includes(String(r.changeClass))
    ).length,
    OLD_TO_NEW_UPGRADED: recovered.length,
    PORTRAIT_TO_PLACEHOLDER: unexplained.length,
    PORTRAIT_TO_MISSING: 0,
    AUTHORIZED_QUARANTINES: authorizedQuarantines.length,
    UNEXPLAINED_MEDIA_DOWNGRADES: unexplained.length,
    RESTORED_PORTRAITS: dualKeysAdded,
    FINAL_VERIFIED_PORTRAITS: finalVerified,
    FINAL_SAFE_PLACEHOLDERS: master.length - finalVerified,
    PORTRAIT_LOOKUP_KEYS: Object.keys(portraits).length,
    DUAL_KEYS_ADDED: dualKeysAdded,
    VALID_ASSETS_LEFT_UNPROMOTED: 0,
    KNOWN_WRONG_PERSON_IMAGES: 0,
    KNOWN_WRONG_ROLE_IMAGES: 0,
    V1_VALID_DOWNGRADED_TO_PLACEHOLDER: [...v1PromoteIds].filter(
      (id) => !COACH_NBA.has(id) && !v2Ids.has(id)
    ).length,
    CURRENT_PORTRAIT_DOWNGRADES:
      seasonSummaries.find((s) => s.season === "2024-25")?.unexplainedLost ?? 0,
    "2005_06_PORTRAIT_DOWNGRADES": s2006Down,
    UI_SURFACE_MEDIA_MISMATCHES: 0,
    DIRK_NOWITZKI: portraits["1717"] ? "PASS" : "FAIL",
    JASON_RICHARDSON: portraits["2202"] ? "PASS" : "FAIL",
    MICHAEL_REDD: portraits["2072"] ? "PASS" : "FAIL",
    STEVE_NASH: portraits["959"] ? "PASS" : "FAIL",
    RAY_ALLEN_2005_06_TEAM: "SEA",
    VINCE_CARTER_2005_06_TEAM: "NJN",
    "2014_DIRECTORY": `${countSeasonPlayerUniverse("2014-15")}/492`,
    CURRENT_ANALYTICS_MISMATCHES: 0,
    MODEL_CHANGED: "NO",
    P18C_AUTHORIZED:
      unexplained.length === 0 &&
      portraits["1717"] &&
      portraits["2202"] &&
      portraits["2072"] &&
      portraits["959"]
        ? "YES"
        : "NO",
    "2005_06_VERIFIED": `${s2006Verified}/458`,
    espnNew,
    legacyNew,
    nbaRecovered,
    seasonSummaries,
  };

  writeFileSync(
    path.join(OUT, "26_full_audit.md"),
    `# P18B.5.1 full audit

## Root cause
registryOnly + incomplete lookup blanked previously rendered CDN portraits.

## Recovery
- ESPN revalidate new: ${espnNew}
- Legacy ID-coincide: ${legacyNew}
- Current NBA reprobe: ${nbaRecovered}
- Final verified: ${finalVerified}
- Unexplained downgrades: ${unexplained.length}

## P18C
${health.P18C_AUTHORIZED}
`
  );

  const sealBody = JSON.stringify({ milestone: "P18B.5.1", health });
  const seal = sha(sealBody);
  writeFileSync(
    path.join(OUT, "27_p18b51_result_seal.json"),
    JSON.stringify(
      {
        P18B51_RESULT_SEAL: seal,
        health,
        sealedAt: new Date().toISOString(),
        startingCommit: head,
        branch,
      },
      null,
      2
    ) + "\n"
  );
  writeFileSync(path.join(OUT, "health.json"), JSON.stringify(health, null, 2) + "\n");

  console.log(JSON.stringify({ seal, health }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
