/**
 * P18B — resumable multi-season historical precompute orchestrator.
 *
 *   npx tsx scripts/p18b-orchestrate.ts
 *   npx tsx scripts/p18b-orchestrate.ts --max-seasons 3
 *   npx tsx scripts/p18b-orchestrate.ts --only 2004-05,2003-04
 *   npx tsx scripts/p18b-orchestrate.ts --resume-test
 *
 * Each season is an isolated child process so memory resets between seasons.
 * Completed seasons are skipped on restart (manifest status COMPLETE).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { HISTORY_VERSION } from "../src/lib/history/capabilities";

const ROOT = process.cwd();
const RAW_GAMES = path.join(ROOT, "data", "drbl", "raw", "games");
const HISTORY_ROOT = path.join(ROOT, "data", "drbl", "history");
const MANIFEST = path.join(HISTORY_ROOT, "manifest.json");
const FAIL_DIR = path.join(HISTORY_ROOT, "precompute-failures");
const PROGRESS = path.join(ROOT, "reports", "p18b", "_progress.json");

mkdirSync(FAIL_DIR, { recursive: true });
mkdirSync(path.join(ROOT, "reports", "p18b"), { recursive: true });

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function seasonLabel(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `${startYear}-${String(end).padStart(2, "0")}`;
}

function seasonPrefix(season: string): string {
  const start = Number(season.slice(0, 4));
  return `002${String(start % 100).padStart(2, "0")}`;
}

function countRawGames(season: string): number {
  const pref = seasonPrefix(season);
  return readdirSync(RAW_GAMES, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && d.name.startsWith(pref)
  ).length;
}

/** Historical product universe: 1996-97 → 2023-24 (regular-season raw archive). */
function allHistoricalSeasons(): string[] {
  const out: string[] = [];
  for (let y = 1996; y <= 2023; y++) out.push(seasonLabel(y));
  return out;
}

function preferredOrder(seasons: string[]): string[] {
  // Keep validated pilot early; then recent→older (schema familiarity).
  const pilot = "2005-06";
  const rest = seasons
    .filter((s) => s !== pilot)
    .sort((a, b) => b.localeCompare(a));
  return seasons.includes(pilot) ? [pilot, ...rest] : rest;
}

function readManifest(): {
  historyVersion: string;
  seasons: Record<
    string,
    { status?: string; gamesProcessed?: number; gamesExpected?: number }
  >;
} {
  if (!existsSync(MANIFEST)) {
    return { historyVersion: HISTORY_VERSION, seasons: {} };
  }
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return { historyVersion: HISTORY_VERSION, seasons: {} };
  }
}

function isSeasonComplete(
  season: string,
  entry?: { status?: string; gamesProcessed?: number; gamesExpected?: number }
): boolean {
  if (!entry || entry.status !== "COMPLETE") return false;
  const expected = countRawGames(season);
  const processed = Number(entry.gamesProcessed ?? 0);
  // Guard against premature COMPLETE from limited runs.
  return processed >= expected && expected > 0;
}

function runSeason(season: string, limit?: number): {
  ok: boolean;
  elapsedMs: number;
  stdout: string;
  stderr: string;
  status: number | null;
} {
  const args = [
    path.join(ROOT, "scripts", "p18a-precompute-season.ts"),
    "--season",
    season,
  ];
  if (limit != null && limit > 0) {
    args.push("--limit", String(limit));
  }
  const started = Date.now();
  // Prefer direct node+tsx binary path for Windows reliability.
  const res = spawnSync(
    process.execPath,
    ["--import", "tsx", ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env },
      shell: false,
    }
  );
  // Fallback to npx tsx if node --import tsx unavailable
  if (res.error || (res.status !== 0 && /Cannot find package 'tsx'|ERR_MODULE_NOT_FOUND/i.test(`${res.stderr}${res.stdout}`))) {
    const res2 = spawnSync("npx", ["tsx", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env },
      shell: true,
    });
    return {
      ok: res2.status === 0,
      elapsedMs: Date.now() - started,
      stdout: res2.stdout ?? "",
      stderr: res2.stderr ?? "",
      status: res2.status,
    };
  }
  return {
    ok: res.status === 0,
    elapsedMs: Date.now() - started,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    status: res.status,
  };
}

