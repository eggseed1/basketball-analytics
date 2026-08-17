/**
 * Read-only historical import progress reporter (M17a.1 ops).
 * Does NOT download and does NOT start an importer.
 *
 *   npx tsx scripts/drbl-m17a_1_import_progress.ts
 *   npx tsx scripts/drbl-m17a_1_import_progress.ts --watch --interval 120
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { listSeasonGames } from "../drbl/download/season-games";
import { isValidJsonFile } from "../drbl/download/atomic-json";
import { rawPath } from "../drbl/download/disk-cache";
import { observeImportLock, readImportLock } from "../drbl/download/import-lock";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m17a_1", "import");
const FROM = "1996-97";
const TO = "2023-24";
const DELAY_MS = 120;
/** No growth for this long while process alive → STALLED (not merely slow). */
const STALL_MS = 20 * 60 * 1000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function seasonRange(from: string, to: string): string[] {
  const a = Number(from.slice(0, 4));
  const b = Number(to.slice(0, 4));
  const out: string[] = [];
  for (let y = a; y <= b; y++) {
    out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return out;
}

function seasonPrefix(season: string): string {
  const start = Number(season.slice(0, 4));
  const yy = start >= 2000 ? start - 2000 : start - 1900;
  return `002${String(yy).padStart(2, "0")}`;
}

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

function sha256Text(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

type ImporterProc = {
  pid: number;
  parentPid: number;
  name: string;
  cmd: string;
};

function listImporterProcesses(): ImporterProc[] {
  try {
    // Exclude the process-list probe itself (its CommandLine also matches the script name).
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'drbl-import-historical\\.ts' -and $_.CommandLine -notmatch 'Get-CimInstance' -and $_.CommandLine -notmatch 'drbl-m17a_1_import_progress' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"`,
      { encoding: "utf8" }
    ).trim();
    if (!out) return [];
    const parsed = JSON.parse(out) as
      | {
          ProcessId: number;
          ParentProcessId: number;
          Name: string;
          CommandLine: string;
        }
      | {
          ProcessId: number;
          ParentProcessId: number;
          Name: string;
          CommandLine: string;
        }[];
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((p) => ({
      pid: p.ProcessId,
      parentPid: p.ParentProcessId,
      name: p.Name,
      cmd: String(p.CommandLine || ""),
    }));
  } catch {
    return [];
  }
}

function authoritativeNodePid(procs: ImporterProc[]): number | null {
  const nodes = procs.filter((p) => /node\.exe/i.test(p.name));
  if (!nodes.length) return null;
  const parentIds = new Set(nodes.map((n) => n.parentPid));
  // Prefer leaf worker (PID is not parent of another importer node).
  const leaves = nodes.filter((n) => !nodes.some((c) => c.parentPid === n.pid));
  const pick = leaves[0] ?? nodes.find((n) => parentIds.has(n.pid)) ?? nodes[0]!;
  return pick.pid;
}

/** One npm/cmd → tsx → node tree = 1 authoritative importer. */
function importProcessCount(procs: ImporterProc[]): number {
  const roots = procs.filter(
    (p) =>
      /cmd\.exe/i.test(p.name) &&
      /tsx scripts[\\/]+drbl-import-historical\.ts/.test(p.cmd)
  );
  if (roots.length > 0) return roots.length;
  return authoritativeNodePid(procs) ? 1 : 0;
}

type SeasonProgress = {
  season: string;
  expected: number;
  bothValid: number;
  pbpOnly: number;
  boxOnly: number;
  missingBoth: number;
  retryPending: number;
  permanentFailures: number;
  terminal: "NO" | "YES";
  expectedGames: number;
  completePbp: number;
  completeBox: number;
  bothComplete: number;
  missingPbp: number;
  missingBox: number;
  failed: number;
  lastCompletedGame: string;
  attempts: number;
  lastError: string;
  updatedAt: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "PARTIAL_FAILURES";
};

type WatchState = {
  startedAt: string;
  lastProgressAt: string;
  lastBothValid: number;
  lastActiveGame: string;
  previousBothValid: number;
};

function readWatchState(): WatchState {
  const p = path.join(OUT, "watch_state.json");
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as WatchState;
    } catch {
      /* fallthrough */
    }
  }
  const now = new Date().toISOString();
  return {
    startedAt: now,
    lastProgressAt: now,
    lastBothValid: 0,
    lastActiveGame: "",
    previousBothValid: 0,
  };
}

