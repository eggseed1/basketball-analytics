/**
 * Compute DRBL-Core season metrics and write site precomputed JSON.
 *
 *   npm run drbl:compute -- --season 2024-25 --limit 50
 *   npm run drbl:compute -- --season 2024-25 --limit 1225 --site-path reports/m16a/artifacts/full-2024-25.json
 */

import {
  computeSeasonDrbl,
  writeSeasonDrblArtifact,
} from "../drbl/models/compute-season";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const season = arg("season") ?? "2024-25";
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const delay = arg("delay") ? Number(arg("delay")) : 100;
  const sitePath = arg("site-path");
  const offlinePath = arg("offline-path");

  console.log(
    `Computing DRBL-Core for ${season}${limit != null ? ` (limit=${limit})` : " (full available)"}…`
  );
  const artifact = await computeSeasonDrbl(season, {
    limit,
    delayMs: delay,
    minPossessions: 50,
  });
  const paths = await writeSeasonDrblArtifact(artifact, {
    sitePath: sitePath || undefined,
    offlinePath: offlinePath || undefined,
  });
  console.log({
    gamesProcessed: artifact.gamesProcessed,
    gamesFailed: artifact.gamesFailed,
    gamesQuarantined: artifact.gamesQuarantined,
    version: artifact.version,
    artifactGenerationId: (artifact as { artifactGenerationId?: string })
      .artifactGenerationId,
    replacementLevel: artifact.replacementLevel,
    players: artifact.players.length,
    top5: artifact.players.slice(0, 5).map((p) => ({
      name: p.playerName,
      drbl100: p.drbl100,
      p: p.drblP,
      ln: p.drblLn,
      b: p.drblB,
      o: p.drblO,
      d: p.drblD,
      war: p.drblWar,
      poss: p.possessions,
    })),
    lineupModel: artifact.lineupModel,
    fusionModel: artifact.fusionModel,
    uncertaintyModel: artifact.uncertaintyModel,
    warModel: artifact.warModel,
    leverageModel: artifact.leverageModel,
    paths,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