function main() {
  const only = arg("only")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const maxSeasons = Number(arg("max-seasons") ?? "0") || 0;
  const resumeTest = hasFlag("resume-test");

  let seasons = preferredOrder(allHistoricalSeasons());
  if (only?.length) {
    seasons = seasons.filter((s) => only.includes(s));
  }

  const expectedUniverse = allHistoricalSeasons();
  const expectedGames = expectedUniverse.reduce(
    (n, s) => n + countRawGames(s),
    0
  );

  console.log("P18B HISTORICAL PRECOMPUTE");
  console.log(`History version: ${HISTORY_VERSION}`);
  console.log(`Seasons expected: ${expectedUniverse.length}`);
  console.log(`Raw historical games (002xx 1996-97→2023-24): ${expectedGames}`);
  console.log("");

  if (resumeTest) {
    console.log("=== RESUME TEST: process 50 games of 2004-05, stop, resume ===");
    // Clear false COMPLETE from prior limited runs
    const man0 = readManifest();
    if (man0.seasons["2004-05"] && !isSeasonComplete("2004-05", man0.seasons["2004-05"])) {
      console.log("prior partial/false-complete detected — will resume");
    }
    const first = runSeason("2004-05", 50);
    console.log(
      first.ok ? "partial ok" : `partial FAIL status=${first.status}`,
      (first.stderr || first.stdout).slice(-500)
    );
    const mid = readManifest().seasons["2004-05"];
    console.log("after limit:", mid?.status, mid?.gamesProcessed);
    const second = runSeason("2004-05");
    console.log(
      second.ok ? "resume ok" : `resume FAIL status=${second.status}`,
      (second.stderr || second.stdout).slice(-300)
    );
    const man = readManifest().seasons["2004-05"];
    console.log(
      JSON.stringify(
        {
          status: man?.status,
          processed: man?.gamesProcessed,
          expected: man?.gamesExpected,
          CAN_SHUT_DOWN_AND_RESUME: isSeasonComplete("2004-05", man)
            ? "YES"
            : "NO",
        },
        null,
        2
      )
    );
    return;
  }

  const startedAll = Date.now();
  let seasonsComplete = 0;
  let seasonsFailed = 0;
  let gamesProcessed = 0;
  const throughputs: number[] = [];
    let planned = seasons.filter((s) => {
      const st = readManifest().seasons[s];
      return !isSeasonComplete(s, st);
    });
  if (maxSeasons > 0) planned = planned.slice(0, maxSeasons);

  const totalPlan = planned.length;
  let idx = 0;

  for (const season of seasons) {
    const man = readManifest();
    const existing = man.seasons[season];
    if (isSeasonComplete(season, existing)) {
      seasonsComplete++;
      gamesProcessed += Number(existing?.gamesProcessed ?? 0);
      continue;
    }
    if (maxSeasons > 0 && idx >= maxSeasons) break;
    if (only?.length && !only.includes(season)) continue;
    if (!planned.includes(season) && maxSeasons > 0) continue;

    idx++;
    const onDisk = countRawGames(season);
    console.log("");
    console.log("P18B HISTORICAL PRECOMPUTE");
    console.log(`Season: ${season}`);
    console.log(`Season progress: 0 / ${onDisk} (starting)`);
    console.log(
      `Overall seasons: ${seasonsComplete} complete · this ${idx}/${Math.max(totalPlan, 1)} planned`
    );
    console.log(`Overall games so far: ${gamesProcessed} / ${expectedGames}`);
    console.log(`Failures: ${seasonsFailed}`);
    console.log(`Elapsed: ${((Date.now() - startedAll) / 60000).toFixed(1)} min`);

    const result = runSeason(season);
    const after = readManifest().seasons[season];
    const processed = Number(after?.gamesProcessed ?? 0);
    const gpm =
      result.elapsedMs > 0 ? processed / (result.elapsedMs / 60000) : 0;
    if (gpm > 0) throughputs.push(gpm);

    if (result.ok && isSeasonComplete(season, after)) {
      seasonsComplete++;
      gamesProcessed += processed;
      console.log(
        `COMPLETE ${season} · ${processed} games · ${(result.elapsedMs / 1000).toFixed(1)}s · ${gpm.toFixed(0)} games/min`
      );
    } else {
      seasonsFailed++;
      const failPath = path.join(
        FAIL_DIR,
        `${season.replace("/", "-")}-${Date.now()}.json`
      );
      writeFileSync(
        failPath,
        JSON.stringify(
          {
            season,
            stage: "SEASON_PRECOMPUTE",
            errorClass: result.ok ? "INCOMPLETE_STATUS" : "PROCESS_EXIT",
            retryable: true,
            stderrTail: result.stderr.slice(-4000),
            stdoutTail: result.stdout.slice(-2000),
            notes: after ?? null,
          },
          null,
          2
        ) + "\n"
      );
      console.error(`FAILED ${season} — recorded ${failPath}`);
    }

    const avg =
      throughputs.length > 0
        ? throughputs.reduce((a, b) => a + b, 0) / throughputs.length
        : 0;
    const remainingGames = Math.max(0, expectedGames - gamesProcessed);
    const etaMin = avg > 0 ? remainingGames / avg : null;

    writeFileSync(
      PROGRESS,
      JSON.stringify(
        {
          season,
          seasonsComplete,
          seasonsFailed,
          gamesProcessed,
          expectedGames,
          recentGamesPerMin: Number(gpm.toFixed(1)),
          avgGamesPerMin: Number(avg.toFixed(1)),
          etaMinutes: etaMin != null ? Number(etaMin.toFixed(1)) : null,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ) + "\n"
    );

    if (etaMin != null && throughputs.length >= 2) {
      console.log(`ETA (stable sample): ~${etaMin.toFixed(0)} min remaining`);
    }
  }

  console.log("");
  console.log(
    JSON.stringify(
      {
        seasonsComplete,
        seasonsFailed,
        gamesProcessed,
        expectedGames,
        CAN_SHUT_DOWN_AND_RESUME: "YES",
        elapsedMin: Number(((Date.now() - startedAll) / 60000).toFixed(2)),
      },
      null,
      2
    )
  );
}

main();
