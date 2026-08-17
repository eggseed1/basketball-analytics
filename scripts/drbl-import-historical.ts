/**
 * Import historical NBA play-by-play (M17a.1 hardened).
 *
 * Source: stats.nba.com playbyplayv3 from 1996-97+; CDN when available (~2019-20+).
 * Box fallback: boxscoretraditionalv3 → CDN-shaped via stats-boxscore-adapt.
 *
 * Does NOT retune DRBL / k / P1 / R1.
 * Preserves --delay throttling. Single-process lock prevents duplicate importers.
 *
 * Examples:
 *   npm run drbl:import-historical -- --from 1996-97 --to 2023-24 --raw-only --delay 120
 *   npm run drbl:import-historical -- --from 1996-97 --to 1996-97 --limit 5
 */
import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames, processGame, processSeason } from "../drbl";
import {
  downloadCdnBoxScore,
  downloadCdnPlayByPlay,
  downloadStatsBoxScoreTraditionalV3,
  downloadStatsPlayByPlayV3,
} from "../drbl/download/cdn-client";
import { isValidJsonFile } from "../drbl/download/atomic-json";
import { rawPath, readOrFetchJson } from "../drbl/download/disk-cache";
import {
  acquireImportLock,
  releaseImportLock,
} from "../drbl/download/import-lock";
import { statsBoxScoreV3ToCdnShape } from "../drbl/download/stats-boxscore-adapt";

const MAX_ATTEMPTS = 3;

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function seasonStartYear(season: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(season.trim());
  if (!m) throw new Error(`Invalid season ${season}`);
  return Number(m[1]);
}

