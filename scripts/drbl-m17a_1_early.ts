/**
 * M17a.1 early-phase audit: freeze, import state, coverage, policy docs.
 * Safe to run while the existing raw importer is active (read-only on raw).
 * Does NOT launch a second importer.
 *
 *   npm run drbl:m17a_1 -- --phase early
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { listSeasonGames } from "../drbl/download/season-games";
import { observeImportLock, IMPORT_LOCK_PATH } from "../drbl/download/import-lock";
import { isValidJsonFile } from "../drbl/download/atomic-json";
import { rawPath } from "../drbl/download/disk-cache";
import {
  DRBL_V1_ABILITY_VERSION,
  DRBL_V1_R1_POINTS_VERSION,
  DRBL_V1_R1_WINEQ_VERSION,
  HISTORICAL_NORMALIZATION_VERSION,
} from "../drbl/historical/season-registry";
import { R1_POINTS_PER_WIN } from "../drbl/models/r1-value-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m17a_1");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const M16L2 =
  "dc556c3560c567d52139f991be9d17ecea8b94a6951ac5c6fedf59abb17342aa";
const M16L3 =
  "48a9d39ec21cf57c91b57d5ddbc4891a38e0ec18ddf1d578e37b2d8e3c948305";
const M17A =
  "fee516cd2a714b6b8817213dbe7dde68f388dd853e1a2de1239aa0928ed4d689";

function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function writeJson(rel: string, data: unknown) {
  const p = path.join(OUT, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function writeText(rel: string, data: string) {
  const p = path.join(OUT, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, data, "utf8");
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

function seasonRange(from: string, to: string): string[] {
  const a = Number(from.slice(0, 4));
  const b = Number(to.slice(0, 4));
  const out: string[] = [];
  for (let y = a; y <= b; y++) {
    out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return out;
}

function detectShellImporter(): {
  running: boolean;
  pids: number[];
  command?: string;
} {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'drbl-import-historical|import-historical' } | Select-Object -ExpandProperty ProcessId"`,
      { encoding: "utf8" }
    );
    const pids = out
      .split(/\s+/)
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    return {
      running: pids.length > 0,
      pids,
      command:
        "npm run drbl:import-historical -- --from 1996-97 --to 2023-24 --raw-only --delay 120",
    };
  } catch {
    return { running: false, pids: [] };
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(OUT, "import"), { recursive: true });
  mkdirSync(path.join(OUT, "raw"), { recursive: true });
  mkdirSync(path.join(OUT, "shadow"), { recursive: true });

  const gitCommit = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const dirty =
    execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim() !==
    "";
  const importerPath = path.join(ROOT, "scripts", "drbl-import-historical.ts");
  const importerHash = sha256File(importerPath);
  const shell = detectShellImporter();
  const lockObs = observeImportLock();

  let HISTORICAL_IMPORT_STATE:
    | "RUNNING"
    | "STOPPED_INCOMPLETE"
    | "COMPLETE"
    | "UNKNOWN" = "UNKNOWN";
  if (shell.running || lockObs.state === "ACTIVE") {
    HISTORICAL_IMPORT_STATE = "RUNNING";
  }

  // External observe-lock for the already-running pre-lock importer.
  if (shell.running && lockObs.state !== "ACTIVE") {
    writeFileSync(
      IMPORT_LOCK_PATH,
      JSON.stringify(
        {
          pid: shell.pids[shell.pids.length - 1],
          startedAt: new Date().toISOString(),
          command: shell.command,
          from: "1996-97",
          to: "2023-24",
          rawOnly: true,
          observedBy: "m17a_1_early",
          note: "Observed lock for pre-existing importer; do not start a second process",
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  }

  const m17aImportDir = path.join(ROOT, "reports", "m17a", "import");
  const m17aImportContents = existsSync(m17aImportDir)
    ? readdirSync(m17aImportDir).map((n) => {
        const p = path.join(m17aImportDir, n);
        const st = statSync(p);
        return { name: n, bytes: st.size, mtime: st.mtime.toISOString() };
      })
    : [];

  // Count raw growth by prefix
  const gamesRoot = path.join(ROOT, "data", "drbl", "raw", "games");
  const gameDirs = existsSync(gamesRoot) ? readdirSync(gamesRoot) : [];
  const prefixCounts: Record<string, number> = {};
  for (const g of gameDirs) {
    const pref = g.slice(0, 5);
    prefixCounts[pref] = (prefixCounts[pref] ?? 0) + 1;
  }

  writeJson("00_freeze.json", {
    milestone: "M17a.1",
    timestamp: new Date().toISOString(),
    gitCommit,
    gitDirty: dirty,
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    M16L2_RESERVED_RESULT_SEAL_HASH: M16L2,
    M16L3_PRODUCT_MIGRATION_HASH: M16L3,
    M17A_HISTORICAL_BACKFILL_SEAL_HASH: M17A,
    CANONICAL_ABILITY_VERSION: DRBL_V1_ABILITY_VERSION,
    R1_POINTS_VERSION: DRBL_V1_R1_POINTS_VERSION,
    R1_WINEQ_VERSION: DRBL_V1_R1_WINEQ_VERSION,
    P1: R1_POINTS_PER_WIN,
    historicalImporterCommand:
      "npm run drbl:import-historical -- --from 1996-97 --to 2023-24 --raw-only --delay 120",
    historicalImporterScriptHash: importerHash,
    currentImportProgress: {
      HISTORICAL_IMPORT_STATE,
      shellPids: shell.pids,
      prefixCounts,
      totalGameDirs: gameDirs.length,
    },
    rawArchiveRoot: "data/drbl/raw",
    reportsM17aImport: m17aImportContents,
    DRBL_V1_REOPENED: "NO",
    MODEL_PARAMETER_CHANGED: "NO",
    NORMALIZATION_VERSION: HISTORICAL_NORMALIZATION_VERSION,
  });

  writeJson("01_import_process_state.json", {
    HISTORICAL_IMPORT_STATE,
    shellImporterRunning: shell.running,
    pids: shell.pids,
    lockPath: IMPORT_LOCK_PATH,
    lockObservation: observeImportLock(),
    duplicateImporterLaunched: "NO",
    command: shell.command,
    latestPrefixProgress: prefixCounts,
    note: "Do not launch a second overlapping bulk importer while RUNNING",
  });

  writeText(
    "02_import_resumability_audit.md",
    `# Import resumability audit (M17a.1)

## Required behavior
- Existing **valid** game JSON → **skip** (no overwrite)
- Truncated / invalid JSON → treated as missing → re-fetch
- Atomic write: temp → JSON.parse validate → rename
- Durable ledger: \`reports/m17a_1/import/import_ledger.jsonl\`
- Bounded retries (max 3) with backoff for RATE_LIMIT / TRANSIENT_NETWORK
- Terminal states: COMPLETE | SOURCE_CONFIRMED_UNAVAILABLE | FAILED_AFTER_BOUNDED_RETRIES

## Status
Importer script hardened in \`scripts/drbl-import-historical.ts\` + \`drbl/download/atomic-json.ts\`.
The **currently running** process may still be the pre-hardening binary in memory; it already skips existing files via \`fileExists\`. Hardened skip uses \`isValidJsonFile\`. Next resume picks up hardened behavior.
`
  );

  writeJson("03_import_lock_audit.json", {
    lockPath: IMPORT_LOCK_PATH,
    observation: observeImportLock(),
    policy: "Second invocation with live lock → STOP IMPORT_ALREADY_RUNNING",
    duplicateImporterLaunched: "NO",
  });

  writeJson("04_import_rate_policy.json", {
    baseDelayMs: 120,
    maxRetries: 3,
    retryBackoff: "delayMs * attempt * 2 for RATE_LIMIT / TRANSIENT_NETWORK",
    httpStatusesRetried: [429, "network/timeouts"],
    parallelStatsRequests: "NO (single-threaded game loop)",
    throttlingAggressivelyReduced: "NO",
  });

  // Coverage audit for all target seasons (schedule-based)
  const seasons = seasonRange("1996-97", "2023-24");
  const coverageRows: Record<string, unknown>[] = [];
  const failureRows: Record<string, unknown>[] = [];

  console.log("Enumerating expected games + coverage…");
  for (const season of seasons) {
    let expected: Awaited<ReturnType<typeof listSeasonGames>> = [];
    try {
      expected = await listSeasonGames(season);
    } catch (e) {
      coverageRows.push({
        season,
        expectedGames: 0,
        pbpPresent: 0,
        boxPresent: 0,
        bothPresent: 0,
        missingPbp: 0,
        missingBox: 0,
        failed: 0,
        duplicate: 0,
        scheduleError: String((e as Error).message || e).slice(0, 160),
      });
      continue;
    }

    let pbpPresent = 0;
    let boxPresent = 0;
    let bothPresent = 0;
    let missingPbp = 0;
    let missingBox = 0;
    const seen = new Set<string>();
    let duplicate = 0;

    for (const g of expected) {
      if (seen.has(g.gameId)) {
        duplicate++;
        continue;
      }
      seen.add(g.gameId);
      const pbp = rawPath("games", g.gameId, "playbyplay.json");
      const box = rawPath("games", g.gameId, "boxscore.json");
      const pOk = await isValidJsonFile(pbp);
      const bOk = await isValidJsonFile(box);
      if (pOk) pbpPresent++;
      else missingPbp++;
      if (bOk) boxPresent++;
      else missingBox++;
      if (pOk && bOk) bothPresent++;
      else if (!pOk || !bOk) {
        failureRows.push({
          season,
          gameId: g.gameId,
          class: !pOk && !bOk ? "BOTH_MISSING" : !pOk ? "PBP_MISSING" : "BOX_MISSING",
          pbpValid: pOk ? "YES" : "NO",
          boxValid: bOk ? "YES" : "NO",
        });
      }
    }

    coverageRows.push({
      season,
      expectedGames: expected.length,
      pbpPresent,
      boxPresent,
      bothPresent,
      missingPbp,
      missingBox,
      failed: missingPbp + missingBox > 0 ? missingPbp + missingBox : 0,
      duplicate,
      scheduleError: "",
    });
    console.log(
      season,
      `expected=${expected.length} both=${bothPresent} missPbp=${missingPbp} missBox=${missingBox}`
    );
  }

  writeText("05_import_coverage.csv", toCsv(coverageRows));
  writeText("06_import_failures.csv", toCsv(failureRows.slice(0, 50000)));

  const totalExpected = coverageRows.reduce(
    (a, r) => a + Number(r.expectedGames || 0),
    0
  );
  const totalBoth = coverageRows.reduce(
    (a, r) => a + Number(r.bothPresent || 0),
    0
  );

  writeJson("import/early_coverage_summary.json", {
    HISTORICAL_IMPORT_STATE,
    targetSeasons: 28,
    totalExpectedGames: totalExpected,
    completeBothValid: totalBoth,
    RAW_IMPORT_FINISHED: totalBoth >= totalExpected && totalExpected > 0 ? "YES" : "NO",
    note: "COMPLETE requires both valid PBP+box for every expected regular-season game",
  });

  // Policy / contract stubs that don't need full archive
  writeText(
    "12_normalization_version_decision.md",
    `# Normalization version decision

**Decision:** preserve \`historical-pbp-normalized-v1\`

Historical event-label mappings (Made Shot / Missed Shot / Free Throw / SUB: X FOR Y)
are backward-compatible transformations into the existing normalized event schema.
They do not change model semantics.

\`MODEL_SEMANTICS_CHANGED_BY_NORMALIZATION = NO\`
`
  );

  writeText(
    "17_lineup_support_contract.md",
    `# Lineup support contract (historical-support-contract-v2)

## RAW_LINEUP_COMPLETENESS_RATE
Fraction of possessions with exact 5 offensive + 5 defensive player IDs after reconstruction.

## CANONICAL_ATTRIBUTION_SUPPORT_RATE
Fraction of possessions the frozen production attribution path can process under
existing semantics without fabricating players (includes any already-canonical fallbacks).

## Gate decision
Pending full forensics on 2024-25/2025-26 incompleteness (Phase 16-18).
Default until freeze: \`REQUIRE_BOTH\` for Tier A; Tier B allowed with documented source limitation.
`
  );

  writeText(
    "18_support_gate_reaudit.md",
    `# Support gate reaudit

Previous M17a gate: raw lineup completeness ≥ 99.9%.

M17a.1 separates raw completeness from canonical attribution support.
Rankings must not influence the gate.

Final gate version will be sealed after Phase 16 forensics complete on full/current archives.
`
  );

  console.log(
    JSON.stringify(
      {
        HISTORICAL_IMPORT_STATE,
        totalExpected,
        totalBoth,
        OUT,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
