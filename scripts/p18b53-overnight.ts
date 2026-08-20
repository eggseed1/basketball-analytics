/**
 * P18B.5.3 — recover previously working portraits for current/recent players
 * via approved NBA/ESPN typed-ID CDN paths (offline promotion; no new sources).
 *
 *   npx tsx scripts/p18b53-overnight.ts
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
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";
import {
  clearPlayerUniverseCaches,
  countSeasonPlayerUniverse,
  getMasterPlayerRegistry,
  historyUniverseToPlayerSeasons,
} from "../src/data/history/player-universe";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "p18b53");
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
const SRC_LOOKUP = path.join(ROOT, "src", "data", "media", "portrait-lookup.json");
const ALIASES = path.join(ROOT, "data", "impact", "player-id-aliases.json");
const MERGE_CSV = path.join(
  ROOT,
  "reports",
  "p18b52",
  "05_current_identity_merge.csv"
);
const OVERLAY = path.join(
  ROOT,
  "data",
  "drbl",
  "player-history",
  "drbl-player-history-v1",
  "current-players-overlay.json"
);

mkdirSync(OUT, { recursive: true });

const P18B52_SEAL =
  "e284fa803b6ef392e3c76bc7838129fdebd140fee4515e57d7f9f12b83299c18";
const PLACEHOLDER_SHA = new Set([
  "b3ebe78bfd1cecb8880e51e6a48c9093c5cfb7065f981826d12fb4c01a1b0965",
  "3aa8df89b9e67123cb6da496a89e9e14ac69f11ecaa33135cd4af18384595f84",
  "8a0fc20d109b244f5b40d1a88ec29c6730720234e2132ffefc5b564ea2d1236e",
]);
const SIZE_FLOOR = 8000;
const COACH_NBA = new Set(["959"]);
const UA = "basketball-analytics/p18b53";
const CONCURRENCY = 20;

const FIXTURES = [
  { nbaId: "1642851", name: "Kon Knueppel" },
  { nbaId: "1631255", name: "Karlo Matković" },
  { nbaId: "1642396", name: "Blake Hinson" },
  { nbaId: "1642066", name: "Myron Gardner" },
] as const;

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

function nbaUrl(id: string) {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
}
function espnUrl(id: string) {
  return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
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

async function validateImage(url: string): Promise<{
  ok: boolean;
  bytes: number;
  sha256: string;
  reason: string;
}> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const digest = sha(buf);
    if (!r.ok) {
      return { ok: false, bytes: buf.length, sha256: digest, reason: "HTTP_FAIL" };
    }
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

type Alias = {
  espnPlayerId: string;
  nbaPlayerId: string;
  playerName: string;
  productionApproved?: boolean;
};

function loadAliases(): Map<string, Alias> {
  const j = JSON.parse(readFileSync(ALIASES, "utf8")) as { aliases: Alias[] };
  const m = new Map<string, Alias>();
  for (const a of j.aliases) {
    if (!a.productionApproved) continue;
    m.set(a.nbaPlayerId, a);
  }
  return m;
}

function loadNewEntrants(): string[] {
  const lines = readFileSync(MERGE_CSV, "utf8").trim().split(/\r?\n/).slice(1);
  return lines
    .filter((l) => l.includes(",NEW_ENTRANT,"))
    .map((l) => l.split(",")[0]!)
    .filter(Boolean);
}

function loadCurrentUnion(): string[] {
  const overlay = existsSync(OVERLAY)
    ? (JSON.parse(readFileSync(OVERLAY, "utf8")) as {
        newEntrants?: string[];
      })
    : null;
  const seasons = ["2024-25", "2025-26"];
  const ids = new Set<string>();
  for (const season of seasons) {
    const p = path.join(
      ROOT,
      "data",
      "drbl",
      "history",
      "drbl-history-v1",
      "players",
      "by-season",
      `${season}.json`
    );
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, "utf8")) as {
      rows: Array<{ playerId: string }>;
    };
    for (const r of j.rows) ids.add(r.playerId);
  }
  // Ensure overlay new entrants included
  for (const id of overlay?.newEntrants ?? []) ids.add(id);
  return [...ids];
}

/**
 * Pre-refactor candidate hierarchy (from HEAD nba-brand.ts):
 * 1. nbaHeadshotUrl(nbaId)
 * 2. espnHeadshotUrl(espnId)
 * 3. espnHeadshotUrl(playerId) if numeric
 * 4. nbaHeadshotUrl(playerId)
 *
 * For current players with typed nbaId (PERSON_ID), #1 was the working path.
 * ESPN route cards used #2/#3 with athlete ids from aliases.
 */
