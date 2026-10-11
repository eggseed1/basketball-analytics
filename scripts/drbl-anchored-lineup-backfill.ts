/**
 * Adds the shadow `drblAnchored100` field to an existing season artifact
 * from local normalized possessions, without recomputing anything else.
 *
 *   npx tsx scripts/drbl-anchored-lineup-backfill.ts --season 2025-26
 *
 * Needs data/drbl/normalized/{season}/{gameId}/ on disk. Keeps the artifact's
 * existing formatting (single-line or indented).
 */
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadNormalizedGame } from "../drbl/evaluation/m16c-dataset";
import {
  addGameToAnchoredLineupInput,
  anchoredLineupSummary,
  attachAnchoredLineup,
  createAnchoredLineupInput,
  fitAnchoredLineup,
} from "../drbl/models/anchored-lineup";
import type { DrblSeasonArtifact } from "../drbl/models/compute-season";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function rewrite(file: string, update: (a: DrblSeasonArtifact) => DrblSeasonArtifact) {
  const raw = await readFile(file, "utf8");
  const next = update(JSON.parse(raw) as DrblSeasonArtifact);
  const pretty = raw.includes("\n  ");
  const body = pretty ? JSON.stringify(next, null, 2) : JSON.stringify(next);
  await writeFile(file, raw.endsWith("\n") ? `${body}\n` : body, "utf8");
}

async function main() {
  const season = arg("season");
  if (!season) throw new Error("--season required (e.g. 2025-26)");
  const root = process.cwd();
  const sitePath = path.join(root, "src/data/drbl/precomputed", `${season}.json`);
  const offlinePath = path.join(root, "data/drbl/normalized", season, "player_season.json");
  const gamesDir = path.join(root, "data/drbl/normalized", season);

  const artifact = JSON.parse(await readFile(sitePath, "utf8")) as DrblSeasonArtifact;
  const gameIds = (await readdir(gamesDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && /^\d{10}$/.test(e.name))
    .map((e) => e.name)
    .sort();
  if (gameIds.length === 0) throw new Error(`no normalized games under ${gamesDir}`);

  const input = createAnchoredLineupInput();
  let loaded = 0;
  for (const id of gameIds) {
    const g = await loadNormalizedGame(season, id);
    if (!g) continue;
    addGameToAnchoredLineupInput(input, g.box.homeTeamId, g.possessions);
    loaded += 1;
  }
  const gamesProcessed = Number(artifact.gamesProcessed ?? artifact.gameCount ?? 0);
  console.log(
    `[anchored] ${season} games loaded=${loaded} artifact gamesProcessed=${gamesProcessed} possessions=${input.rows.length}`
  );
  if (gamesProcessed > 0 && Math.abs(loaded - gamesProcessed) > Math.max(10, gamesProcessed * 0.02)) {
    throw new Error(`local games (${loaded}) don't match the artifact (${gamesProcessed}); refusing to backfill`);
  }

  const fit = fitAnchoredLineup(
    input,
    new Map(artifact.players.map((p) => [p.playerId, p.drbl100]))
  );
  const summary = anchoredLineupSummary(fit);
  const update = (a: DrblSeasonArtifact): DrblSeasonArtifact => ({
    ...a,
    players: attachAnchoredLineup(a.players, fit),
    anchoredLineupModel: summary,
  });

  await rewrite(sitePath, update);
  console.log(`[anchored] wrote ${path.relative(root, sitePath)}`);
  if (await exists(offlinePath)) {
    await rewrite(offlinePath, update);
    console.log(`[anchored] wrote ${path.relative(root, offlinePath)}`);
  }
  const rated = artifact.players.filter((p) => fit.ratingsPer100.has(p.playerId)).length;
  console.log(
    `[anchored] ${season} rated ${rated}/${artifact.players.length} artifact players; home=${summary.homeAdvantagePer100}/100`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
