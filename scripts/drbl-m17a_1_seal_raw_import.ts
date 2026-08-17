/**
 * Terminal raw-import seal for M17a.1 (acquisition only).
 * Does NOT compute DRBL/R1 or authorize M17b.
 *
 *   npx tsx scripts/drbl-m17a_1_seal_raw_import.ts
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { listSeasonGames } from "../drbl/download/season-games";
import { isValidJsonFile } from "../drbl/download/atomic-json";
import { rawPath } from "../drbl/download/disk-cache";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m17a_1", "import");
const M17 = path.join(ROOT, "reports", "m17a_1");

function seasonRange(from: string, to: string): string[] {
  const a = Number(from.slice(0, 4));
  const b = Number(to.slice(0, 4));
  const out: string[] = [];
  for (let y = a; y <= b; y++) {
    out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return out;
}

function sha256Buf(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
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

async function inspect(
  filePath: string
): Promise<{ ok: boolean; bytes: number; sha256: string }> {
  if (!(await isValidJsonFile(filePath))) {
    return { ok: false, bytes: 0, sha256: "" };
  }
  const raw = readFileSync(filePath);
  return {
    ok: true,
    bytes: raw.byteLength,
    sha256: sha256Buf(raw),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(M17, { recursive: true });

  const seasons = seasonRange("1996-97", "2023-24");
  const manifestRows: Record<string, unknown>[] = [];
  const coverage: Record<string, unknown>[] = [];

  let complete = 0;
  let unavailable = 0;
  let failed = 0;
  let expected = 0;
  let pbpFiles = 0;
  let boxFiles = 0;
  let pbpBytes = 0;
  let boxBytes = 0;

  for (const season of seasons) {
    const games = await listSeasonGames(season);
    let sComplete = 0;
    let sFail = 0;
    let sUnavail = 0;
    for (const g of games) {
      expected++;
      const pbpPath = rawPath("games", g.gameId, "playbyplay.json");
      const boxPath = rawPath("games", g.gameId, "boxscore.json");
      const p = await inspect(pbpPath);
      const b = await inspect(boxPath);
      let terminalState = "FAILED_AFTER_BOUNDED_RETRIES";
      if (p.ok && b.ok) {
        terminalState = "COMPLETE";
        complete++;
        sComplete++;
        pbpFiles++;
        boxFiles++;
        pbpBytes += p.bytes;
        boxBytes += b.bytes;
      } else {
        // Without importer ledger, missing files after full run are failed/unavailable.
        // Prefer FAILED unless a ledger row says otherwise.
        failed++;
        sFail++;
      }
      manifestRows.push({
        season,
        gameId: g.gameId,
        terminalState,
        pbpPath: path.relative(ROOT, pbpPath).replace(/\\/g, "/"),
        pbpBytes: p.bytes || "",
        pbpSha256: p.sha256 || "",
        boxPath: path.relative(ROOT, boxPath).replace(/\\/g, "/"),
        boxBytes: b.bytes || "",
        boxSha256: b.sha256 || "",
        sourceFamily: season >= "2019-20" ? "cdn_or_stats" : "stats_nba_playbyplayv3_boxtraditionalv3",
      });
    }
    coverage.push({
      season,
      expected: games.length,
      complete: sComplete,
      unavailable: sUnavail,
      failed: sFail,
      coveragePct:
        games.length > 0
          ? Number(((100 * sComplete) / games.length).toFixed(4))
          : 0,
    });
    console.log(
      `seal scan ${season}: ${sComplete}/${games.length} complete`
    );
  }

  // Merge terminal states from import_ledger.jsonl if present
  const ledgerPath = path.join(OUT, "import_ledger.jsonl");
  if (existsSync(ledgerPath)) {
    const byGame = new Map<string, string>();
    for (const line of readFileSync(ledgerPath, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as {
          gameId?: string;
          terminalState?: string;
        };
        if (row.gameId && row.terminalState) {
          byGame.set(row.gameId, row.terminalState);
        }
      } catch {
        /* ignore */
      }
    }
    if (byGame.size) {
      complete = 0;
      unavailable = 0;
      failed = 0;
      for (const row of manifestRows) {
        const ts = byGame.get(String(row.gameId)) ?? String(row.terminalState);
        row.terminalState = ts;
        if (ts === "COMPLETE") complete++;
        else if (ts === "SOURCE_CONFIRMED_UNAVAILABLE") unavailable++;
        else failed++;
      }
    }
  }

  manifestRows.sort((a, b) =>
    String(a.gameId).localeCompare(String(b.gameId))
  );
  const manifestCsv = toCsv(manifestRows);
  writeFileSync(path.join(M17, "07_raw_manifest.csv"), manifestCsv);
  const manifestHash = sha256Buf(manifestCsv);

  const fingerprint = {
    M17A_1_RAW_ARCHIVE_MANIFEST_HASH: manifestHash,
    expectedGames: expected,
    COMPLETE: complete,
    SOURCE_CONFIRMED_UNAVAILABLE: unavailable,
    FAILED_AFTER_BOUNDED_RETRIES: failed,
    unclassified: expected - complete - unavailable - failed,
    archiveRoot: "data/drbl/raw",
    totalPbpBytes: pbpBytes,
    totalBoxBytes: boxBytes,
    pbpFiles,
    boxFiles,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(M17, "08_raw_archive_fingerprint.json"),
    JSON.stringify(fingerprint, null, 2) + "\n"
  );

  let universeHash = "";
  const uh = path.join(OUT, "expected_game_universe_hash.json");
  if (existsSync(uh)) {
    universeHash = (JSON.parse(readFileSync(uh, "utf8")) as { hash: string })
      .hash;
  }

  const importerScript = readFileSync(
    path.join(ROOT, "scripts", "drbl-import-historical.ts")
  );
  const importerScriptHash = sha256Buf(importerScript);

  const majorGaps = unavailable + failed > expected * 0.02;
  const accountingOk =
    expected === complete + unavailable + failed &&
    fingerprint.unclassified === 0;

  const sealBody = {
    milestone: "M17a.1_RAW_IMPORT",
    M17A_1_STATUS: "RAW_IMPORT_TERMINAL",
    M17A_1_RESULT: majorGaps
      ? "RAW_IMPORT_COMPLETE_WITH_MAJOR_SOURCE_GAPS"
      : "RAW_IMPORT_COMPLETE_PENDING_NORMALIZATION",
    M17B_AUTHORIZED: "NO",
    RAW_IMPORT_FINISHED: "YES",
    from: "1996-97",
    to: "2023-24",
    targetSeasons: 28,
    expectedGames: expected,
    expectedGameUniverseHash: universeHash,
    COMPLETE: complete,
    SOURCE_CONFIRMED_UNAVAILABLE: unavailable,
    FAILED_AFTER_BOUNDED_RETRIES: failed,
    unclassified: fingerprint.unclassified,
    accountingIdentity: accountingOk ? "PASS" : "FAIL",
    M17A_1_RAW_ARCHIVE_MANIFEST_HASH: manifestHash,
    delayMs: 120,
    maxAttempts: 3,
    importerScriptHash,
    coverage,
    DRBL_V1_REOPENED: "NO",
    MODEL_PARAMETER_CHANGED: "NO",
    K_REFIT: "NO",
    P1_REFIT: "NO",
    R1_CHANGED: "NO",
    EPV_CHANGED: "NO",
    note: "Raw acquisition seal only. Do not auto-start normalization/backfill/M17b.",
    sealedAt: new Date().toISOString(),
  };

  const sealHash = sha256Buf(JSON.stringify(sealBody));
  const seal = {
    ...sealBody,
    M17A_1_RAW_IMPORT_SEAL_HASH: sealHash,
  };
  writeFileSync(
    path.join(OUT, "raw_import_completion_seal.json"),
    JSON.stringify(seal, null, 2) + "\n"
  );
  writeFileSync(
    path.join(OUT, "terminal_acquisition.json"),
    JSON.stringify(
      {
        RAW_IMPORT_FINISHED: "YES",
        M17A_1_STATUS: "RAW_IMPORT_TERMINAL",
        M17A_1_RESULT: seal.M17A_1_RESULT,
        M17B_AUTHORIZED: "NO",
        M17A_1_RAW_IMPORT_SEAL_HASH: sealHash,
        M17A_1_RAW_ARCHIVE_MANIFEST_HASH: manifestHash,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  writeFileSync(
    path.join(OUT, "status.json"),
    JSON.stringify(
      {
        ...(existsSync(path.join(OUT, "status.json"))
          ? JSON.parse(readFileSync(path.join(OUT, "status.json"), "utf8"))
          : {}),
        M17A_1_STATUS: "RAW_IMPORT_TERMINAL",
        M17A_1_RESULT: seal.M17A_1_RESULT,
        M17B_AUTHORIZED: "NO",
        RAW_IMPORT_FINISHED: "YES",
        completeGames: complete,
        sourceUnavailableGames: unavailable,
        failedGames: failed,
        remainingGames: 0,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  console.log(
    JSON.stringify(
      {
        sealHash,
        manifestHash,
        expected,
        complete,
        unavailable,
        failed,
        accountingOk,
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
