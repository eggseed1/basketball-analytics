/**
 * M17a.1 acquisition supervisor (ops only).
 * - Keeps exactly one historical importer alive (resume if dead)
 * - Keeps exactly one read-only progress watcher alive
 * - Never starts a duplicate while an importer is healthy
 * - On terminal acquisition: write seal artifacts and exit
 *
 *   npx tsx scripts/drbl-m17a_1_supervisor.ts
 */
import { spawn, execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

import { observeImportLock, readImportLock } from "../drbl/download/import-lock";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m17a_1", "import");
const LOCK = path.join(ROOT, "data", "drbl", "raw", ".historical_import.lock");
const POLL_MS = 90_000;
const IMPORTER_CMD = [
  "npm",
  "run",
  "drbl:import-historical",
  "--",
  "--from",
  "1996-97",
  "--to",
  "2023-24",
  "--raw-only",
  "--delay",
  "120",
];

type Proc = { pid: number; parentPid: number; name: string; cmd: string };

function log(msg: string, extra?: unknown) {
  mkdirSync(OUT, { recursive: true });
  const row = {
    ts: new Date().toISOString(),
    msg,
    ...(extra ? { extra } : {}),
  };
  appendFileSync(path.join(OUT, "supervisor.jsonl"), JSON.stringify(row) + "\n");
  console.log(JSON.stringify(row));
}

function listMatching(pattern: string): Proc[] {
  try {
    const ps = `
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -match '${pattern}' -and
    $_.CommandLine -notmatch 'Get-CimInstance' -and
    $_.CommandLine -notmatch 'drbl-m17a_1_supervisor'
  } |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine |
  ConvertTo-Json -Compress
`;
    const out = execSync(`powershell -NoProfile -Command "${ps.replace(/\n/g, " ")}"`, {
      encoding: "utf8",
    }).trim();
    if (!out) return [];
    const parsed = JSON.parse(out) as
      | { ProcessId: number; ParentProcessId: number; Name: string; CommandLine: string }
      | { ProcessId: number; ParentProcessId: number; Name: string; CommandLine: string }[];
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

function importerProcs(): Proc[] {
  return listMatching("drbl-import-historical\\.ts").filter(
    (p) => !/drbl-m17a_1_import_progress/.test(p.cmd)
  );
}

function watcherProcs(): Proc[] {
  return listMatching("drbl-m17a_1_import_progress");
}

function importerRoots(procs: Proc[]): Proc[] {
  return procs.filter(
    (p) =>
      /cmd\.exe/i.test(p.name) &&
      /tsx scripts[\\/]+drbl-import-historical\.ts/.test(p.cmd)
  );
}

function leafImporterPid(procs: Proc[]): number | null {
  const nodes = procs.filter((p) => /node\.exe/i.test(p.name));
  if (!nodes.length) return null;
  const leaves = nodes.filter((n) => !nodes.some((c) => c.parentPid === n.pid));
  return (leaves[0] ?? nodes[nodes.length - 1]!).pid;
}

function watcherRoots(procs: Proc[]): Proc[] {
  return procs.filter((p) => /cmd\.exe/i.test(p.name));
}

function writeLock(pid: number) {
  const body = {
    pid,
    startedAt: new Date().toISOString(),
    command: IMPORTER_CMD.join(" "),
    from: "1996-97",
    to: "2023-24",
    rawOnly: true,
    note: "Supervisor-managed lock for live importer leaf PID",
  };
  writeFileSync(LOCK, JSON.stringify(body, null, 2) + "\n", "utf8");
  return body;
}

function clearOrphanLock() {
  const lock = readImportLock();
  if (!lock) return;
  const alive = importerProcs().some((p) => p.pid === lock.pid);
  if (!alive) {
    try {
      unlinkSync(LOCK);
      log("cleared_orphan_lock", { pid: lock.pid });
    } catch {
      /* ignore */
    }
  }
}

function spawnDetached(command: string, args: string[], logName: string): number {
  mkdirSync(OUT, { recursive: true });
  const outPath = path.join(OUT, logName);
  const outFd = require("node:fs").openSync(outPath, "a");
  const child = spawn(command, args, {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", outFd, outFd],
    shell: true,
    windowsHide: true,
  });
  child.unref();
  return child.pid ?? -1;
}

function readStatus(): Record<string, unknown> | null {
  const p = path.join(OUT, "status.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function acquisitionTerminal(status: Record<string, unknown> | null): boolean {
  if (!status) return false;
  if (status.RAW_IMPORT_FINISHED === "YES") return true;
  if (existsSync(path.join(OUT, "terminal_acquisition.json"))) return true;
  if (existsSync(path.join(OUT, "raw_import_completion_seal.json"))) return true;
  const expected = Number(status.expectedGames ?? 0);
  const complete = Number(status.completeGames ?? 0);
  const failed = Number(status.failedGames ?? status.terminalFailures ?? 0);
  const unavailable = Number(status.sourceUnavailableGames ?? 0);
  const remaining = Number(status.remainingGames ?? expected);
  // Prefer explicit remaining == 0 with importer idle checked by caller.
  if (expected > 0 && remaining === 0 && complete + failed + unavailable >= expected) {
    return true;
  }
  // All seasons complete via progress CSV
  const csv = path.join(OUT, "progress_by_season.csv");
  if (existsSync(csv)) {
    const lines = readFileSync(csv, "utf8").trim().split(/\r?\n/).slice(1);
    if (lines.length >= 28) {
      const allTerminal = lines.every((ln) => {
        const parts = ln.split(",");
        // terminal column near end — also accept status COMPLETE
        return parts.includes("YES") || parts.includes("COMPLETE") || parts.includes("PARTIAL_FAILURES");
      });
      // Safer: check terminal column index from header
      const header = readFileSync(csv, "utf8").trim().split(/\r?\n/)[0]!.split(",");
      const ti = header.indexOf("terminal");
      const si = header.indexOf("status");
      if (ti >= 0) {
        return lines.every((ln) => {
          const p = ln.split(",");
          return p[ti] === "YES" || p[si] === "COMPLETE" || p[si] === "PARTIAL_FAILURES";
        });
      }
      return allTerminal;
    }
  }
  return false;
}

function diskFreeGb(): number {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "[math]::Round((Get-Volume -DriveLetter C).SizeRemaining/1GB,2)"`,
      { encoding: "utf8" }
    ).trim();
    return Number(out);
  } catch {
    return 999;
  }
}

function ensureWatcher() {
  const procs = watcherProcs();
  const roots = watcherRoots(procs);
  if (roots.length > 1) {
    // Leave the oldest; kill newer cmd roots' trees carefully — only watcher cmds
    const sorted = roots.sort((a, b) => a.pid - b.pid);
    for (const extra of sorted.slice(1)) {
      try {
        execSync(`taskkill /PID ${extra.pid} /T /F`, { stdio: "ignore" });
        log("killed_extra_watcher_root", { pid: extra.pid });
      } catch {
        /* ignore */
      }
    }
  }
  const after = watcherProcs();
  if (watcherRoots(after).length === 0 && after.filter((p) => /node/i.test(p.name)).length === 0) {
    const pid = spawnDetached(
      "npm",
      ["run", "drbl:m17a_1:progress", "--", "--watch", "--interval", "120"],
      "watcher_stdout.log"
    );
    log("started_watcher", { spawnPid: pid });
  }
}

function ensureImporter() {
  const procs = importerProcs();
  const roots = importerRoots(procs);
  if (roots.length > 1) {
    writeFileSync(
      path.join(OUT, "BLOCKER_duplicate_importer.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          roots: roots.map((r) => ({ pid: r.pid, cmd: r.cmd })),
          note: "Multiple importer roots detected — supervisor will NOT start another; human may need to resolve",
        },
        null,
        2
      ) + "\n"
    );
    log("duplicate_importer_detected", { count: roots.length });
    return { running: true, duplicate: true, leafPid: leafImporterPid(procs) };
  }
  if (roots.length === 1 || leafImporterPid(procs)) {
    const leaf = leafImporterPid(procs);
    const lock = readImportLock();
    if (leaf && (!lock || lock.pid !== leaf)) {
      writeLock(leaf);
      log("reanchored_lock", { leaf });
    }
    return { running: true, duplicate: false, leafPid: leaf };
  }

  // No importer — resume if not terminal
  clearOrphanLock();
  const lockState = observeImportLock();
  if (lockState.state === "ORPHANED" || lockState.state === "STALE") {
    clearOrphanLock();
  }
  const pid = spawnDetached("npm", IMPORTER_CMD.slice(1), "importer_stdout.log");
  // npm run … → argv should be full. Fix: spawn npm with run args
  log("resumed_importer_spawn_attempt", { spawnPid: pid });
  return { running: false, duplicate: false, leafPid: null, resumed: true };
}

function resumeImporterProperly() {
  clearOrphanLock();
  // Prefer spawning via cmd so process tree matches detection
  const pid = spawnDetached(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      "npm run drbl:import-historical -- --from 1996-97 --to 2023-24 --raw-only --delay 120",
    ],
    "importer_stdout.log"
  );
  log("resumed_importer", { spawnPid: pid, command: IMPORTER_CMD.join(" ") });
  writeFileSync(
    path.join(OUT, "resume_events.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), spawnPid: pid }) + "\n",
    { flag: "a" }
  );
  return pid;
}

async function sealIfNeeded(): Promise<boolean> {
  const sealPath = path.join(OUT, "raw_import_completion_seal.json");
  if (existsSync(sealPath)) return true;
  log("running_terminal_seal");
  try {
    execSync("npx tsx scripts/drbl-m17a_1_seal_raw_import.ts", {
      cwd: ROOT,
      stdio: "inherit",
    });
    return existsSync(sealPath);
  } catch (e) {
    log("seal_failed", { error: String((e as Error).message || e).slice(0, 300) });
    return false;
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    path.join(OUT, "supervisor_alive.json"),
    JSON.stringify(
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        M17A_1_STATUS: "RAW_IMPORT_IN_PROGRESS",
        M17A_1_RESULT: "RAW_IMPORT_INCOMPLETE",
        M17B_AUTHORIZED: "NO",
      },
      null,
      2
    ) + "\n"
  );
  log("supervisor_start", { pid: process.pid });

  let resumeCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const free = diskFreeGb();
    if (free < 5) {
      writeFileSync(
        path.join(OUT, "BLOCKER_disk_space.json"),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            freeGb: free,
            note: "Insufficient disk — preserving raw archive; do not resume until space freed",
          },
          null,
          2
        ) + "\n"
      );
      log("blocker_disk", { free });
      process.exit(2);
    }

    ensureWatcher();

    const procs = importerProcs();
    const roots = importerRoots(procs);
    const status = readStatus();

    if (roots.length > 1) {
      writeFileSync(
        path.join(OUT, "BLOCKER_duplicate_importer.json"),
        JSON.stringify({ at: new Date().toISOString(), roots }, null, 2) + "\n"
      );
      log("blocker_duplicate");
      // Do not kill arbitrarily — wait for human. Keep watcher.
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }

    if (roots.length === 1) {
      const leaf = leafImporterPid(procs);
      if (leaf) {
        const lock = readImportLock();
        if (!lock || lock.pid !== leaf) {
          writeLock(leaf);
          log("lock_repair", { leaf, prior: lock?.pid ?? null });
        }
      }
      writeFileSync(
        path.join(OUT, "supervisor_alive.json"),
        JSON.stringify(
          {
            pid: process.pid,
            updatedAt: new Date().toISOString(),
            importerLeafPid: leaf,
            IMPORT_PROCESS_COUNT: 1,
            DUPLICATE_IMPORTER: "NO",
            M17A_1_STATUS: "RAW_IMPORT_IN_PROGRESS",
            M17A_1_RESULT: "RAW_IMPORT_INCOMPLETE",
            M17B_AUTHORIZED: "NO",
            resumeCount,
            statusSnapshot: {
              activeSeason: status?.activeSeason,
              completeGames: status?.completeGames,
              currentSeasonComplete: status?.currentSeasonComplete,
              health: status?.health,
            },
          },
          null,
          2
        ) + "\n"
      );
    } else {
      // No importer
      if (acquisitionTerminal(status)) {
        log("acquisition_terminal_importer_idle");
        const sealed = await sealIfNeeded();
        if (sealed) {
          log("supervisor_done_sealed");
          process.exit(0);
        }
      } else {
        resumeCount++;
        log("importer_missing_resuming", { resumeCount });
        resumeImporterProperly();
        // Give spawn time before next poll
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }

    // If importer idle but progress claims complete seasons only for prefix — wait for watcher
    if (roots.length === 0 && status && Number(status.remainingGames) === 0) {
      const sealed = await sealIfNeeded();
      if (sealed) {
        log("supervisor_done_sealed_remaining0");
        process.exit(0);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