function seasonLabel(startYear: number): string {
  const end = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${end}`;
}

function seasonRange(from: string, to: string): string[] {
  const a = seasonStartYear(from);
  const b = seasonStartYear(to);
  if (b < a) throw new Error(`--to ${to} is before --from ${from}`);
  const out: string[] = [];
  for (let y = a; y <= b; y++) out.push(seasonLabel(y));
  return out;
}

function classifyError(err: unknown): string {
  const msg = String((err as Error)?.message || err);
  if (/HTTP 429|rate.?limit/i.test(msg)) return "RATE_LIMIT";
  if (/HTTP 404/.test(msg)) return "SOURCE_404";
  if (/HTTP 403/.test(msg)) return "SOURCE_UNAVAILABLE_OR_FORBIDDEN";
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(msg))
    return "TRANSIENT_NETWORK";
  if (/JSON|Unexpected token|parse/i.test(msg)) return "INVALID_JSON";
  if (/empty|no actions|adapt failed/i.test(msg)) return "SOURCE_EMPTY";
  return "UNKNOWN";
}

type LedgerRow = {
  season: string;
  gameId: string;
  pbpStatus: string;
  boxStatus: string;
  attemptCount: number;
  lastHttpStatus: string;
  bytesPbp: number | null;
  bytesBox: number | null;
  checksumPbp: string | null;
  checksumBox: string | null;
  completedAt: string | null;
  error: string | null;
  failureClass: string | null;
  terminalState: string;
};

async function downloadRawGame(
  gameId: string,
  force: boolean
): Promise<{
  pbp: "cdn" | "stats" | "cache";
  box: "cdn" | "stats" | "cache";
  bytesPbp: number | null;
  bytesBox: number | null;
  checksumPbp: string | null;
  checksumBox: string | null;
}> {
  const pbpFile = rawPath("games", gameId, "playbyplay.json");
  const boxFile = rawPath("games", gameId, "boxscore.json");
  let pbpSource: "cdn" | "stats" | "cache" = "cache";
  let boxSource: "cdn" | "stats" | "cache" = "cache";
  let bytesPbp: number | null = null;
  let bytesBox: number | null = null;
  let checksumPbp: string | null = null;
  let checksumBox: string | null = null;

  const pbpOk = !force && (await isValidJsonFile(pbpFile));
  if (pbpOk) {
    pbpSource = "cache";
  } else {
    try {
      const { meta } = await readOrFetchJson(
        pbpFile,
        () => downloadCdnPlayByPlay(gameId),
        {
          force,
          endpoint: `cdn.nba.com/liveData/playbyplay/playbyplay_${gameId}.json`,
        }
      );
      pbpSource = "cdn";
      bytesPbp = meta.byteLength;
      checksumPbp = meta.schemaHash;
    } catch {
      const { meta } = await readOrFetchJson(
        pbpFile,
        () => downloadStatsPlayByPlayV3(gameId),
        {
          force: true,
          endpoint: `stats.nba.com/stats/playbyplayv3?GameID=${gameId}`,
        }
      );
      pbpSource = "stats";
      bytesPbp = meta.byteLength;
      checksumPbp = meta.schemaHash;
    }
  }

  const boxOk = !force && (await isValidJsonFile(boxFile));
  if (boxOk) {
    boxSource = "cache";
  } else {
    try {
      const { meta } = await readOrFetchJson(
        boxFile,
        () => downloadCdnBoxScore(gameId),
        {
          force,
          endpoint: `cdn.nba.com/liveData/boxscore/boxscore_${gameId}.json`,
        }
      );
      boxSource = "cdn";
      bytesBox = meta.byteLength;
      checksumBox = meta.schemaHash;
    } catch {
      const { meta } = await readOrFetchJson(
        boxFile,
        async () => {
          const raw = await downloadStatsBoxScoreTraditionalV3(gameId);
          const adapted = statsBoxScoreV3ToCdnShape(raw);
          if (!adapted) throw new Error(`box adapt failed ${gameId}`);
          return adapted;
        },
        {
          force: true,
          endpoint: `stats.nba.com/stats/boxscoretraditionalv3?GameID=${gameId}`,
        }
      );
      boxSource = "stats";
      bytesBox = meta.byteLength;
      checksumBox = meta.schemaHash;
    }
  }

  if (!(await isValidJsonFile(pbpFile))) {
    throw new Error(`PBP_MISSING or INVALID_JSON after download ${gameId}`);
  }
  if (!(await isValidJsonFile(boxFile))) {
    throw new Error(`BOX_MISSING or INVALID_JSON after download ${gameId}`);
  }

  return {
    pbp: pbpSource,
    box: boxSource,
    bytesPbp,
    bytesBox,
    checksumPbp,
    checksumBox,
  };
}

async function main() {
  const from = arg("from") ?? "1996-97";
  const to = arg("to") ?? "2023-24";
  const delayMs = arg("delay") ? Number(arg("delay")) : 200;
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const force = hasFlag("force");
  const rawOnly = hasFlag("raw-only");
  const seasons = seasonRange(from, to);

  const command = process.argv.slice(2).join(" ");
  acquireImportLock({
    command: `drbl-import-historical ${command}`,
    from,
    to,
    rawOnly,
  });

  const logDir = path.join(process.cwd(), "reports", "m17a", "import");
  const m17a1Import = path.join(
    process.cwd(),
    "reports",
    "m17a_1",
    "import"
  );
  await mkdir(logDir, { recursive: true });
  await mkdir(m17a1Import, { recursive: true });
  const logPath = path.join(logDir, "historical_import_progress.jsonl");
  const ledgerPath = path.join(m17a1Import, "import_ledger.jsonl");
  const summaryPath = path.join(logDir, "historical_import_summary.json");

  console.log(
    JSON.stringify({
      from,
      to,
      seasons: seasons.length,
      delayMs,
      limit: limit ?? "all",
      rawOnly,
      force,
      maxAttempts: MAX_ATTEMPTS,
      lockPid: process.pid,
      earliestRecordedProbe: "1996-97 (stats.nba.com playbyplayv3)",
      note: "Does not retune DRBL v1; skip-existing; atomic JSON writes",
    })
  );

  const summary: {
    startedAt: string;
    seasons: Record<
      string,
      {
        games: number;
        ok: number;
        failed: number;
        skippedCached: number;
        errors: string[];
      }
    >;
  } = { startedAt: new Date().toISOString(), seasons: {} };

  try {
    for (const season of seasons) {
      if (
        !force &&
        (season === "2024-25" || season === "2025-26") &&
        !limit
      ) {
        console.log(`Skipping ${season} (already in production raw cache)`);
        continue;
      }

      console.log(`\n=== ${season} ===`);
      const games = await listSeasonGames(season);
      const slice = limit ? games.slice(0, limit) : games;
      const seasonStat = {
        games: slice.length,
        ok: 0,
        failed: 0,
        skippedCached: 0,
        errors: [] as string[],
      };
      summary.seasons[season] = seasonStat;

      if (!rawOnly) {
        const result = await processSeason(season, {
          force,
          limit,
          delayMs,
        });
        seasonStat.ok = result.gamesOk;
        seasonStat.failed = result.gamesFailed;
        await appendFile(
          logPath,
          JSON.stringify({
            ts: new Date().toISOString(),
            season,
            mode: "processSeason",
            result,
          }) + "\n"
        );
        console.log(result);
        continue;
      }

      for (let i = 0; i < slice.length; i++) {
        const g = slice[i]!;
        const pbpFile = rawPath("games", g.gameId, "playbyplay.json");
        const boxFile = rawPath("games", g.gameId, "boxscore.json");
        const bothValid =
          !force &&
          (await isValidJsonFile(pbpFile)) &&
          (await isValidJsonFile(boxFile));

        const ledger: LedgerRow = {
          season,
          gameId: g.gameId,
          pbpStatus: "PENDING",
          boxStatus: "PENDING",
          attemptCount: 0,
          lastHttpStatus: "",
          bytesPbp: null,
          bytesBox: null,
          checksumPbp: null,
          checksumBox: null,
          completedAt: null,
          error: null,
          failureClass: null,
          terminalState: "PENDING",
        };

        if (bothValid) {
          seasonStat.skippedCached++;
          seasonStat.ok++;
          ledger.pbpStatus = "CACHE";
          ledger.boxStatus = "CACHE";
          ledger.terminalState = "COMPLETE";
          ledger.completedAt = new Date().toISOString();
          await appendFile(ledgerPath, JSON.stringify(ledger) + "\n");
          if (i % 100 === 0 || i === slice.length - 1) {
            console.log(
              `${season} ${i + 1}/${slice.length} ${g.gameId} skipped=cache`
            );
          }
          continue;
        }

        let lastErr: unknown = null;
        let ok = false;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          ledger.attemptCount = attempt;
          try {
            const src = await downloadRawGame(g.gameId, force);
            ledger.pbpStatus = src.pbp.toUpperCase();
            ledger.boxStatus = src.box.toUpperCase();
            ledger.bytesPbp = src.bytesPbp;
            ledger.bytesBox = src.bytesBox;
            ledger.checksumPbp = src.checksumPbp;
            ledger.checksumBox = src.checksumBox;
            ledger.terminalState = "COMPLETE";
            ledger.completedAt = new Date().toISOString();
            seasonStat.ok++;
            ok = true;
            if (i % 25 === 0 || i === slice.length - 1) {
              console.log(
                `${season} ${i + 1}/${slice.length} ${g.gameId} pbp=${src.pbp} box=${src.box}`
              );
            }
            break;
          } catch (e) {
            lastErr = e;
            const cls = classifyError(e);
            ledger.failureClass = cls;
            ledger.error = String((e as Error).message || e).slice(0, 240);
            ledger.lastHttpStatus = /HTTP (\d+)/.exec(ledger.error)?.[1] ?? "";
            if (cls === "RATE_LIMIT" || cls === "TRANSIENT_NETWORK") {
              const backoff = delayMs * attempt * 2;
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }
            // Non-transient: stop retrying this game.
            break;
          }
        }

        if (!ok) {
          seasonStat.failed++;
          const msg = `${g.gameId}: ${String((lastErr as Error)?.message || lastErr).slice(0, 160)}`;
          seasonStat.errors.push(msg);
          ledger.terminalState =
            ledger.failureClass === "SOURCE_404" ||
            ledger.failureClass === "SOURCE_EMPTY"
              ? "SOURCE_CONFIRMED_UNAVAILABLE"
              : "FAILED_AFTER_BOUNDED_RETRIES";
          console.error("FAIL", msg, ledger.failureClass);
          await appendFile(
            logPath,
            JSON.stringify({
              ts: new Date().toISOString(),
              season,
              gameId: g.gameId,
              error: msg,
              failureClass: ledger.failureClass,
              terminalState: ledger.terminalState,
            }) + "\n"
          );
        }
        await appendFile(ledgerPath, JSON.stringify(ledger) + "\n");
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }

      if (slice[0]) {
        try {
          const processed = await processGame(slice[0], { force: false });
          console.log(`normalize smoke ${slice[0].gameId}`, {
            events: processed.events.length,
            possessions: processed.possessions.length,
            reconcileOk: processed.reconcile.ok,
            quarantined: processed.reconcile.quarantined,
          });
        } catch (e) {
          console.error("normalize smoke failed", e);
        }
      }
    }

    const finished = {
      ...summary,
      finishedAt: new Date().toISOString(),
      importerScriptSha256: createHash("sha256")
        .update(
          await import("node:fs/promises").then((fs) =>
            fs.readFile(
              path.join(process.cwd(), "scripts", "drbl-import-historical.ts")
            )
          )
        )
        .digest("hex"),
    };
    await writeFile(summaryPath, JSON.stringify(finished, null, 2) + "\n");
    console.log("\nDone.", summaryPath);
  } finally {
    releaseImportLock();
  }
}

main().catch((e) => {
  console.error(e);
  try {
    releaseImportLock();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
