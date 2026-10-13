/**
 * Sample historical games and report how many have reconstructed minutes
 * within ±2 of the box score. Does not publish a season.
 *
 *   npx tsx scripts/drbl-lineup-yield.ts --seasons 2019-20,2018-19 --sample 16
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames, processGame } from "../drbl";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function evenSample<T>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (rows.length - 1)) / (n - 1));
    out.push(rows[idx]!);
  }
  return out;
}

async function main() {
  const seasons = (arg("seasons") ?? "2019-20,2018-19").split(",").map((s) => s.trim());
  const sample = arg("sample") ? Number(arg("sample")) : 16;
  const outDir = path.join(process.cwd(), "reports", "historical-lineup-yield");
  await mkdir(outDir, { recursive: true });
  const logPath = path.join(outDir, "yield.jsonl");

  for (const season of seasons) {
    const games = await listSeasonGames(season);
    const picked = evenSample(games, sample);
    let minutesOk = 0;
    let scoreBad = 0;
    let minutesBad = 0;
    let failed = 0;
    console.log(`\n=== ${season} sample ${picked.length}/${games.length} ===`);
    for (const meta of picked) {
      try {
        const processed = await processGame(meta, { persist: false });
        const lineup = processed.reconcile.lineup;
        const diffs = lineup?.playerMinuteDiffs ?? [];
        const abs = diffs.reduce((sum, d) => sum + Math.abs(d.delta), 0);
        const row = {
          season,
          gameId: meta.gameId,
          date: meta.gameDate,
          quarantined: processed.reconcile.quarantined,
          minutesOk: Boolean(lineup?.ok),
          playersOff: diffs.length,
          absMinuteError: Math.round(abs * 10) / 10,
          worst: diffs[0]
            ? `${diffs[0].playerName} ${diffs[0].delta > 0 ? "+" : ""}${diffs[0].delta}`
            : "",
        };
        if (processed.reconcile.quarantined) scoreBad += 1;
        else if (lineup?.ok) minutesOk += 1;
        else minutesBad += 1;
        await appendFile(logPath, JSON.stringify(row) + "\n");
        console.log(JSON.stringify(row));
      } catch (error) {
        failed += 1;
        const row = {
          season,
          gameId: meta.gameId,
          error: error instanceof Error ? error.message : String(error),
        };
        await appendFile(logPath, JSON.stringify(row) + "\n");
        console.log(JSON.stringify(row));
      }
    }
    console.log(
      JSON.stringify({
        season,
        attempted: picked.length,
        minutesOk,
        minutesBad,
        scoreBad,
        failed,
        keepRate: Math.round((minutesOk / picked.length) * 1000) / 10,
      })
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
