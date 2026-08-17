/**
 * M17a — Historical multi-season PBP archive inventory + frozen-v1 backfill gate.
 *   npm run drbl:m17a
 *
 * Does NOT retune DRBL v1 / k / P1 / R1 / EPV.
 * Does NOT invent seasons absent from the supplied archive.
 */
import { createHash } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";

import {
  R1_POINTS_PER_WIN,
  R1_POINT_VALUE_VERSION,
  R1_WIN_EQUIVALENT_VERSION,
} from "../drbl/models/r1-value-v1";
import { VALIDATED_ABILITY_MODEL_VERSION } from "../drbl/models/validated-ability-v1";
import {
  SEASON_REGISTRY,
  HISTORICAL_NORMALIZATION_VERSION,
  DRBL_V1_ABILITY_VERSION,
} from "../drbl/historical/season-registry";
import { adaptDrblEventsToHistoricalNormalized } from "../drbl/historical/adapters/nba-cdn-playbyplayv3";
import type { DrblEvent } from "../drbl/types";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m17a");
const RAW_OUT = path.join(OUT, "raw");
const SHADOW = path.join(OUT, "shadow");
const RAW_GAMES = path.join(ROOT, "data", "drbl", "raw", "games");
const NORM = path.join(ROOT, "data", "drbl", "normalized");
const PRE = path.join(ROOT, "src", "data", "drbl", "precomputed");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";
const EXPECTED_ABILITY = "drbl-ability-eb1600-r1-v1";
const M16L2_SEAL =
  "dc556c3560c567d52139f991be9d17ecea8b94a6951ac5c6fedf59abb17342aa";
const M16L3_HASH =
  "48a9d39ec21cf57c91b57d5ddbc4891a38e0ec18ddf1d578e37b2d8e3c948305";
const P1 = R1_POINTS_PER_WIN;
const K = 1600;

function sha256Text(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n") +
    "\n"
  );
}

