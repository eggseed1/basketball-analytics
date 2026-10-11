/**
 * Fits the box-blend weights behind published DRBL/100 from every local
 * season and writes drbl/models/box-forward-weights.json: forward weights,
 * the per-player sample shrink K, the calibrations that put the blend in
 * points per 100 for rating windows of different length, and the latest
 * season's box weights as the fallback for a season too short to fit its own.
 *
 *   npm run drbl:box-forward-fit
 *
 * Needs data/drbl/normalized/{season}/{gameId}/ for at least one season with
 * 500+ games. Re-run `npm run drbl:outcome-test` and `drbl:shadow-backfill`
 * after a refit.
 */
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { fitForward, forwardTrainingData } from "../drbl/evaluation/box-forward-data";
import {
  BOX_FORWARD_FEATURES,
  BOX_FORWARD_VERSION,
  BOX_FORWARD_WEIGHTS_PATH,
  type BoxForwardWeights,
} from "../drbl/models/box-forward";
import { requireEpvModel } from "../drbl/models/expected-points";

const MIN_GAMES = 500;

async function localSeasons(root: string): Promise<string[]> {
  const dir = path.join(root, "data/drbl/normalized");
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory() || !/^\d{4}-\d{2}$/.test(e.name)) continue;
    const games = (await readdir(path.join(dir, e.name))).filter((n) => /^\d{10}$/.test(n));
    if (games.length >= MIN_GAMES) out.push(e.name);
  }
  return out.sort();
}

async function main() {
  const root = process.cwd();
  await requireEpvModel();
  const seasons = await localSeasons(root);
  if (seasons.length === 0) throw new Error(`no season under data/drbl/normalized has ≥${MIN_GAMES} games`);
  const data = await forwardTrainingData(seasons, root, (s) => console.log(`[box-forward] loading ${s}`));
  const fit = fitForward(data.blocks)!;
  const latest = seasons[seasons.length - 1]!;
  const out: BoxForwardWeights = {
    version: BOX_FORWARD_VERSION,
    fittedAt: new Date().toISOString(),
    features: [...BOX_FORWARD_FEATURES],
    weightsPer100: fit.weightsPer100.map((w) => Number(w.toFixed(6))),
    calibration: fit.calibration.map((p) => ({ games: p.games, calibration: Number(p.calibration.toFixed(6)) })),
    playerShrinkK: fit.playerShrinkK,
    fallbackBoxWeightsPer100: data.seasonBoxWeights.get(latest)!.map((w) => Number(w.toFixed(6))),
    fallbackFrom: latest,
    blocks: data.blocks.map((b) => b.info),
  };
  await writeFile(path.join(root, BOX_FORWARD_WEIGHTS_PATH), `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`[box-forward] wrote ${BOX_FORWARD_WEIGHTS_PATH} from ${data.blocks.length} blocks`);
  for (const [i, f] of BOX_FORWARD_FEATURES.entries()) console.log(`  ${f.padEnd(28)} ${fit.weightsPer100[i]!.toFixed(3)}`);
  for (const [k, sse] of Object.entries(fit.sseByShrinkK)) console.log(`  later-points SSE with K=${k.padEnd(5)}  ${sse}`);
  console.log(`  player shrink K               ${fit.playerShrinkK}`);
  for (const p of fit.calibration) console.log(`  calibration at ${String(p.games).padStart(4)} games   ${p.calibration.toFixed(4)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
