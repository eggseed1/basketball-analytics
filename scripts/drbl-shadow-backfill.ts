/**
 * Republishes an existing season artifact's DRBL/100 as the box blend and
 * adds the shadow `drblAnchored100`, from local normalized games, without
 * recomputing anything else. Both are built on the play-by-play rate
 * (`drblPbp100`, or `drbl100` on artifacts not yet republished) and
 * rawAbilityRate, so re-running is safe. Needs
 * drbl/models/box-forward-weights.json.
 *
 *   npm run drbl:shadow-backfill -- --season 2025-26
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
import {
  boxPriorV2ForSeason,
  boxPriorV2Summary,
  requireBoxForwardWeights,
} from "../drbl/models/box-forward";
import { addBoxScoreToTotals, type BoxPriorTotals } from "../drbl/models/box-prior";
import type { DrblSeasonArtifact } from "../drbl/models/compute-season";
import type { DrblPlayerSeasonRow } from "../drbl/models/player-value";
import {
  BOX_BLEND_ABILITY_INPUT,
  BOX_BLEND_MODEL_VERSION,
  publishBoxBlend,
} from "../drbl/models/published-rating";

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

const pbp = (p: DrblPlayerSeasonRow) => p.drblPbp100 ?? p.drbl100;

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
  const boxTotals: BoxPriorTotals = new Map();
  let loaded = 0;
  for (const id of gameIds) {
    const g = await loadNormalizedGame(season, id);
    if (!g) continue;
    addGameToAnchoredLineupInput(input, g.box.homeTeamId, g.possessions);
    addBoxScoreToTotals(boxTotals, g.box.players);
    loaded += 1;
  }
  const gamesProcessed = Number(artifact.gamesProcessed ?? artifact.gameCount ?? 0);
  console.log(
    `[shadow] ${season} games loaded=${loaded} artifact gamesProcessed=${gamesProcessed} possessions=${input.rows.length}`
  );
  if (gamesProcessed > 0 && Math.abs(loaded - gamesProcessed) > Math.max(10, gamesProcessed * 0.02)) {
    throw new Error(`local games (${loaded}) don't match the artifact (${gamesProcessed}); refusing to backfill`);
  }

  const anchored = fitAnchoredLineup(input, new Map(artifact.players.map((p) => [p.playerId, pbp(p)])));
  const weights = await requireBoxForwardWeights();
  const box = boxPriorV2ForSeason({
    rows: input.rows,
    appearances: input.appearances,
    totals: boxTotals,
    players: artifact.players.map((p) => ({ ...p, drblPbp100: pbp(p) })),
    games: loaded,
    weights,
  });
  if (!box) throw new Error(`no box features for ${season}; refusing to publish DRBL/100`);
  if (box.fitSource === "frozen") {
    console.warn(`[shadow] ${season}: too few possessions for season box weights; using ${weights.fallbackFrom}'s`);
  }
  const update = (a: DrblSeasonArtifact): DrblSeasonArtifact => ({
    ...a,
    publishedAbilityInput: BOX_BLEND_ABILITY_INPUT,
    abilityModelVersion: BOX_BLEND_MODEL_VERSION,
    players: publishBoxBlend(attachAnchoredLineup(a.players, anchored), box.ratings),
    anchoredLineupModel: anchoredLineupSummary(anchored),
    boxPriorModel: boxPriorV2Summary(box, weights),
  });

  await rewrite(sitePath, update);
  console.log(`[shadow] wrote ${path.relative(root, sitePath)}`);
  if (await exists(offlinePath)) {
    await rewrite(offlinePath, update);
    console.log(`[shadow] wrote ${path.relative(root, offlinePath)}`);
  }
  const ids = artifact.players.map((p) => p.playerId);
  console.log(
    `[shadow] ${season} anchored ${ids.filter((id) => anchored.ratingsPer100.has(id)).length}/${ids.length}, box ${ids.filter((id) => box.ratings.has(id)).length}/${ids.length} artifact players`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