function writeStaticPolicyDocs() {
  writeFileSync(
    path.join(OUT, "both_valid_definition.json"),
    JSON.stringify(
      {
        BOTH_VALID:
          "valid parseable PBP JSON at data/drbl/raw/games/<gameId>/playbyplay.json AND valid parseable box JSON at data/drbl/raw/games/<gameId>/boxscore.json",
        pbpSources: [
          "cdn.nba.com liveData playbyplay (when available)",
          "stats.nba.com playbyplayv3 (historical fallback)",
        ],
        boxRawRepresentation:
          "For CDN-era: CDN liveData boxscore JSON. For older seasons: stats.nba.com boxscoretraditionalv3 adapted once into CDN-shaped JSON written as boxscore.json (adapted representation stored as the archive box artifact; original traditionalv3 body is not retained as a separate raw sibling in this archive layout).",
        notCountedAsRaw: [
          "normalized events",
          "possessions",
          "DRBL/R1 outputs",
          "mere directory existence",
          "zero-byte or unparseable JSON",
        ],
        atomicWrite: "temp → JSON.parse validate → rename (writeJsonAtomic)",
        MODEL_SEMANTICS_CHANGED: "NO",
      },
      null,
      2
    ) + "\n"
  );

  writeFileSync(
    path.join(OUT, "rate_policy.json"),
    JSON.stringify(
      {
        baseDelayMs: DELAY_MS,
        retryBackoff: "delayMs * attempt * 2 on RATE_LIMIT / TRANSIENT_NETWORK",
        maxAttempts: 3,
        rateLimitStatuses: [429],
        timeoutPolicy: "classify as TRANSIENT_NETWORK; bounded retry",
        concurrency: 1,
        note: "Do not speed up merely because archive is large.",
      },
      null,
      2
    ) + "\n"
  );

  if (!existsSync(path.join(OUT, "parser_corrections.csv"))) {
    writeFileSync(
      path.join(OUT, "parser_corrections.csv"),
      "issue,rawExample,priorParse,correctParse,seasonsAffected,testsAdded,MODEL_SEMANTICS_CHANGED\n"
    );
  }
  if (!existsSync(path.join(OUT, "event_vocabulary.csv"))) {
    writeFileSync(
      path.join(OUT, "event_vocabulary.csv"),
      "rawEventLabel,rawSubtype,firstSeasonSeen,lastSeasonSeen,count,mappedStatus,normalizedType\n"
    );
  }
  if (!existsSync(path.join(OUT, "expected_game_universe_changes.csv"))) {
    writeFileSync(
      path.join(OUT, "expected_game_universe_changes.csv"),
      "changedAt,oldDenominator,newDenominator,gameId,change,reason,source\n"
    );
  }
}

