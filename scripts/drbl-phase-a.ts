/**
 * DRBL Phase A CLI
 *
 * Examples:
 *   npx tsx scripts/drbl-phase-a.ts --game 0022400001
 *   npx tsx scripts/drbl-phase-a.ts --season 2024-25 --limit 5
 *   npx tsx scripts/drbl-phase-a.ts --season 2024-25 --limit 25 --delay 200
 */

import { listSeasonGames, processGame, processSeason } from "../drbl";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const season = arg("season") ?? "2024-25";
  const gameId = arg("game");
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const delay = arg("delay") ? Number(arg("delay")) : 150;
  const force = hasFlag("force");

  if (gameId) {
    const games = await listSeasonGames(season);
    const meta =
      games.find((g) => g.gameId === gameId) ??
      ({
        gameId,
        season,
        gameDate: "",
        homeTeamId: "",
        awayTeamId: "",
        homeTeamTricode: "",
        awayTeamTricode: "",
        homeScore: 0,
        awayScore: 0,
        status: 3,
      } as const);

    // If meta lacks teams, processGame still works from box.
    const filled =
      meta.homeTeamId
        ? meta
        : {
            ...meta,
            homeTeamId: "0",
            awayTeamId: "0",
          };

    console.log(`Processing game ${gameId} (${season})…`);
    const processed = await processGame(filled, { force });
    console.log({
      matchup: `${processed.box.awayTeamTricode}@${processed.box.homeTeamTricode}`,
      score: `${processed.box.awayScore}-${processed.box.homeScore}`,
      events: processed.events.length,
      possessions: processed.possessions.length,
      lineupSnapshots: processed.lineups.length,
      reconcileOk: processed.reconcile.ok,
      quarantined: processed.reconcile.quarantined,
      possessionPoints: `${processed.reconcile.awayPointsFromPossessions}-${processed.reconcile.homePointsFromPossessions}`,
      scoreDelta: {
        home: processed.reconcile.scoreDeltaHome,
        away: processed.reconcile.scoreDeltaAway,
      },
      lineupOk: processed.reconcile.lineup?.ok ?? null,
      lineupMinuteDiffs: processed.reconcile.lineup?.playerMinuteDiffs.slice(0, 5),
      warnings: processed.reconcile.warnings,
      playerDiffCount: processed.reconcile.playerDiffs.length,
      sampleDiffs: processed.reconcile.playerDiffs.slice(0, 8),
      endReasons: countBy(processed.possessions.map((p) => p.endReason)),
    });
    return;
  }

  console.log(
    `Processing ${season} (limit=${limit ?? "all"}, delay=${delay}ms)…`
  );
  const summary = await processSeason(season, {
    force,
    limit,
    delayMs: delay,
  });
  console.log(summary);
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