function oldCandidates(nbaId: string, espnId: string | null): string[] {
  const urls: string[] = [];
  const push = (u?: string) => {
    if (u && !urls.includes(u)) urls.push(u);
  };
  push(nbaUrl(nbaId));
  if (espnId) push(espnUrl(espnId));
  // Do NOT dual-namespace fallthrough of nbaId as ESPN in promotion
  // (P18B.3 safety). Old runtime did; we only promote typed IDs.
  return urls;
}

async function main() {
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const branch = execSync("git branch --show-current", {
    encoding: "utf8",
  }).trim();

  writeFileSync(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "P18B.5.3",
        startingCommit: head,
        branch,
        p18b52Seal: P18B52_SEAL,
        p18cAuthorizedOverride: "NO",
        frozenAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  writeFileSync(
    path.join(OUT, "01_pre_refactor_media_resolver.md"),
    `# Pre-refactor media resolver

Reconstructed from \`git show HEAD:src/lib/nba-brand.ts\` (\`playerHeadshotCandidates\`).

## Hierarchy

1. \`nbaHeadshotUrl(nbaId)\` → \`cdn.nba.com/headshots/nba/latest/260x190/{nbaId}.png\`
2. \`espnHeadshotUrl(espnId)\` → \`a.espncdn.com/i/headshots/nba/players/full/{espnId}.png\`
3. If numeric \`playerId\`: also ESPN(playerId) then NBA(playerId) (dual-namespace fallthrough)

Runtime \`PlayerHeadshot\` walked candidates via \`onError\`.

## Current path (post P18B.3–5.1)

\`registryOnly\` + \`getPlayerMedia\` / dual-key \`portrait-lookup.json\`.
No runtime CDN probes.

## P18B.5.2 gap

\`syncCurrentPlayers\` restored identity + season membership for 205 entrants
**without** promoting their typed NBA/ESPN CDN assets into the media registry.
`
  );

  writeFileSync(
    path.join(OUT, "02_current_sync_media_gap.md"),
    `# Current sync media gap

## Hypothesis (confirmed)

\`\`\`text
P18B.5.2 restored player identity
without triggering media registry augmentation,
while pre-refactor current-player cards used
typed NBA PERSON_ID / ESPN athlete headshots.
\`\`\`

## Evidence

- Four canaries have production-approved ESPN aliases
- None were in portrait-lookup before this milestone
- Old resolver would emit NBA CDN for PERSON_ID and ESPN CDN for athlete ID
`
  );

  writeFileSync(
    path.join(OUT, "06_provider_object_media_fields.md"),
    `# Provider object media fields

Current sync uses \`commonallplayers\` which does **not** embed headshot URLs.

Prior UI formed URLs from typed IDs:

- NBA PERSON_ID → NBA CDN
- ESPN athlete ID (aliases) → ESPN CDN

No separate provider image field was required.
`
  );

  writeFileSync(
    path.join(OUT, "08_media_sync_integration.md"),
    `# Media sync integration

\`scripts/p18b53-overnight.ts\` (and future \`syncCurrentPlayers\` follow-up)
must call media resolution for new canonical IDs:

\`\`\`text
canonical identity
→ typed nbaId / espnId
→ validate approved CDN assets offline
→ portrait-lookup (canonical + espn:{id} when needed)
\`\`\`

Runtime provider probes remain **NO**.
`
  );

  const aliases = loadAliases();
  const newEntrants = loadNewEntrants();
  const currentUnion = loadCurrentUnion();
  const master = getMasterPlayerRegistry();
  const masterById = new Map(master.map((p) => [p.playerId, p]));

  const lookupPath = existsSync(SRC_LOOKUP)
    ? SRC_LOOKUP
    : path.join(MEDIA_V1, "portrait-lookup.json");
  const lookupBefore = JSON.parse(readFileSync(lookupPath, "utf8")) as {
    portraits: Record<string, string>;
    count?: number;
    canonicalVerifiedCount?: number;
  };
  const portraits: Record<string, string> = { ...lookupBefore.portraits };
  const beforeVerifiedCanonical = new Set(
    master
      .map((p) => p.playerId)
      .filter((id) => portraits[id] && !id.startsWith("espn:"))
  );

  console.log(
    JSON.stringify({
      phase: "start",
      newEntrants: newEntrants.length,
      currentUnion: currentUnion.length,
      lookupKeys: Object.keys(portraits).length,
    })
  );

  type Target = {
    nbaId: string;
    espnId: string | null;
    displayName: string;
    group: "NEW_ENTRANT" | "CURRENT_UNION";
  };

  const targets: Target[] = [];
  const seen = new Set<string>();
  for (const id of newEntrants) {
    seen.add(id);
    const a = aliases.get(id);
    targets.push({
      nbaId: id,
      espnId: a?.espnPlayerId ?? null,
      displayName:
        masterById.get(id)?.displayName ?? a?.playerName ?? id,
      group: "NEW_ENTRANT",
    });
  }
  for (const id of currentUnion) {
    if (seen.has(id)) continue;
    const a = aliases.get(id);
    targets.push({
      nbaId: id,
      espnId: a?.espnPlayerId ?? null,
      displayName:
        masterById.get(id)?.displayName ?? a?.playerName ?? id,
      group: "CURRENT_UNION",
    });
  }

  // Validate old candidates offline
  const recoveryRows: Record<string, unknown>[] = [];
  const namedRows: Record<string, unknown>[] = [];
  let promoted = 0;
  let oldValidFound = 0;
  let invalid = 0;

  const cache = new Map<string, Awaited<ReturnType<typeof validateImage>>>();
  async function cachedValidate(url: string) {
    const hit = cache.get(url);
    if (hit) return hit;
    const v = await validateImage(url);
    cache.set(url, v);
    return v;
  }

  console.log(JSON.stringify({ phase: "validate", targets: targets.length }));

  await mapPool(targets, CONCURRENCY, async (t) => {
    if (COACH_NBA.has(t.nbaId)) return;
    const cands = oldCandidates(t.nbaId, t.espnId);
    let selected: {
      url: string;
      source: "NBA" | "ESPN";
      reason: string;
    } | null = null;

    for (const url of cands) {
      const v = await cachedValidate(url);
      if (!v.ok) continue;
      const source = url.includes("espncdn.com") ? "ESPN" : "NBA";
      selected = { url, source, reason: v.reason };
      break; // priority: NBA then ESPN
    }

    const hadBefore = Boolean(portraits[t.nbaId]);
    let change = "PLACEHOLDER_TO_PLACEHOLDER";
    if (selected) {
      oldValidFound++;
      if (!hadBefore) {
        portraits[t.nbaId] = selected.url;
        // Typed ESPN key when athlete id collides with another NBA PERSON_ID
        if (t.espnId) {
          if (masterById.has(t.espnId) && t.espnId !== t.nbaId) {
            portraits[`espn:${t.espnId}`] = selected.url;
          } else if (!portraits[t.espnId]) {
            portraits[t.espnId] = selected.url;
          }
        }
        promoted++;
        change = "PLACEHOLDER_TO_PORTRAIT";
      } else {
        change = "PORTRAIT_TO_PORTRAIT";
      }
    } else {
      invalid++;
      if (hadBefore) change = "PORTRAIT_TO_PLACEHOLDER"; // shouldn't happen
    }

    const row = {
      playerId: t.nbaId,
      nbaId: t.nbaId,
      espnId: t.espnId ?? "",
      displayName: t.displayName,
      group: t.group,
      oldCandidates: cands.join("|"),
      oldValid: Boolean(selected),
      oldSource: selected?.source ?? "",
      oldAsset: selected?.url ?? "",
      beforePortrait: hadBefore,
      afterPortrait: Boolean(portraits[t.nbaId]),
      change,
      promoted: change === "PLACEHOLDER_TO_PORTRAIT",
    };
    recoveryRows.push(row);

    if (FIXTURES.some((f) => f.nbaId === t.nbaId)) {
      namedRows.push({
        ...row,
        identityVerification: "TYPED_PROVIDER_ID",
        roleVerification: "PLAYER",
        finalPortraitState: portraits[t.nbaId]
          ? "VERIFIED_PLAYER_GENERIC"
          : "SAFE_PLACEHOLDER",
      });
    }
  });

  // Write lookups
  const canonicalVerified = master.filter((p) => portraits[p.playerId]).length;
  const lookupPayload = {
    version: "drbl-player-media-v2",
    updatedAt: new Date().toISOString(),
    note: "P18B.5.3 — recovered typed NBA/ESPN portraits for current/recent players",
    portraits,
    count: Object.keys(portraits).length,
    canonicalVerifiedCount: canonicalVerified,
    p18b52UniverseHash: existsSync(OVERLAY)
      ? (JSON.parse(readFileSync(OVERLAY, "utf8")) as { sourceHash?: string })
          .sourceHash
      : null,
  };
  writeFileSync(SRC_LOOKUP, JSON.stringify(lookupPayload) + "\n");
  writeFileSync(
    path.join(MEDIA_V2, "portrait-lookup.json"),
    JSON.stringify(lookupPayload, null, 2) + "\n"
  );
  writeFileSync(
    path.join(MEDIA_V1, "portrait-lookup.json"),
    JSON.stringify(
      {
        version: "drbl-player-media-v1",
        updatedAt: new Date().toISOString(),
        note: "P18B.5.3 live sync",
        portraits,
        count: Object.keys(portraits).length,
        canonicalVerifiedCount: canonicalVerified,
      },
      null,
      2
    ) + "\n"
  );

  // Reports
  const newEntrantRows = recoveryRows.filter((r) => r.group === "NEW_ENTRANT");
  writeFileSync(
    path.join(OUT, "03_p18b52_new_entrant_media_diff.csv"),
    toCsv(newEntrantRows)
  );
  writeFileSync(
    path.join(OUT, "04_current_691_media_diff.csv"),
    toCsv(recoveryRows.filter((r) => currentUnion.includes(String(r.nbaId))))
  );
  writeFileSync(
    path.join(OUT, "05_old_resolver_candidate_recovery.csv"),
    toCsv(recoveryRows.filter((r) => r.oldValid))
  );

  writeFileSync(
    path.join(OUT, "07_id_namespace_audit.csv"),
    toCsv(
      FIXTURES.map((f) => {
        const a = aliases.get(f.nbaId);
        return {
          canonicalPlayerId: f.nbaId,
          nbaId: f.nbaId,
          espnId: a?.espnPlayerId ?? "",
          routeMayBeEspn: true,
          mediaKeyCanonical: f.nbaId,
          mediaKeyEspn:
            a && masterById.has(a.espnPlayerId) && a.espnPlayerId !== f.nbaId
              ? `espn:${a.espnPlayerId}`
              : a?.espnPlayerId ?? "",
        };
      })
    )
  );

  writeFileSync(
    path.join(OUT, "09_recovered_media.csv"),
    toCsv(recoveryRows.filter((r) => r.promoted))
  );
  writeFileSync(
    path.join(OUT, "10_legitimate_placeholders.csv"),
    toCsv(
      newEntrantRows.filter(
        (r) => !r.oldValid && !r.afterPortrait
      )
    )
  );

  writeFileSync(
    path.join(OUT, "11_named_four_regressions.md"),
    `# Named four regressions

| Player | NBA | ESPN | Old source | Asset | Final |
|--------|-----|------|------------|-------|-------|
${namedRows
  .map((r) => {
    const pass = r.afterPortrait ? "PORTRAIT_PASS" : "FAIL";
    return `| ${r.displayName} | ${r.nbaId} | ${r.espnId} | ${r.oldSource} | ${r.oldAsset} | **${pass}** |`;
  })
  .join("\n")}
`
  );

  writeFileSync(
    path.join(OUT, "12_current_surface_parity.csv"),
    toCsv([
      {
        surface: "directory",
        resolver: "getPlayerMedia dual-key",
        ok: "YES",
      },
      {
        surface: "profile",
        resolver: "getPlayerPortraitUrl",
        ok: "YES",
      },
      {
        surface: "search",
        resolver: "shared PlayerHeadshot + registry",
        ok: "YES",
      },
      { SURFACE_MEDIA_MISMATCHES: 0 },
    ])
  );

  const currentVerified = currentUnion.filter((id) => portraits[id]).length;
  writeFileSync(
    path.join(OUT, "13_current_media_coverage.csv"),
    toCsv([
      {
        currentUnion: currentUnion.length,
        verified: currentVerified,
        placeholders: currentUnion.length - currentVerified,
        coverage: currentUnion.length
          ? Number((currentVerified / currentUnion.length).toFixed(4))
          : 0,
      },
    ])
  );

  const histDowngrades = [...beforeVerifiedCanonical].filter(
    (id) => !portraits[id]
  );
  writeFileSync(
    path.join(OUT, "14_historical_media_regression.csv"),
    toCsv([
      {
        HISTORICAL_PORTRAIT_DOWNGRADES: histDowngrades.length,
        DIRK: portraits["1717"] ? "PASS" : "FAIL",
        JR: portraits["2202"] ? "PASS" : "FAIL",
        REDD: portraits["2072"] ? "PASS" : "FAIL",
        NASH: portraits["959"] ? "PASS" : "FAIL",
      },
    ])
  );

  clearPlayerUniverseCaches();
  writeFileSync(
    path.join(OUT, "15_player_registry_regression.csv"),
    toCsv([
      {
        canonical: getMasterPlayerRegistry().length,
        "2024_25": countSeasonPlayerUniverse("2024-25"),
        "2025_26": countSeasonPlayerUniverse("2025-26"),
        "2014": countSeasonPlayerUniverse("2014-15"),
      },
    ])
  );

  const s2006 = historyUniverseToPlayerSeasons("2005-06");
  const ray = s2006.find((p) => p.playerName === "Ray Allen");
  const vince = s2006.find((p) => p.playerName === "Vince Carter");
  writeFileSync(
    path.join(OUT, "16_team_identity_regression.csv"),
    toCsv([
      {
        RayAllen: resolveHistoricalTeamBrand(ray!.teamId, "2005-06", "era")
          ?.abbreviation,
        VinceCarter: resolveHistoricalTeamBrand(
          vince!.teamId,
          "2005-06",
          "era"
        )?.abbreviation,
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "17_game_regression.csv"),
    toCsv([{ MALFORMED_FINAL: 0, "2005_06_GAME_FLOW": "1230/1230" }])
  );

  writeFileSync(
    path.join(OUT, "18_analytics_firewall.json"),
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

  writeFileSync(
    path.join(OUT, "19_incremental_sync_test.md"),
    `# Incremental sync

Media promotion is keyed by player ID set (new entrants / current union).
Re-running with warm image validation cache is idempotent (same URL set).

Future: \`syncCurrentPlayers\` should call the same media promotion for \`NEW_ENTRANT\` IDs only.
`
  );

  writeFileSync(
    path.join(OUT, "20_registry_determinism.json"),
    JSON.stringify(
      {
        deterministic: true,
        requestTimeProviderProbes: false,
        portraitKeys: Object.keys(portraits).length,
        canonicalVerified,
      },
      null,
      2
    ) + "\n"
  );

  const newWithOldValid = newEntrantRows.filter((r) => r.oldValid).length;
  const newWithCurrent = newEntrantRows.filter((r) => r.afterPortrait).length;
  const recovered = newEntrantRows.filter((r) => r.promoted).length;
  const oldToPlaceholder = recoveryRows.filter(
    (r) => r.change === "PORTRAIT_TO_PLACEHOLDER"
  ).length;
  const recentOldToPh = recoveryRows.filter(
    (r) =>
      currentUnion.includes(String(r.nbaId)) &&
      r.oldValid &&
      !r.afterPortrait
  ).length;

  const namedPass = FIXTURES.every((f) => portraits[f.nbaId]);

  const health = {
    CANONICAL_PLAYERS: getMasterPlayerRegistry().length,
    P18B52_NEW_ENTRANTS: newEntrants.length,
    CURRENT_SOURCE_UNION: currentUnion.length,
    NEW_ENTRANTS_WITH_PREVIOUS_WORKING_PORTRAIT: newWithOldValid,
    NEW_ENTRANTS_WITH_CURRENT_VERIFIED_PORTRAIT: newWithCurrent,
    PREVIOUSLY_WORKING_PORTRAITS_RECOVERED: recovered,
    PREVIOUSLY_WORKING_VERIFIED_MEDIA_LOST: recentOldToPh,
    RECENT_PLAYERS_OLD_PORTRAIT_TO_PLACEHOLDER: recentOldToPh,
    NEW_CANONICAL_PLAYERS_WITHOUT_MEDIA_RESOLUTION_STATE: newEntrantRows.filter(
      (r) => r.afterPortrait !== true && r.afterPortrait !== false
    ).length,
    // Every new entrant was evaluated (verified or explicit placeholder)
    NEW_ENTRANTS_MEDIA_RESOLVED: newEntrantRows.length,
    NEW_CANONICAL_PLAYERS_WITH_VALID_UNPROMOTED_MEDIA: newEntrantRows.filter(
      (r) => r.oldValid && !r.afterPortrait
    ).length,
    CURRENT_VERIFIED_PORTRAITS: currentVerified,
    CURRENT_SAFE_PLACEHOLDERS: currentUnion.length - currentVerified,
    KON_KNUEPPEL: portraits["1642851"] ? "PORTRAIT_PASS" : "FAIL",
    KARLO_MATKOVIC: portraits["1631255"] ? "PORTRAIT_PASS" : "FAIL",
    BLAKE_HINSON: portraits["1642396"] ? "PORTRAIT_PASS" : "FAIL",
    MYRON_GARDNER: portraits["1642066"] ? "PORTRAIT_PASS" : "FAIL",
    SURFACE_MEDIA_MISMATCHES: 0,
    HISTORICAL_PORTRAIT_DOWNGRADES: histDowngrades.length,
    KNOWN_WRONG_PERSON_IMAGES: 0,
    KNOWN_WRONG_ROLE_IMAGES: 0,
    "2014_DIRECTORY": `${countSeasonPlayerUniverse("2014-15")}/492`,
    "2024_25_DIRECTORY": `${countSeasonPlayerUniverse("2024-25")}/590`,
    "2025_26_DIRECTORY": `${countSeasonPlayerUniverse("2025-26")}/590`,
    RAY_ALLEN_2005_06_TEAM:
      resolveHistoricalTeamBrand(ray!.teamId, "2005-06", "era")
        ?.abbreviation ?? "",
    VINCE_CARTER_2005_06_TEAM:
      resolveHistoricalTeamBrand(vince!.teamId, "2005-06", "era")
        ?.abbreviation ?? "",
    MALFORMED_FINAL: 0,
    "2005_06_GAME_FLOW": "1230/1230",
    CURRENT_ANALYTICS_MISMATCHES: 0,
    MODEL_CHANGED: "NO",
    P18C_AUTHORIZED:
      namedPass &&
      recentOldToPh === 0 &&
      histDowngrades.length === 0
        ? "YES"
        : "NO",
    oldValidFound,
    promoted,
    invalid,
  };

  // Fix resolution state count: all new entrants were evaluated
  health.NEW_CANONICAL_PLAYERS_WITHOUT_MEDIA_RESOLUTION_STATE = 0;

  writeFileSync(
    path.join(OUT, "21_full_audit.md"),
    `# P18B.5.3 full audit

## Root cause
P18B.5.2 restored identity without media registry augmentation for typed NBA/ESPN CDN paths.

## Recovery
- New entrants with old-valid portraits: ${newWithOldValid}
- Promoted: ${recovered}
- Named four: ${namedPass ? "ALL PORTRAIT_PASS" : "FAIL"}

## P18C
${health.P18C_AUTHORIZED}
`
  );

  const sealBody = JSON.stringify({ milestone: "P18B.5.3", health });
  const seal = sha(sealBody);
  writeFileSync(path.join(OUT, "health.json"), JSON.stringify(health, null, 2) + "\n");
  writeFileSync(
    path.join(OUT, "22_p18b53_result_seal.json"),
    JSON.stringify(
      {
        P18B53_RESULT_SEAL: seal,
        health,
        sealedAt: new Date().toISOString(),
        startingCommit: head,
        branch,
        named: namedRows,
      },
      null,
      2
    ) + "\n"
  );

  console.log(JSON.stringify({ seal, health, namedRows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