async function ensureExpectedUniverse(seasons: string[]): Promise<{
  rows: Record<string, unknown>[];
  total: number;
  hash: string;
}> {
  const universePath = path.join(OUT, "expected_game_universe.csv");
  const hashPath = path.join(OUT, "expected_game_universe_hash.json");
  const changesPath = path.join(OUT, "expected_game_universe_changes.csv");

  const rows: Record<string, unknown>[] = [];
  for (const season of seasons) {
    const games = await listSeasonGames(season);
    for (const g of games) {
      rows.push({
        season,
        gameId: g.gameId,
        gameDate: g.gameDate,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        regularSeasonCount: 1,
        postseasonCount: 0,
        otherGameClasses: 0,
        seasonType: "Regular Season",
        source: "stats.nba.com leaguegamelog",
      });
    }
  }
  rows.sort((a, b) =>
    String(a.gameId).localeCompare(String(b.gameId)) ||
    String(a.season).localeCompare(String(b.season))
  );

  const csv = toCsv(rows);
  const hash = sha256Text(csv);
  const total = rows.length;

  if (existsSync(hashPath)) {
    try {
      const prev = JSON.parse(readFileSync(hashPath, "utf8")) as {
        expectedGames: number;
        hash: string;
      };
      if (prev.expectedGames !== total || prev.hash !== hash) {
        appendFileSync(
          changesPath,
          [
            new Date().toISOString(),
            prev.expectedGames,
            total,
            "",
            "DENOMINATOR_OR_HASH_CHANGE",
            "listSeasonGames reconciliation vs prior frozen universe",
            "stats.nba.com leaguegamelog",
          ].join(",") + "\n"
        );
      }
    } catch {
      /* ignore */
    }
  }

  writeFileSync(universePath, csv);
  writeFileSync(
    hashPath,
    JSON.stringify(
      {
        expectedGames: total,
        hash,
        from: FROM,
        to: TO,
        seasonType: "Regular Season",
        source: "stats.nba.com leaguegamelog via listSeasonGames",
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );
  return { rows, total, hash };
}

async function inspectArtifact(
  filePath: string,
  gameId: string
): Promise<{
  ok: boolean;
  bytes: number;
  sha256: string;
  gameIdMatch: string;
}> {
  if (!(await isValidJsonFile(filePath))) {
    return { ok: false, bytes: 0, sha256: "", gameIdMatch: "NO_FILE_OR_INVALID" };
  }
  const raw = readFileSync(filePath);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  let gameIdMatch = "UNKNOWN";
  try {
    const j = JSON.parse(raw.toString("utf8")) as {
      game?: { gameId?: string };
      gameId?: string;
      meta?: { gameId?: string };
    };
    const found = String(j.game?.gameId ?? j.gameId ?? j.meta?.gameId ?? "");
    if (!found) gameIdMatch = "ABSENT_IN_PAYLOAD";
    else if (found === gameId) gameIdMatch = "YES";
    else gameIdMatch = `MISMATCH:${found}`;
  } catch {
    gameIdMatch = "PARSE_FAIL";
  }
  return {
    ok: gameIdMatch === "YES" || gameIdMatch === "ABSENT_IN_PAYLOAD",
    bytes: raw.byteLength,
    sha256,
    gameIdMatch,
  };
}

async function measureSeasonDetailed(
  season: string,
  writeLedgerRows: boolean
): Promise<{
  progress: SeasonProgress;
  ledgerRows: Record<string, unknown>[];
  lastActiveGame: string;
}> {
  const games = await listSeasonGames(season);
  let completePbp = 0;
  let completeBox = 0;
  let bothValid = 0;
  let pbpOnly = 0;
  let boxOnly = 0;
  let missingBoth = 0;
  let lastCompletedGame = "";
  let lastActiveGame = "";
  const ledgerRows: Record<string, unknown>[] = [];

  for (const g of games) {
    const pbpPath = rawPath("games", g.gameId, "playbyplay.json");
    const boxPath = rawPath("games", g.gameId, "boxscore.json");
    const p = await inspectArtifact(pbpPath, g.gameId);
    const b = await inspectArtifact(boxPath, g.gameId);
    if (p.ok) completePbp++;
    if (b.ok) completeBox++;
    if (p.ok && b.ok) {
      bothValid++;
      lastCompletedGame = g.gameId;
      lastActiveGame = g.gameId;
    } else if (p.ok && !b.ok) pbpOnly++;
    else if (!p.ok && b.ok) boxOnly++;
    else missingBoth++;

    if (writeLedgerRows) {
      const terminalState =
        p.ok && b.ok
          ? "COMPLETE"
          : p.ok || b.ok
            ? "IN_PROGRESS"
            : "PENDING";
      ledgerRows.push({
        season,
        gameId: g.gameId,
        pbpStatus: p.ok ? "VALID" : "MISSING_OR_INVALID",
        boxStatus: b.ok ? "VALID" : "MISSING_OR_INVALID",
        pbpBytes: p.bytes || "",
        boxBytes: b.bytes || "",
        pbpSha256: p.sha256 || "",
        boxSha256: b.sha256 || "",
        pbpGameIdMatch: p.gameIdMatch,
        boxGameIdMatch: b.gameIdMatch,
        attemptCount: "",
        lastHttpStatus: "",
        lastError: "",
        firstAttemptAt: "",
        lastAttemptAt: "",
        completedAt: p.ok && b.ok ? new Date().toISOString() : "",
        terminalState,
        note: "Synthesized from disk by read-only watcher; live importer may predate ledger writer",
      });
    }
  }

  const status: SeasonProgress["status"] =
    bothValid === 0
      ? "NOT_STARTED"
      : bothValid >= games.length
        ? "COMPLETE"
        : "IN_PROGRESS";

  const progress: SeasonProgress = {
    season,
    expected: games.length,
    bothValid,
    pbpOnly,
    boxOnly,
    missingBoth,
    retryPending: 0,
    permanentFailures: 0,
    terminal: status === "COMPLETE" ? "YES" : "NO",
    expectedGames: games.length,
    completePbp,
    completeBox,
    bothComplete: bothValid,
    missingPbp: games.length - completePbp,
    missingBox: games.length - completeBox,
    failed: 0,
    lastCompletedGame,
    attempts: 0,
    lastError: "",
    updatedAt: new Date().toISOString(),
    status,
  };
  return { progress, ledgerRows, lastActiveGame };
}

function classifyLock(
  lockPid: number | null,
  liveNodePid: number | null,
  importerRunning: boolean
): {
  lockState:
    | "ACTIVE_VALID"
    | "STALE"
    | "MISSING_WHILE_RUNNING"
    | "ORPHANED"
    | "NONE";
  action: string;
} {
  if (!importerRunning && lockPid == null) return { lockState: "NONE", action: "none" };
  if (importerRunning && lockPid == null)
    return {
      lockState: "MISSING_WHILE_RUNNING",
      action: "reanchor_to_live_node_pid",
    };
  if (!importerRunning && lockPid != null)
    return { lockState: "ORPHANED", action: "clear_after_confirm_no_importer" };
  if (importerRunning && liveNodePid != null && lockPid === liveNodePid)
    return { lockState: "ACTIVE_VALID", action: "none" };
  if (importerRunning && liveNodePid != null && lockPid !== liveNodePid)
    return {
      lockState: "STALE",
      action: "reanchor_to_live_node_pid",
    };
  return { lockState: "STALE", action: "inspect" };
}

function reanchorLock(livePid: number, command: string) {
  const lockPath = path.join(
    ROOT,
    "data",
    "drbl",
    "raw",
    ".historical_import.lock"
  );
  const body = {
    pid: livePid,
    startedAt: new Date().toISOString(),
    command,
    from: FROM,
    to: TO,
    rawOnly: true,
    note: "Re-anchored by read-only ops watcher to live importer node PID",
    reanchoredAt: new Date().toISOString(),
  };
  writeFileSync(lockPath, JSON.stringify(body, null, 2) + "\n", "utf8");
  return body;
}

async function once(): Promise<{
  rows: SeasonProgress[];
  completeSeasons: string[];
  health: string;
}> {
  mkdirSync(OUT, { recursive: true });
  writeStaticPolicyDocs();

  const seasons = seasonRange(FROM, TO);
  const procs = listImporterProcesses();
  const liveNodePid = authoritativeNodePid(procs);
  const IMPORT_PROCESS_COUNT = importProcessCount(procs);
  const DUPLICATE_IMPORTER = IMPORT_PROCESS_COUNT > 1 ? "YES" : "NO";

  const lockObs = observeImportLock();
  const lock = readImportLock();
  const lockClass = classifyLock(
    lock?.pid ?? null,
    liveNodePid,
    liveNodePid != null
  );

  const lockAudit: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    observedProcs: procs.map((p) => ({
      pid: p.pid,
      parentPid: p.parentPid,
      name: p.name,
      cmd: p.cmd.slice(0, 220),
    })),
    liveNodePid,
    lockPid: lock?.pid ?? null,
    priorObserve: lockObs.state,
    lockState: lockClass.lockState,
    action: lockClass.action,
    IMPORT_PROCESS_COUNT,
    DUPLICATE_IMPORTER,
    repairs: [] as unknown[],
  };

  if (
    lockClass.action === "reanchor_to_live_node_pid" &&
    liveNodePid != null
  ) {
    const repaired = reanchorLock(
      liveNodePid,
      "npm run drbl:import-historical -- --from 1996-97 --to 2023-24 --raw-only --delay 120"
    );
    (lockAudit.repairs as unknown[]).push({
      at: new Date().toISOString(),
      fromPid: lock?.pid ?? null,
      toPid: liveNodePid,
      reason: lockClass.lockState,
      body: repaired,
    });
    lockAudit.lockState = "ACTIVE_VALID";
  }

  writeFileSync(
    path.join(OUT, "lock_audit.json"),
    JSON.stringify(lockAudit, null, 2) + "\n"
  );

  // Expected universe: rebuild if missing or older than 12h, else reuse counts.
  const hashPath = path.join(OUT, "expected_game_universe_hash.json");
  let universeTotal = 33087;
  let universeHash = "";
  if (
    !existsSync(path.join(OUT, "expected_game_universe.csv")) ||
    !existsSync(hashPath)
  ) {
    const u = await ensureExpectedUniverse(seasons);
    universeTotal = u.total;
    universeHash = u.hash;
  } else {
    const h = JSON.parse(readFileSync(hashPath, "utf8")) as {
      expectedGames: number;
      hash: string;
    };
    universeTotal = h.expectedGames;
    universeHash = h.hash;
  }

  const expectedCachePath = path.join(OUT, "season_expected_cache.json");
  let expectedCache: Record<string, number> = {};
  if (existsSync(expectedCachePath)) {
    expectedCache = JSON.parse(readFileSync(expectedCachePath, "utf8"));
  }

  const gamesRoot = path.join(ROOT, "data", "drbl", "raw", "games");
  const allDirs = existsSync(gamesRoot) ? readdirSync(gamesRoot) : [];

  const rows: SeasonProgress[] = [];
  let activeLedger: Record<string, unknown>[] = [];
  let lastActiveGame = "";

  for (const season of seasons) {
    const pref = seasonPrefix(season);
    const hasAny = allDirs.some((d) => d.startsWith(pref));
    if (!hasAny && season !== "1996-97") {
      let expectedGames = expectedCache[season] ?? 0;
      if (!expectedGames) {
        try {
          expectedGames = (await listSeasonGames(season)).length;
        } catch {
          expectedGames = 0;
        }
      }
      expectedCache[season] = expectedGames;
      rows.push({
        season,
        expected: expectedGames,
        bothValid: 0,
        pbpOnly: 0,
        boxOnly: 0,
        missingBoth: expectedGames,
        retryPending: 0,
        permanentFailures: 0,
        terminal: "NO",
        expectedGames,
        completePbp: 0,
        completeBox: 0,
        bothComplete: 0,
        missingPbp: expectedGames,
        missingBox: expectedGames,
        failed: 0,
        lastCompletedGame: "",
        attempts: 0,
        lastError: "",
        updatedAt: new Date().toISOString(),
        status: "NOT_STARTED",
      });
      continue;
    }

    const writeLedger = season === "1996-97" || hasAny;
    const { progress, ledgerRows, lastActiveGame: lag } =
      await measureSeasonDetailed(season, writeLedger && season === "1996-97");
    if (season === "1996-97") {
      activeLedger = ledgerRows;
      lastActiveGame = lag || progress.lastCompletedGame;
    }
    expectedCache[season] = progress.expectedGames;
    rows.push(progress);

    writeFileSync(
      path.join(OUT, `checkpoint_${season}.json`),
      JSON.stringify(
        {
          season: progress.season,
          expected: progress.expected,
          bothValid: progress.bothValid,
          pbpOnly: progress.pbpOnly,
          boxOnly: progress.boxOnly,
          missingBoth: progress.missingBoth,
          retryPending: progress.retryPending,
          permanentFailures: progress.permanentFailures,
          terminal: progress.terminal,
          lastCompletedGame: progress.lastCompletedGame,
          updatedAt: progress.updatedAt,
          status: progress.status,
          M17A_1_STATUS: "RAW_IMPORT_IN_PROGRESS",
          note: "Season checkpoint — not a final seal",
        },
        null,
        2
      ) + "\n"
    );
  }

  writeFileSync(
    expectedCachePath,
    JSON.stringify(expectedCache, null, 2) + "\n"
  );

  // Progress CSV with required checkpoint fields
  writeFileSync(
    path.join(OUT, "progress_by_season.csv"),
    toCsv(
      rows.map((r) => ({
        season: r.season,
        expected: r.expected,
        bothValid: r.bothValid,
        pbpOnly: r.pbpOnly,
        boxOnly: r.boxOnly,
        missingBoth: r.missingBoth,
        retryPending: r.retryPending,
        permanentFailures: r.permanentFailures,
        terminal: r.terminal,
        completePbp: r.completePbp,
        completeBox: r.completeBox,
        lastCompletedGame: r.lastCompletedGame,
        status: r.status,
        updatedAt: r.updatedAt,
      }))
    )
  );

  if (activeLedger.length) {
    writeFileSync(
      path.join(OUT, "game_import_ledger.csv"),
      toCsv(activeLedger)
    );
    writeFileSync(
      path.join(OUT, "game_import_ledger_1996-97.csv"),
      toCsv(activeLedger)
    );
  }

  const totalBoth = rows.reduce((a, r) => a + r.bothValid, 0);
  const totalExpected = rows.reduce((a, r) => a + r.expected, 0) || universeTotal;
  const completeSeasons = rows
    .filter((r) => r.status === "COMPLETE")
    .map((r) => r.season);
  const active = rows.find((r) => r.status === "IN_PROGRESS");
  const terminalFailures = rows.reduce(
    (a, r) => a + r.permanentFailures,
    0
  );

  const watchState = readWatchState();
  if (totalBoth > watchState.lastBothValid) {
    watchState.lastProgressAt = new Date().toISOString();
    watchState.previousBothValid = watchState.lastBothValid;
    watchState.lastBothValid = totalBoth;
    watchState.lastActiveGame = lastActiveGame || watchState.lastActiveGame;
  }
  writeFileSync(
    path.join(OUT, "watch_state.json"),
    JSON.stringify(watchState, null, 2) + "\n"
  );

  const sinceProgress =
    Date.now() - new Date(watchState.lastProgressAt).getTime();
  let health: "HEALTHY_THROTTLED" | "STALLED" | "DEAD" | "MISSING_IMPORTER" =
    "HEALTHY_THROTTLED";
  if (!liveNodePid) {
    health =
      totalBoth >= totalExpected ? "DEAD" : "MISSING_IMPORTER";
  } else if (sinceProgress > STALL_MS) {
    health = "STALLED";
  }

  // Newest file mtime among active prefix
  let latestFileActivity: string | null = null;
  if (active) {
    const pref = seasonPrefix(active.season);
    const dirs = allDirs.filter((d) => d.startsWith(pref));
    let newest = 0;
    for (const d of dirs.slice(-30)) {
      try {
        const st = statSync(path.join(gamesRoot, d));
        if (st.mtimeMs > newest) {
          newest = st.mtimeMs;
          latestFileActivity = st.mtime.toISOString();
        }
      } catch {
        /* ignore */
      }
    }
  }

  const status = {
    status: "RAW_IMPORT_IN_PROGRESS",
    M17A_1_STATUS: "RAW_IMPORT_IN_PROGRESS",
    M17A_1_RESULT: "RAW_IMPORT_INCOMPLETE",
    M17B_AUTHORIZED: "NO",
    RAW_IMPORT_FINISHED: "NO",
    activeSeason: active?.season ?? null,
    activeGame: lastActiveGame || watchState.lastActiveGame || null,
    livePid: liveNodePid,
    lockState: lockAudit.lockState,
    IMPORT_PROCESS_COUNT,
    DUPLICATE_IMPORTER,
    targetSeasonCount: 28,
    expectedGames: totalExpected,
    expectedGameUniverseHash: universeHash,
    completeGames: totalBoth,
    terminalFailures,
    remainingGames: totalExpected - totalBoth - terminalFailures,
    currentSeasonExpected: active?.expected ?? null,
    currentSeasonComplete: active?.bothValid ?? null,
    startedAt: watchState.startedAt,
    lastProgressAt: watchState.lastProgressAt,
    updatedAt: new Date().toISOString(),
    estimatedPercentComplete:
      totalExpected > 0
        ? Number(((100 * totalBoth) / totalExpected).toFixed(4))
        : 0,
    health,
    latestFileActivity,
    delayMs: DELAY_MS,
    importerCommand:
      "npm run drbl:import-historical -- --from 1996-97 --to 2023-24 --raw-only --delay 120",
    importerPids: procs.map((p) => p.pid),
    completeSeasons,
    note: "Read-only ops status. NOT a final seal. BOTH_VALID = valid PBP JSON + valid box JSON.",
  };

  writeFileSync(path.join(OUT, "status.json"), JSON.stringify(status, null, 2) + "\n");
  appendFileSync(
    path.join(OUT, "progress_snapshots.jsonl"),
    JSON.stringify(status) + "\n"
  );

  console.log(
    JSON.stringify(
      {
        health,
        active: status.activeSeason,
        progress: active
          ? `${active.bothValid}/${active.expected}`
          : null,
        completeGames: totalBoth,
        expectedGames: totalExpected,
        livePid: liveNodePid,
        lockState: lockAudit.lockState,
        IMPORT_PROCESS_COUNT,
        DUPLICATE_IMPORTER,
      },
      null,
      2
    )
  );

  return { rows, completeSeasons, health };
}

async function maybeValidateCompleted(rows: SeasonProgress[]) {
  for (const r of rows) {
    if (r.terminal !== "YES" && r.status !== "COMPLETE") continue;
    const summary = path.join(OUT, "season_validation", r.season, "summary.json");
    const acq = path.join(OUT, `${r.season}_acquisition_validation.json`);
    if (existsSync(acq) || existsSync(summary)) continue;
    console.log(
      `Season ${r.season} terminal — data-quality validation only (no model)…`
    );
    try {
      execSync(
        `npx tsx scripts/drbl-m17a_1_season_validate.ts --season ${r.season}`,
        { stdio: "inherit", cwd: ROOT }
      );
      // Promote required Phase-16 filenames if summary exists
      if (existsSync(summary)) {
        const s = JSON.parse(readFileSync(summary, "utf8"));
        writeFileSync(
          acq,
          JSON.stringify(
            {
              ...s,
              kind: "PROVISIONAL_DATA_QUALITY_DIAGNOSTIC",
              MODEL_SEMANTICS_CHANGED: "NO",
              M17B_AUTHORIZED: "NO",
            },
            null,
            2
          ) + "\n"
        );
        const failCsv = path.join(
          OUT,
          "season_validation",
          r.season,
          "scoreboard.csv"
        );
        if (existsSync(failCsv)) {
          const lines = readFileSync(failCsv, "utf8").split(/\r?\n/);
          const header = lines[0] ?? "";
          const fails = lines.filter(
            (ln, i) => i > 0 && ln && /,(NO|false),/i.test(ln)
          );
          writeFileSync(
            path.join(OUT, `${r.season}_scoreboard_failures.csv`),
            [header, ...fails].join("\n") + (fails.length ? "\n" : "")
          );
        }
      }
    } catch (e) {
      console.error(`Validation failed for ${r.season}:`, e);
    }
  }
}

async function main() {
  const watch = hasFlag("watch");
  const intervalSec = Number(arg("interval") ?? "120");
  if (!watch) {
    const { rows } = await once();
    await maybeValidateCompleted(rows);
    return;
  }
  console.log(
    `Watching import progress every ${intervalSec}s (read-only; no importer launch)…`
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows, completeSeasons, health } = await once();
    await maybeValidateCompleted(rows);
    writeFileSync(
      path.join(OUT, "watch_signal.json"),
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          health,
          season_1996_97_complete:
            rows.find((r) => r.season === "1996-97")?.terminal === "YES",
          completeSeasons,
        },
        null,
        2
      ) + "\n"
    );

    const allTerminal = rows.every(
      (r) => r.terminal === "YES" || r.expected === 0
    );
    const procs = listImporterProcesses();
    if (!authoritativeNodePid(procs) && allTerminal) {
      console.log("Importer stopped and all seasons terminal.");
      writeFileSync(
        path.join(OUT, "terminal_acquisition.json"),
        JSON.stringify(
          {
            RAW_IMPORT_FINISHED: "YES",
            M17A_1_STATUS: "RAW_IMPORT_TERMINAL",
            M17A_1_RESULT: "RAW_IMPORT_COMPLETE_PENDING_NORMALIZATION",
            M17B_AUTHORIZED: "NO",
            note: "STOP FOR AUDIT — do not auto-start normalization/backfill/M17b",
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        ) + "\n"
      );
      break;
    }
    if (health === "MISSING_IMPORTER" && !allTerminal) {
      writeFileSync(
        path.join(OUT, "importer_missing_alert.json"),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            health,
            note: "Importer not running while archive incomplete — classify stop reason before resume",
            M17A_1_STATUS: "RAW_IMPORT_IN_PROGRESS",
            doNotAutoStartDuplicate: true,
          },
          null,
          2
        ) + "\n"
      );
    }
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