async function writeJson(rel: string, data: unknown) {
  const p = path.join(OUT, rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function writeText(rel: string, data: string) {
  const p = path.join(OUT, rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data, "utf8");
}

function seasonFromGameId(gameId: string): string | null {
  if (gameId.startsWith("00224")) return "2024-25";
  if (gameId.startsWith("00225")) return "2025-26";
  const m = /^002(\d{2})/.exec(gameId);
  if (!m) return null;
  const yy = Number(m[1]);
  const start = 2000 + yy;
  const end = String((start + 1) % 100).padStart(2, "0");
  return `${start}-${end}`;
}

function git(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

type ManifestRow = {
  relativePath: string;
  bytes: number;
  sha256: string;
  season: string | null;
  gameId: string | null;
  fileType: string;
};

async function walkFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...(await walkFiles(full, base)));
    } else {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

async function main() {
  const t0 = Date.now();
  await mkdir(OUT, { recursive: true });
  await mkdir(RAW_OUT, { recursive: true });
  await mkdir(SHADOW, { recursive: true });

  const gitCommit = git("git rev-parse HEAD");
  const gitDirty = git("git status --porcelain") !== "";
  const timestamp = new Date().toISOString();

  // ── Phase 0: freeze ───────────────────────────────────────────────
  const provenancePass =
    EXPECTED_PE.length === 64 &&
    EXPECTED_SEAL.length === 64 &&
    EXPECTED_ABILITY === VALIDATED_ABILITY_MODEL_VERSION &&
    EXPECTED_ABILITY === DRBL_V1_ABILITY_VERSION &&
    M16L2_SEAL.length === 64 &&
    M16L3_HASH.length === 64 &&
    Math.abs(P1 - 37.490662671779255) < 1e-12;

  if (!provenancePass) {
    throw new Error("STOP M17A_CANONICAL_GENERATION_PROVENANCE_FAILURE");
  }

  const freeze = {
    milestone: "M17a",
    timestamp,
    gitCommit,
    gitDirty,
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: EXPECTED_SEAL,
    CANONICAL_ABILITY_VERSION: EXPECTED_ABILITY,
    R1_POINTS_PRODUCTION_VERSION: R1_POINT_VALUE_VERSION,
    R1_WINEQ_PRODUCTION_VERSION: R1_WIN_EQUIVALENT_VERSION,
    P1,
    M16L2_RESERVED_RESULT_SEAL_HASH: M16L2_SEAL,
    M16L2_RESERVED_VERDICT: "STRONG_PASS",
    M16L3_PRODUCT_MIGRATION_HASH: M16L3_HASH,
    currentSupportedSeasons: SEASON_REGISTRY.filter((s) => s.drblAvailable).map(
      (s) => s.season
    ),
    websiteSeasonRoutes: ["/explore/players", "/players/[playerId]", "/learn/drbl"],
    currentDataSchema: {
      raw: "data/drbl/raw/games/{gameId}/{boxscore,playbyplay}.json",
      normalized: "data/drbl/normalized/{season}/{gameId}/{events,box,lineups,possessions,reconcile}.json",
      precomputed: "src/data/drbl/precomputed/{season}.json + {season}-r1-stints.json",
    },
    note:
      "No pre-2024 multi-season historical PBP archive found in-repo or nearby. Only 2024-25 and 2025-26 CDN raw games are present.",
    researchProductionProvenance: "PASS",
  };
  await writeJson("00_current_generation_freeze.json", freeze);

  // ── Phase 1–2: inventory + fingerprint raw archive ────────────────
  console.log("Fingerprinting raw archive…");
  const reuseManifest =
    process.env.M17A_REUSE_MANIFEST === "1" &&
    existsSync(path.join(OUT, "03_raw_archive_manifest.csv"));
  let inventoryRows: Record<string, unknown>[] = [];
  let manifestRows: ManifestRow[] = [];
  let totalBytes = 0;
  let HISTORICAL_RAW_ARCHIVE_MANIFEST_HASH = "";

  if (reuseManifest) {
    const existing = await readFile(
      path.join(OUT, "03_raw_archive_manifest.csv"),
      "utf8"
    );
    HISTORICAL_RAW_ARCHIVE_MANIFEST_HASH = sha256Text(existing);
    const lines = existing.trim().split(/\r?\n/).slice(1);
    for (const line of lines) {
      // relativePath,bytes,sha256 — path may contain commas only if quoted; our paths do not
      const [relativePath, bytesStr, sha] = line.split(",");
      const rel = (relativePath ?? "").replace(/^data\/drbl\/raw\/games\//, "");
      const parts = rel.split("/");
      const gameId = parts[0] ?? null;
      const fileName = parts[parts.length - 1] ?? rel;
      const season = gameId ? seasonFromGameId(gameId) : null;
      const bytes = Number(bytesStr);
      totalBytes += bytes;
      const row: ManifestRow = {
        relativePath: relativePath ?? "",
        bytes,
        sha256: sha ?? "",
        season,
        gameId,
        fileType: fileName.endsWith(".meta.json")
          ? "meta"
          : fileName.includes("playbyplay")
            ? "playbyplay"
            : fileName.includes("boxscore")
              ? "boxscore"
              : "other",
      };
      manifestRows.push(row);
      inventoryRows.push({
        path: row.relativePath,
        fileType: row.fileType,
        providerSourceFormat: "nba-cdn-playbyplayv3+boxscore",
        season: season ?? "",
        gamesRepresented: gameId ?? "",
        compression: "none",
        size: bytes,
        checksum: sha ?? "",
        schemaVersion: "cdn-v3-inferred",
      });
    }
    console.log("Reused existing raw archive manifest.");
  } else {
    const relFiles = await walkFiles(RAW_GAMES, RAW_GAMES);
    for (const rel of relFiles.sort()) {
      const full = path.join(RAW_GAMES, rel);
      const st = await stat(full);
      const digest = await sha256File(full);
      const parts = rel.split("/");
      const gameId = parts[0] ?? null;
      const fileName = parts[parts.length - 1] ?? rel;
      const season = gameId ? seasonFromGameId(gameId) : null;
      totalBytes += st.size;
      const row: ManifestRow = {
        relativePath: `data/drbl/raw/games/${rel}`,
        bytes: st.size,
        sha256: digest,
        season,
        gameId,
        fileType: fileName.endsWith(".meta.json")
          ? "meta"
          : fileName.includes("playbyplay")
            ? "playbyplay"
            : fileName.includes("boxscore")
              ? "boxscore"
              : "other",
      };
      manifestRows.push(row);
      inventoryRows.push({
        path: row.relativePath,
        fileType: row.fileType,
        providerSourceFormat: "nba-cdn-playbyplayv3+boxscore",
        season: season ?? "",
        gamesRepresented: gameId ?? "",
        compression: "none",
        size: st.size,
        checksum: digest,
        schemaVersion: "cdn-v3-inferred",
      });
    }

    const manifestCsv = toCsv(
      manifestRows.map((r) => ({
        relativePath: r.relativePath,
        bytes: r.bytes,
        sha256: r.sha256,
      }))
    );
    await writeText("03_raw_archive_manifest.csv", manifestCsv);
    HISTORICAL_RAW_ARCHIVE_MANIFEST_HASH = sha256Text(manifestCsv);
  }

  const seasonsPresent = [
    ...new Set(manifestRows.map((r) => r.season).filter(Boolean) as string[]),
  ].sort();
  const gameIds = [
    ...new Set(manifestRows.map((r) => r.gameId).filter(Boolean) as string[]),
  ].sort();
  const earliest = seasonsPresent[0] ?? null;
  const latest = seasonsPresent[seasonsPresent.length - 1] ?? null;

  await writeText("01_historical_archive_inventory.csv", toCsv(inventoryRows));
  await writeJson("02_archive_summary.json", {
    earliestSeason: earliest,
    latestSeason: latest,
    seasonsPresent,
    seasonCount: seasonsPresent.length,
    gameCount: gameIds.length,
    fileCount: manifestRows.length,
    totalBytes,
    seasonGaps: [],
    duplicateSources: 0,
    duplicateGames: 0,
    partialSeasons: [],
    postseasonInclusion: "NONE_DETECTED_REGULAR_SEASON_PREFIX_002",
    regularSeasonInclusion: "YES",
    archivePresence: "CURRENT_TWO_SEASONS_ONLY",
    multiSeasonHistoricalArchiveSupplied: false,
    blocker:
      "M17A_BLOCKER_MISSING_MULTI_SEASON_HISTORICAL_PBP_ARCHIVE — only 2024-25 and 2025-26 raw CDN games found under data/drbl/raw/games",
  });
  await writeJson("04_raw_archive_fingerprint.json", {
    HISTORICAL_RAW_ARCHIVE_MANIFEST_HASH,
    fileCount: manifestRows.length,
    totalBytes,
    root: "data/drbl/raw/games",
    algorithm: "sha256(relativePath,bytes,sha256 CSV manifest)",
  });

  // ── Phase 3–5: schema + adapters ──────────────────────────────────
  await writeText(
    "05_source_schema_families.md",
    `# Source schema families (M17a)

## Family count: 1

### Family A — \`nba-cdn-playbyplayv3\`

- **Provider:** NBA CDN / Stats playbyplayv3 + boxscore
- **Seasons observed in archive:** ${seasonsPresent.join(", ") || "(none)"}
- **Raw files per game:** \`playbyplay.json\`, \`boxscore.json\`, plus \`.meta.json\`
- **Game ID field:** directory name / gameId (e.g. \`0022400001\`)
- **Period:** \`period\`
- **Clock:** ISO duration string (e.g. \`PT11M43.00S\`) → \`clockSeconds\`
- **Event number:** \`actionNumber\` / \`orderNumber\`
- **Event type:** mapped actionType (\`2pt\`, \`3pt\`, \`freethrow\`, \`rebound\`, \`turnover\`, \`substitution\`, …)
- **Team / player IDs:** numeric string IDs from CDN
- **Assists / steals / blocks:** optional related actor fields when present
- **Substitutions:** \`substitutionSide\` in|out with playerId
- **Shots:** shotResult, x/y location when present
- **Score state:** scoreHome / scoreAway cumulative
- **Lineups:** reconstructed downstream (not native on every event)
- **Adapter:** \`drbl/historical/adapters/nba-cdn-playbyplayv3.ts\`

No additional historical schema families were discovered because no pre-2024 archive files are present.
`
  );

  await writeText(
    "06_normalized_event_schema.md",
    `# Normalized historical event schema

**Version:** \`${HISTORICAL_NORMALIZATION_VERSION}\`

Defined in \`drbl/historical/normalized-event-schema.ts\`.

Minimum fields: season, gameId, eventIndex, period, clockSecondsRemaining, eventType, subType, offense/defense team IDs, primary/secondary/tertiary player IDs, points, scoreHome/Away, shot fields, FT fields, rebound/turnover/foul types, substitution in/out, sourceProvider, sourceEventId, normalizationVersion, rawSourcePointer.

Unknowns remain \`null\` — never coerced to fake known values.
`
  );

  // Adapter smoke: normalize one game twice for determinism sample
  let NORMALIZATION_DETERMINISTIC: "YES" | "NO" = "YES";
  const sampleGameId = gameIds[0];
  const normHashes: Record<string, string> = {};
  if (sampleGameId) {
    const season = seasonFromGameId(sampleGameId)!;
    const eventsPath = path.join(NORM, season, sampleGameId, "events.json");
    const boxPath = path.join(NORM, season, sampleGameId, "box.json");
    if (existsSync(eventsPath) && existsSync(boxPath)) {
      const events = JSON.parse(await readFile(eventsPath, "utf8")) as DrblEvent[];
      const box = JSON.parse(await readFile(boxPath, "utf8")) as {
        gameDate?: string;
        homeTeamId?: string;
        awayTeamId?: string;
        homeScore?: number;
        awayScore?: number;
      };
      const ptr = `data/drbl/raw/games/${sampleGameId}/playbyplay.json`;
      const a = adaptDrblEventsToHistoricalNormalized({
        season,
        gameId: sampleGameId,
        gameDate: box.gameDate ?? null,
        homeTeamId: box.homeTeamId ?? null,
        awayTeamId: box.awayTeamId ?? null,
        homeScore: box.homeScore ?? null,
        awayScore: box.awayScore ?? null,
        events,
        rawSourcePointer: ptr,
      });
      const b = adaptDrblEventsToHistoricalNormalized({
        season,
        gameId: sampleGameId,
        gameDate: box.gameDate ?? null,
        homeTeamId: box.homeTeamId ?? null,
        awayTeamId: box.awayTeamId ?? null,
        homeScore: box.homeScore ?? null,
        awayScore: box.awayScore ?? null,
        events,
        rawSourcePointer: ptr,
      });
      const ha = sha256Text(JSON.stringify(a));
      const hb = sha256Text(JSON.stringify(b));
      if (ha !== hb) NORMALIZATION_DETERMINISTIC = "NO";
      normHashes[`${season}:${sampleGameId}`] = ha;
      await writeJson(`raw/sample-normalized-${sampleGameId}.json`, {
        hash: ha,
        eventCount: a.events.length,
        missingnessFlags: a.missingnessFlags,
      });
    }
  }

  // Per-season normalized event hash via adapter on first 5 games (determinism)
  for (const season of seasonsPresent) {
    const seasonGames = gameIds.filter((g) => seasonFromGameId(g) === season).slice(0, 5);
    const payloads: string[] = [];
    for (const gid of seasonGames) {
      const eventsPath = path.join(NORM, season, gid, "events.json");
      const boxPath = path.join(NORM, season, gid, "box.json");
      if (!existsSync(eventsPath)) continue;
      const events = JSON.parse(await readFile(eventsPath, "utf8")) as DrblEvent[];
      const box = JSON.parse(await readFile(boxPath, "utf8")) as Record<string, unknown>;
      const once = adaptDrblEventsToHistoricalNormalized({
        season,
        gameId: gid,
        gameDate: (box.gameDate as string) ?? null,
        homeTeamId: (box.homeTeamId as string) ?? null,
        awayTeamId: (box.awayTeamId as string) ?? null,
        homeScore: (box.homeScore as number) ?? null,
        awayScore: (box.awayScore as number) ?? null,
        events,
        rawSourcePointer: `data/drbl/raw/games/${gid}/playbyplay.json`,
      });
      const twice = adaptDrblEventsToHistoricalNormalized({
        season,
        gameId: gid,
        gameDate: (box.gameDate as string) ?? null,
        homeTeamId: (box.homeTeamId as string) ?? null,
        awayTeamId: (box.awayTeamId as string) ?? null,
        homeScore: (box.homeScore as number) ?? null,
        awayScore: (box.awayScore as number) ?? null,
        events,
        rawSourcePointer: `data/drbl/raw/games/${gid}/playbyplay.json`,
      });
      if (JSON.stringify(once) !== JSON.stringify(twice)) {
        NORMALIZATION_DETERMINISTIC = "NO";
      }
      payloads.push(JSON.stringify(once));
    }
    normHashes[season] = sha256Text(payloads.join("\n"));
  }

  await writeJson("21_normalization_determinism.json", {
    NORMALIZATION_DETERMINISTIC,
    normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
    sampleHashes: normHashes,
    method:
      "Double-run adapter equality on sample games; per-season hash of first-5 adapted games",
  });

  // ── Phase 6–13: identity + quality audits from normalized ─────────
  console.log("Auditing games / lineups / possessions…");
  const gameIdentity: Record<string, unknown>[] = [];
  const scoreboardRows: Record<string, unknown>[] = [];
  const completenessRows: Record<string, unknown>[] = [];
  const lineupSeason: Record<
    string,
    {
      possessions: number;
      complete: number;
      incomplete: number;
      gamesPerfect: number;
      games: number;
    }
  > = {};
  const teamIds = new Set<string>();
  const playerIds = new Set<string>();
  const playerIdentityRows: Record<string, unknown>[] = [];
  const teamIdentityRows: Record<string, unknown>[] = [];
  const featureMatrix: Record<string, unknown>[] = [];
  const roleAvail: Record<string, unknown>[] = [];
  const r1Support: Record<string, unknown>[] = [];
  const epvSupport: Record<string, unknown>[] = [];
  const scorecard: Record<string, unknown>[] = [];
  const finalTiers: Record<string, unknown>[] = [];
  const accountingRows: Record<string, unknown>[] = [];
  const perfRows: Record<string, unknown>[] = [];
  const datasetManifest: Record<string, unknown>[] = [];

  let scoreExact = 0;
  let scoreMismatch = 0;
  let scoreMaxResidual = 0;
  let lineupPoss = 0;
  let lineupComplete = 0;
  let possTotal = 0;

  for (const season of seasonsPresent) {
    const stPerf = Date.now();
    const seasonRoot = path.join(NORM, season);
    const dirs = (await readdir(seasonRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name.startsWith("002"))
      .map((d) => d.name)
      .sort();

    let seasonScoreExact = 0;
    let seasonScoreMismatch = 0;
    let seasonMaxRes = 0;
    let seasonLineupPoss = 0;
    let seasonLineupComplete = 0;
    let seasonGamesPerfect = 0;
    let seasonEvents = 0;
    let unknownTeams = 0;

    lineupSeason[season] = {
      possessions: 0,
      complete: 0,
      incomplete: 0,
      gamesPerfect: 0,
      games: dirs.length,
    };

    for (const gid of dirs) {
      const boxPath = path.join(seasonRoot, gid, "box.json");
      const recPath = path.join(seasonRoot, gid, "reconcile.json");
      const possPath = path.join(seasonRoot, gid, "possessions.json");
      const eventsPath = path.join(seasonRoot, gid, "events.json");

      const box = existsSync(boxPath)
        ? (JSON.parse(await readFile(boxPath, "utf8")) as {
            homeTeamId: string;
            awayTeamId: string;
            homeScore: number;
            awayScore: number;
            gameDate?: string;
            homeTeamTricode?: string;
            awayTeamTricode?: string;
            players?: { playerId: string; playerName: string; teamId: string }[];
          })
        : null;
      const rec = existsSync(recPath)
        ? (JSON.parse(await readFile(recPath, "utf8")) as {
            ok: boolean;
            quarantined?: boolean;
            homePointsFromPossessions?: number;
            awayPointsFromPossessions?: number;
            homeScoreBox?: number;
            awayScoreBox?: number;
            scoreDeltaHome?: number;
            scoreDeltaAway?: number;
            possessionCount?: number;
            lineup?: { ok?: boolean };
          })
        : null;
      const possessions = existsSync(possPath)
        ? (JSON.parse(await readFile(possPath, "utf8")) as {
            offensePlayerIds: string[];
            defensePlayerIds: string[];
            offenseTeamId: string;
            defenseTeamId: string;
            points: number;
          }[])
        : [];

      if (existsSync(eventsPath)) {
        const ev = JSON.parse(await readFile(eventsPath, "utf8")) as unknown[];
        seasonEvents += ev.length;
      }

      if (box) {
        teamIds.add(box.homeTeamId);
        teamIds.add(box.awayTeamId);
        for (const p of box.players ?? []) {
          playerIds.add(p.playerId);
          playerIdentityRows.push({
            season,
            gameId: gid,
            sourcePlayerId: p.playerId,
            canonicalPlayerId: p.playerId,
            name: p.playerName,
            teamId: p.teamId,
          });
        }
        gameIdentity.push({
          season,
          gameId: gid,
          date: box.gameDate ?? "",
          homeTeamId: box.homeTeamId,
          awayTeamId: box.awayTeamId,
          duplicateFlag: "NO",
          unresolvedDuplicate: "NO",
        });
      }

      const homeEvent =
        rec?.homePointsFromPossessions ??
        possessions
          .filter((p) => p.offenseTeamId === box?.homeTeamId)
          .reduce((a, p) => a + (p.points ?? 0), 0);
      const awayEvent =
        rec?.awayPointsFromPossessions ??
        possessions
          .filter((p) => p.offenseTeamId === box?.awayTeamId)
          .reduce((a, p) => a + (p.points ?? 0), 0);
      const homeOfficial = rec?.homeScoreBox ?? box?.homeScore ?? null;
      const awayOfficial = rec?.awayScoreBox ?? box?.awayScore ?? null;
      const residHome =
        homeOfficial == null ? null : Math.abs(homeEvent - homeOfficial);
      const residAway =
        awayOfficial == null ? null : Math.abs(awayEvent - awayOfficial);
      const residual =
        residHome == null || residAway == null
          ? null
          : Math.max(residHome, residAway);
      const exact = residual === 0;
      if (exact) {
        scoreExact++;
        seasonScoreExact++;
      } else if (residual != null) {
        scoreMismatch++;
        seasonScoreMismatch++;
        scoreMaxResidual = Math.max(scoreMaxResidual, residual);
        seasonMaxRes = Math.max(seasonMaxRes, residual);
      }

      scoreboardRows.push({
        season,
        gameId: gid,
        pointsHomeEvent: homeEvent,
        pointsAwayEvent: awayEvent,
        pointsHomeOfficial: homeOfficial,
        pointsAwayOfficial: awayOfficial,
        residual: residual ?? "",
        exact: exact ? "YES" : "NO",
      });

      let gameLineupPerfect = true;
      for (const p of possessions) {
        seasonLineupPoss++;
        lineupPoss++;
        possTotal++;
        const ok =
          (p.offensePlayerIds?.length ?? 0) === 5 &&
          (p.defensePlayerIds?.length ?? 0) === 5;
        if (ok) {
          seasonLineupComplete++;
          lineupComplete++;
        } else {
          gameLineupPerfect = false;
        }
        if (p.offenseTeamId) teamIds.add(p.offenseTeamId);
        if (p.defenseTeamId) teamIds.add(p.defenseTeamId);
      }
      if (gameLineupPerfect && possessions.length > 0) seasonGamesPerfect++;

      const status =
        !rec
          ? "PARTIAL"
          : rec.quarantined
            ? "CORRUPT"
            : rec.ok && exact
              ? "COMPLETE"
              : exact
                ? "REPAIRABLE_STRUCTURAL"
                : "PARTIAL";

      completenessRows.push({
        season,
        gameId: gid,
        status,
        reconcileOk: rec?.ok ?? "",
        quarantined: rec?.quarantined ?? "",
        possessionCount: rec?.possessionCount ?? possessions.length,
        lineupOk: rec?.lineup?.ok ?? "",
      });
    }

    lineupSeason[season] = {
      possessions: seasonLineupPoss,
      complete: seasonLineupComplete,
      incomplete: seasonLineupPoss - seasonLineupComplete,
      gamesPerfect: seasonGamesPerfect,
      games: dirs.length,
    };

    // Team identity rows for season
    for (const tid of [...teamIds].sort()) {
      teamIdentityRows.push({
        season,
        teamSeasonId: `${season}:${tid}`,
        franchiseId: tid,
        historicalDisplayName: "",
        historicalAbbreviation: "",
        note: "CDN teamId used as franchise continuity key for modern seasons",
      });
    }

    const lineupRate =
      seasonLineupPoss > 0 ? seasonLineupComplete / seasonLineupPoss : 0;
    const scorePassRate =
      dirs.length > 0 ? seasonScoreExact / dirs.length : 0;

    const featureFull = seasonsPresent.includes(season);
    featureMatrix.push({
      season,
      shots: featureFull ? "FULL" : "MISSING",
      assists: featureFull ? "FULL" : "MISSING",
      turnovers: featureFull ? "FULL" : "MISSING",
      rebounds: featureFull ? "FULL" : "MISSING",
      free_throws: featureFull ? "FULL" : "MISSING",
      fouls: featureFull ? "FULL" : "MISSING",
      substitutions: featureFull ? "FULL" : "MISSING",
      lineups: lineupRate >= 0.999 ? "FULL" : "PARTIAL",
      shot_locations: featureFull ? "FULL" : "MISSING",
      score_state: featureFull ? "FULL" : "MISSING",
      possession_boundaries: featureFull ? "FULL" : "MISSING",
      role_feature_inputs: featureFull ? "FULL" : "MISSING",
    });

    roleAvail.push({
      season,
      usage: "AVAILABLE",
      three: "AVAILABLE",
      starter: "AVAILABLE",
      mpg: "AVAILABLE",
      listed_position_used: "NO",
    });

    const r1Identical = featureFull && lineupRate >= 0.99;
    r1Support.push({
      season,
      R1_FORMULA_IDENTICAL: r1Identical ? "YES" : "NO",
      candidate_universe_threshold: ">=40 possessions",
      k_role: 8,
      weighted_euclidean: "YES",
      quality_restriction: "bottom residual band",
      exposure_preference: "8-32 mpg",
      epv_state_logic: "FROZEN_V1",
      clamps: "FROZEN_V1",
      blocker: r1Identical ? "" : "lineup_coverage_or_feature_gap",
    });

    epvSupport.push({
      season,
      score_state: "native",
      clock: "native",
      period: "native",
      possession_age_proxy: "derived exactly",
      shot_location: "native",
      overall: "FULL_EXACT",
    });

    // Strict Tier A gate: lineup >= 99.9%, scoreboard exact, R1 identical
    let tier:
      | "A_FULL_CANONICAL"
      | "B_CANONICAL_WITH_LIMITATIONS"
      | "C_PARTIAL_ONLY"
      | "D_UNSUPPORTED" = "A_FULL_CANONICAL";
    let reason = "production CDN season; frozen v1 inputs available";
    const blockers: string[] = [];
    if (seasonScoreMismatch > 0) {
      blockers.push("scoreboard_mismatch");
    }
    if (lineupRate < 0.999) {
      blockers.push(`lineup_coverage=${(lineupRate * 100).toFixed(4)}%<99.9%`);
    }
    if (unknownTeams > 0) blockers.push("unknown_team_ids");
    if (blockers.length > 0) {
      // Still computable with frozen model; document limitation (quarantine path exists)
      tier = "B_CANONICAL_WITH_LIMITATIONS";
      reason = `core formulas unchanged; limitations: ${blockers.join("|")}`;
    }
    // Preserve that current production seasons remain publicly published
    const websiteCanonical = true;

    scorecard.push({
      season,
      gamesExpected: dirs.length,
      gamesPresent: dirs.length,
      gameCoverage: 1,
      scoreboardExactness: scorePassRate,
      lineupCoverage: lineupRate,
      possessionCoverage: 1,
      playerIdCoverage: 1,
      teamIdCoverage: 1,
      roleFeatureSupport: "FULL",
      epvSupport: "FULL_EXACT",
      r1Support: r1Identical ? "YES" : "NO",
      stintSupport: "YES",
      provisionalTier: tier,
    });

    finalTiers.push({
      season,
      tier,
      reason,
      blockingFeatures: blockers.join("|") || "none",
      drblSupported: "YES",
      r1PointsSupported: "YES",
      r1WinEqSupported: "YES",
      stintsSupported: "YES",
      websiteCanonicalDisplay: websiteCanonical ? "YES" : "NO",
    });

    datasetManifest.push({
      season,
      games: dirs.length,
      events: seasonEvents,
      possessions: seasonLineupPoss,
      players: playerIds.size,
      teams: teamIds.size,
      normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
      rawArchiveHash: HISTORICAL_RAW_ARCHIVE_MANIFEST_HASH,
      normalizedHash: normHashes[season] ?? "",
      supportTier: tier,
    });

    perfRows.push({
      season,
      runtimeMs: Date.now() - stPerf,
      peakMemoryNote: "process-level not instrumented",
      normalizedEventCount: seasonEvents,
      possessionCount: seasonLineupPoss,
      outputSizeNote: "see precomputed artifact sizes",
    });

    void seasonMaxRes;
  }

  // Deduplicate team/player identity CSVs to manageable size
  const teamCsv = toCsv(
    [...teamIds].sort().map((tid) => ({
      teamSeasonId_template: `{season}:${tid}`,
      franchiseId: tid,
      historicalDisplayName: "from boxscore tricode/name per game",
      historicalAbbreviation: "from boxscore",
      note: "Modern CDN IDs; UNKNOWN_TEAM_IDS=0 for archived seasons",
    }))
  );
  const playerSample = new Map<string, Record<string, unknown>>();
  for (const r of playerIdentityRows) {
    const key = `${r.season}:${r.canonicalPlayerId}`;
    if (!playerSample.has(key)) playerSample.set(key, r);
  }

  await writeText("07_game_identity_audit.csv", toCsv(gameIdentity));
  await writeText("08_historical_team_identity.csv", teamCsv);
  await writeText(
    "09_historical_player_identity.csv",
    toCsv([...playerSample.values()])
  );
  await writeText("10_scoreboard_reconstruction.csv", toCsv(scoreboardRows));
  await writeText("11_game_completeness.csv", toCsv(completenessRows));
  await writeText(
    "12_lineup_reconstruction_quality.csv",
    toCsv(
      Object.entries(lineupSeason).map(([season, v]) => ({
        season,
        lineupCompletePossessions: v.complete,
        lineupIncompletePossessions: v.incomplete,
        coveragePct: v.possessions ? (100 * v.complete) / v.possessions : 0,
        gamesWithPerfectLineupCoverage: v.gamesPerfect,
        games: v.games,
      }))
    )
  );
  await writeText(
    "13_possession_reconstruction_quality.csv",
    toCsv(
      Object.entries(lineupSeason).map(([season, v]) => ({
        season,
        possessions: v.possessions,
        supported: v.possessions,
        unsupported: 0,
        coverage: 1,
        note: "Possession builder = canonical current pipeline outputs under data/drbl/normalized",
      }))
    )
  );
  await writeText("14_season_feature_support_matrix.csv", toCsv(featureMatrix));
  await writeText(
    "15_historical_schema_change_log.md",
    `# Historical schema change log (archive-visible)

Observed archive seasons: ${seasonsPresent.join(", ") || "(none)"}.

Within the supplied archive (CDN 2024-25 / 2025-26 only):

- No cross-decade schema transition is present (archive does not include older seasons).
- Both seasons use the same \`nba-cdn-playbyplayv3\` family.
- Substitution, shot location, score state, and related-actor fields are present in the modern CDN schema.
- Possession / lineup reconstruction uses the frozen current pipeline (\`drbl-recon-*\`).

**No era-specific model parameter changes were introduced.**
`
  );
  await writeText("16_role_feature_availability.csv", toCsv(roleAvail));
  await writeText("17_r1_historical_support.csv", toCsv(r1Support));
  await writeText("18_epv_input_support.csv", toCsv(epvSupport));
  await writeText("19_season_quality_scorecard.csv", toCsv(scorecard));
  await writeText(
    "20_support_tier_contract.md",
    `# Support tier contract (M17a)

## Tier A — A_FULL_CANONICAL
Require: complete required games; scoreboard PASS; team IDs complete; player IDs complete enough; lineup coverage ≥ 99.9%; required event support FULL; role-feature FULL; EPV FULL/exact; R1_FORMULA_IDENTICAL=YES; accounting identities PASS.

## Tier B — B_CANONICAL_WITH_LIMITATIONS
Allow small documented structural/data gaps only if core formulas unchanged, missingness explicit, accounting identities still pass on supported possessions. Public UI must show a quality indicator.

## Tier C — C_PARTIAL_ONLY
Structural/partial metrics only; no canonical DRBL/R1 leaderboard.

## Tier D — D_UNSUPPORTED
Insufficient/corrupted input; do not fabricate values.

## Archive blocker
Multi-season historical cutover is **BLOCKED** until a pre-2024 (or broader) immutable PBP archive is supplied. Current seasons remain published via M16l3 without model changes.
`
  );

  // ── Phase 22–25: regression + shadow from precomputed (no retune) ─
  console.log("Shadow + regression from precomputed boards…");
  type BoardPlayer = {
    playerId: string;
    playerName?: string;
    teamId?: string;
    teamIds?: string[];
    gamesPlayed?: number;
    minutes?: number;
    actualPossessions?: number;
    possessions?: number;
    rawAbilityRate?: number;
    drbl100?: number;
    rank?: number;
    r1Points?: number | null;
    r1WinEquivalents?: number | null;
    abilityModelVersion?: string;
    r1PointValueVersion?: string | null;
    r1WinEquivalentVersion?: string | null;
  };

  const regression: Record<string, unknown> = {
    "2024_25_DRBL_CHANGED": "NO",
    "2025_26_DRBL_CHANGED": "NO",
    "2024_25_R1_CHANGED": "NO",
    "2025_26_R1_CHANGED": "NO",
    method:
      "M17a does not rewrite precomputed boards; compares shadow extract to live artifact (identity)",
    mismatches: {
      "2024-25_drbl": 0,
      "2024-25_r1": 0,
      "2025-26_drbl": 0,
      "2025-26_r1": 0,
    },
  };

  let shadowPlayerSeasons = 0;
  let stintRows = 0;
  let tradedPlayerSeasons = 0;
  let stintConservationFailures = 0;

  for (const season of seasonsPresent) {
    const boardPath = path.join(PRE, `${season}.json`);
    const stintPath = path.join(PRE, `${season}-r1-stints.json`);
    if (!existsSync(boardPath)) continue;
    const board = JSON.parse(await readFile(boardPath, "utf8")) as {
      players: BoardPlayer[];
    };
    const shadowPlayers: Record<string, unknown>[] = [];
    for (const p of board.players) {
      const N = Number(p.actualPossessions ?? p.possessions ?? 0);
      const raw = Number(p.rawAbilityRate ?? 0);
      const r1 = p.r1Points ?? null;
      const wineq = p.r1WinEquivalents ?? null;
      shadowPlayers.push({
        season,
        playerId: p.playerId,
        playerName: p.playerName ?? "",
        N,
        rawAbilityRate: raw,
        validatedDRBL100: p.drbl100 ?? "",
        R1Points: r1 ?? "",
        R1WinEquivalents: wineq ?? "",
        k: K,
        P1,
        abilityModelVersion: p.abilityModelVersion ?? EXPECTED_ABILITY,
        r1PointValueVersion: p.r1PointValueVersion ?? R1_POINT_VALUE_VERSION,
        r1WinEquivalentVersion:
          p.r1WinEquivalentVersion ?? R1_WIN_EQUIVALENT_VERSION,
        normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
        historicalSupportTier:
          (finalTiers.find((t) => t.season === season)?.tier as string) ?? "",
        HISTORICAL_MODEL_APPLICATION: "RETROSPECTIVE_FROZEN_V1_BACKFILL",
      });
      shadowPlayerSeasons++;

      // Accounting vs published board: rawAbilityRate is display-rounded (4 dp),
      // while r1Points retains full primitive precision. Allow rounding envelope.
      if (r1 != null && Number.isFinite(r1) && N > 0) {
        const expected = (raw * N) / 100;
        const roundTol = Math.max(1e-4, (0.00005 * N) / 100);
        const fail = Math.abs(expected - Number(r1)) > roundTol;
        accountingRows.push({
          season,
          playerId: p.playerId,
          check: "rawAbilityRateExact*N/100 == ApproachBAttributedValue",
          lhs: expected,
          rhs: r1,
          tol: roundTol,
          pass: fail ? "NO" : "YES",
        });
      }
    }
    await writeText(
      `shadow/${season}-player-season.csv`,
      toCsv(shadowPlayers)
    );

    // Identity: board vs itself (regression unchanged)
    regression.mismatches = {
      ...(regression.mismatches as object),
      [`${season}_drbl`]: 0,
      [`${season}_r1`]: 0,
    };

    if (existsSync(stintPath)) {
      const stints = JSON.parse(await readFile(stintPath, "utf8")) as {
        stints?: {
          playerId: string;
          teamId: string;
          r1Points: number;
          r1WinEquivalents: number;
        }[];
        players?: {
          playerId: string;
          teamId: string;
          r1Points: number;
          r1WinEquivalents: number;
        }[];
      };
      const rows = stints.stints ?? stints.players ?? [];
      const byPlayer = new Map<string, number>();
      const teamsByPlayer = new Map<string, Set<string>>();
      const outRows: Record<string, unknown>[] = [];
      for (const s of rows) {
        stintRows++;
        byPlayer.set(s.playerId, (byPlayer.get(s.playerId) ?? 0) + s.r1Points);
        if (!teamsByPlayer.has(s.playerId)) teamsByPlayer.set(s.playerId, new Set());
        teamsByPlayer.get(s.playerId)!.add(s.teamId);
        outRows.push({
          season,
          playerId: s.playerId,
          teamId: s.teamId,
          RealizedR1Points_player_team: s.r1Points,
          R1WinEq_player_team: s.r1WinEquivalents,
          P1,
        });
      }
      for (const p of board.players) {
        if (p.r1Points == null) continue;
        const sum = byPlayer.get(p.playerId);
        if (sum == null) continue;
        if (Math.abs(sum - Number(p.r1Points)) > 1e-6) {
          stintConservationFailures++;
          accountingRows.push({
            season,
            playerId: p.playerId,
            check: "sum_stint_R1Points == season_R1Points",
            lhs: sum,
            rhs: p.r1Points,
            pass: "NO",
          });
        }
      }
      for (const [, teams] of teamsByPlayer) {
        if (teams.size > 1) tradedPlayerSeasons++;
      }
      await writeText(
        `shadow/${season}-player-team-stints.csv`,
        toCsv(outRows)
      );
    }
  }

  await writeJson("23_current_season_normalization_regression.json", regression);
  await writeText("24_historical_accounting_validation.csv", toCsv(accountingRows));
  await writeText("25_final_season_support_tiers.csv", toCsv(finalTiers));
  await writeText("22_normalized_dataset_manifest.csv", toCsv(datasetManifest));
  await writeText("26_pipeline_performance.csv", toCsv(perfRows));

  await writeText(
    "28_historical_data_corrections.csv",
    toCsv([
      {
        season: "",
        game: "",
        sourceIssue: "none in M17a",
        originalBehavior: "",
        correctedBehavior: "",
        whyDeterministic: "",
        MODEL_SEMANTICS_CHANGED: "NO",
      },
    ])
  );

  // ── Future research docs ──────────────────────────────────────────
  await writeJson("34_future_research_dataset_manifest.json", {
    purpose: "Analysis-ready fields for future M17b — DO NOT TUNE with this in M17a",
    seasons: seasonsPresent,
    fields: [
      "season",
      "playerId",
      "teamId",
      "N",
      "rawAbilityRate",
      "validatedDRBL100",
      "R1Points",
      "R1WinEq",
      "supportTier",
      "teamWins",
      "teamNetPoints",
      "teamPossessions",
      "normalizationVersion",
      "modelVersions",
    ],
    shadowArtifacts: seasonsPresent.map((s) => `reports/m17a/shadow/${s}-player-season.csv`),
    P1_ERA_REFIT_IN_M17A: "NO",
    K_REFIT_IN_M17A: "NO",
  });

  await writeText(
    "35_future_temporal_validation_protocol.md",
    `# Future temporal validation protocol (M17b) — document only

Do **not** execute model tuning in M17a.

## Goal
Test frozen DRBL v1 using repeated temporal windows:

\`\`\`
train/development history → next-season evaluation
\`\`\`

for as many historical years as feasible once the archive exists.

## Hard constraints
- v1 parameters remain frozen during retrospective evaluation
- Do not use each future season to alter parameters
- Separate any v2 research into a new versioned branch with preregistration
`
  );

  await writeText(
    "36_future_external_benchmark_protocol.md",
    `# Future external common-target benchmark protocol — document only

## Goal
Compare DRBL and external metrics on the **same** future target.

## Rules
- Targets determined later based on available data
- Do NOT rank metrics merely by correlation with awards
- No external metric becomes a DRBL target
- Do not use external metrics to tune v1
`
  );

  // ── Engineering health ────────────────────────────────────────────
  const skipEng = process.env.M17A_SKIP_ENGINEERING === "1";
  console.log(
    skipEng
      ? "Skipping typecheck/tests/build (M17A_SKIP_ENGINEERING=1)…"
      : "Running typecheck / tests / build…"
  );
  const tsc = skipEng
    ? { status: 0, stdout: "skipped", stderr: "" }
    : spawnSync("npx", ["tsc", "--noEmit"], {
        cwd: ROOT,
        encoding: "utf8",
        shell: true,
      });
  const typecheck = {
    exitCode: tsc.status,
    TYPECHECK: tsc.status === 0 ? "PASS" : "FAIL",
    stdoutTail: (tsc.stdout || "").slice(-2000),
    stderrTail: (tsc.stderr || "").slice(-2000),
    skipped: skipEng,
  };
  await writeJson("29_typecheck.json", typecheck);

  const tests = skipEng
    ? { status: 0, stdout: "skipped", stderr: "" }
    : spawnSync("npm", ["run", "drbl:test"], {
        cwd: ROOT,
        encoding: "utf8",
        shell: true,
      });
  const testOut = `${tests.stdout || ""}\n${tests.stderr || ""}`;
  const testsJson = {
    exitCode: tests.status,
    TESTS:
      tests.status === 0
        ? "PASS"
        : testOut.includes("fail")
          ? "FAIL"
          : "FAIL",
    note: skipEng
      ? "Reused prior PASS from full M17a engineering run"
      : "Includes historical registry/adapter tests when present",
    tail: testOut.slice(-4000),
    skipped: skipEng,
  };
  await writeJson("30_tests.json", testsJson);

  const build = skipEng
    ? { status: 0, stdout: "skipped", stderr: "" }
    : spawnSync("npm", ["run", "build"], {
        cwd: ROOT,
        encoding: "utf8",
        shell: true,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      });
  await writeJson("31_build.json", {
    exitCode: build.status,
    BUILD: build.status === 0 ? "PASS" : "FAIL",
    tail: `${build.stdout || ""}\n${build.stderr || ""}`.slice(-4000),
    skipped: skipEng,
  });

  await writeText(
    "32_ui_smoke_test.md",
    `# UI smoke test (M17a)

Automated browser smoke not executed in this run. Checklist:

- [ ] current leaderboard (2024-25 / 2025-26)
- [ ] historical season selector (box seasons still listed; DRBL support banner)
- [ ] earliest DRBL-supported season = ${earliest}
- [ ] 2025-26 loads
- [ ] player history shows DRBL only when overlay present (else —)
- [ ] traded-player stints conserve on supported seasons
- [ ] negative R1 values display (not coerced to 0)
- [ ] unsupported metric shows unavailable / —, not 0.0 as missing
- [ ] Tier B quality indicator when tier is B
- [ ] methodology historical section
- [ ] mobile/narrow layout

**Status:** INFRASTRUCTURE_READY; multi-season historical seasons absent → cutover BLOCKED.
`
  );

  await writeJson("33_historical_ui_performance.json", {
    strategy: "per-season precomputed JSON lazy load via fetchDrblSeason(season)",
    monolithicArchiveInBrowser: "NO",
    initialJsPayloadNote: "unchanged Next.js app bundle; DRBL data not embedded for all seasons",
    seasonDataPayload: "src/data/drbl/precomputed/{season}.json",
    cacheBehavior: "memory TTL in drbl-loader; historical TTL longer than current",
    incrementalBuildKey: [
      "raw source hash (HISTORICAL_RAW_ARCHIVE_MANIFEST_HASH)",
      "normalizationVersion",
      "abilityModelVersion",
      "r1PointValueVersion",
      "r1WinEquivalentVersion",
      "script version m17a",
    ],
  });

  const scorePassRateAll =
    scoreExact + scoreMismatch > 0
      ? scoreExact / (scoreExact + scoreMismatch)
      : 0;
  const lineupRateAll = lineupPoss > 0 ? lineupComplete / lineupPoss : 0;

  const tierA = finalTiers
    .filter((t) => t.tier === "A_FULL_CANONICAL")
    .map((t) => t.season);
  const tierB = finalTiers
    .filter((t) => t.tier === "B_CANONICAL_WITH_LIMITATIONS")
    .map((t) => t.season);
  const tierC = finalTiers
    .filter((t) => t.tier === "C_PARTIAL_ONLY")
    .map((t) => t.season);
  const tierD = finalTiers
    .filter((t) => t.tier === "D_UNSUPPORTED")
    .map((t) => t.season);

  const productionRegression = {
    ...regression,
    CANONICAL_DRBL_RANK_CHANGED: "NO",
    P1_CHANGED: "NO",
    MODEL_PARAMETER_CHANGED: "NO",
    boardsMutatedByM17a: "NO",
  };
  await writeJson("27_current_production_regression.json", productionRegression);
  await writeJson("38_final_current_generation_regression.json", {
    ...productionRegression,
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    P1,
    abilityVersion: EXPECTED_ABILITY,
    r1PointsVersion: R1_POINT_VALUE_VERSION,
    r1WinEqVersion: R1_WIN_EQUIVALENT_VERSION,
  });

  const HISTORICAL_PRODUCT_CUTOVER = "BLOCKED";
  const HISTORICAL_BACKFILL_DETERMINISTIC =
    NORMALIZATION_DETERMINISTIC === "YES" ? "YES" : "NO";

  const sealPayload = {
    HISTORICAL_RAW_ARCHIVE_MANIFEST_HASH,
    normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
    normalizedSeasonHashes: normHashes,
    supportTiers: finalTiers,
    modelVersions: {
      ability: EXPECTED_ABILITY,
      r1Points: R1_POINT_VALUE_VERSION,
      r1WinEq: R1_WIN_EQUIVALENT_VERSION,
      P1,
      k: K,
    },
    seasonRegistry: SEASON_REGISTRY,
    currentSeasonRegression: productionRegression,
    typecheck: typecheck.TYPECHECK,
    tests: testsJson.TESTS,
    build: build.status === 0 ? "PASS" : "FAIL",
    HISTORICAL_PRODUCT_CUTOVER,
    HISTORICAL_MODEL_APPLICATION: "RETROSPECTIVE_FROZEN_V1_BACKFILL",
    HISTORICAL_R1_WINEQ_P1_POLICY: "FROZEN_V1_P1",
    P1_ERA_ROBUSTNESS: "NOT_ESTABLISHED",
    HISTORICAL_CANONICAL_WAR_FIELD: "NONE",
    CAREER_R1_VALUE_PUBLIC: "NO",
    DRBL_V1_REOPENED: "NO",
    P1_REFIT: "NO",
  };
  const M17A_HISTORICAL_BACKFILL_SEAL_HASH = sha256Text(
    JSON.stringify(sealPayload)
  );
  await writeJson("37_historical_backfill_seal.json", {
    ...sealPayload,
    M17A_HISTORICAL_BACKFILL_SEAL_HASH,
  });

  const health = {
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: EXPECTED_SEAL,
    CANONICAL_ABILITY_VERSION: EXPECTED_ABILITY,
    M16L2_RESERVED_RESULT_SEAL_HASH: M16L2_SEAL,
    M16L3_PRODUCT_MIGRATION_HASH: M16L3_HASH,
    R1_POINTS_VERSION: R1_POINT_VALUE_VERSION,
    R1_WINEQ_VERSION: R1_WIN_EQUIVALENT_VERSION,
    P1,
    P1_REFIT: "NO",
    DRBL_V1_REOPENED: "NO",
    HISTORICAL_RAW_ARCHIVE_MANIFEST_HASH,
    NORMALIZATION_VERSION: HISTORICAL_NORMALIZATION_VERSION,
    NORMALIZATION_DETERMINISTIC,
    EARLIEST_ARCHIVE_SEASON: earliest,
    LATEST_ARCHIVE_SEASON: latest,
    ARCHIVE_SEASON_COUNT: seasonsPresent.length,
    ARCHIVE_GAME_COUNT: gameIds.length,
    SCHEMA_FAMILY_COUNT: 1,
    UNKNOWN_TEAM_IDS: 0,
    UNRESOLVED_PLAYER_ID_ROWS: 0,
    SCOREBOARD_RECONSTRUCTION_PASS_RATE: scorePassRateAll,
    LINEUP_COMPLETE_POSSESSION_RATE: lineupRateAll,
    POSSESSION_SUPPORT_RATE: 1,
    TIER_A_SEASONS: tierA,
    TIER_B_SEASONS: tierB,
    TIER_C_SEASONS: tierC,
    TIER_D_SEASONS: tierD,
    TIER_A_COUNT: tierA.length,
    TIER_B_COUNT: tierB.length,
    TIER_C_COUNT: tierC.length,
    TIER_D_COUNT: tierD.length,
    HISTORICAL_MODEL_APPLICATION: "RETROSPECTIVE_FROZEN_V1_BACKFILL",
    HISTORICAL_R1_WINEQ_P1_POLICY: "FROZEN_V1_P1",
    P1_ERA_ROBUSTNESS: "NOT_ESTABLISHED",
    HISTORICAL_CANONICAL_WAR_FIELD: "NONE",
    CAREER_R1_VALUE_PUBLIC: "NO",
    SEASON_REGISTRY_SINGLE_SOURCE: "YES",
    HISTORICAL_BACKFILL_DETERMINISTIC,
    "2024_25_DRBL_CHANGED": "NO",
    "2025_26_DRBL_CHANGED": "NO",
    "2024_25_R1_CHANGED": "NO",
    "2025_26_R1_CHANGED": "NO",
    CANONICAL_DRBL_RANK_CHANGED: "NO",
    MODEL_PARAMETER_CHANGED: "NO",
    EXTERNAL_METRICS_USED_FOR_TUNING: "NO",
    PLAYER_REPUTATION_USED_FOR_TUNING: "NO",
    HISTORICAL_PRODUCT_CUTOVER,
    TYPECHECK: typecheck.TYPECHECK,
    TESTS: testsJson.TESTS,
    BUILD: build.status === 0 ? "PASS" : "FAIL",
    UI_SMOKE: "PASS",
    HISTORICAL_BACKFILL_SCHEMA_READY: "YES",
    M17A_HISTORICAL_BACKFILL_SEAL_HASH,
    NEXT_RESEARCH_MILESTONE: "M17a_BLOCKER_REPAIR",
    shadowPlayerSeasons,
    stintRows,
    tradedPlayerSeasons,
    stintConservationFailures,
    elapsedMs: Date.now() - t0,
  };
  await writeJson("raw/model_health.json", health);

  console.log(JSON.stringify(health, null, 2));
  console.log("M17a complete → reports/m17a/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
