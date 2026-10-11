/**
 * Training blocks for the box-blend DRBL/100 (drbl/models/box-forward.ts),
 * built from local normalized games. A season contributes early blocks (its
 * first 50, 100, 200 and 400 games → the rest of the season), a half block
 * (first-half window → second-half possessions) and, when the previous
 * season is local too, a pair block (previous full season → this season's
 * possessions). Forward weights come from the half and pair blocks; every
 * block feeds the per-player shrink K and the calibration for its window
 * length. Each season also keeps
 * its full-season box weights, the opening-week fallback for the season
 * after it.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

import { addGameToAnchoredLineupInput, createAnchoredLineupInput } from "../models/anchored-lineup";
import {
  BOX_FORWARD_CONFIG,
  boxForwardBlock,
  boxForwardFeatures,
  boxPriorV1,
  fitBoxForwardCalibration,
  solveBoxForward,
  type BoxForwardBlock,
  type BoxForwardBlockInfo,
  type BoxForwardCalibrationPoint,
  type BoxForwardWindow,
} from "../models/box-forward";
import {
  addBoxScoreToTotals,
  boxPriorFeatures,
  boxPriorFitFromWeights,
  fitBoxPrior,
  type BoxPriorTotals,
} from "../models/box-prior";
import type { DrblBoxPlayer, DrblPossession } from "../types";
import { loadNormalizedGame } from "./m16c-dataset";
import { drblForWindow } from "./window-drbl";

/** Early feature windows, in games from the start of a season. */
export const EARLY_WINDOW_GAMES = [50, 100, 200, 400] as const;

export interface ForwardTrainingBlock {
  info: BoxForwardBlockInfo;
  /** Unshrunk block (K = 0), used to solve the forward weights. */
  block: BoxForwardBlock;
  /** The same block once per BOX_FORWARD_CONFIG.playerShrinkGrid value. */
  byShrinkK: BoxForwardBlock[];
}

function blocksFor(rows: Parameters<typeof boxForwardBlock>[0], window: BoxForwardWindow) {
  const byShrinkK = BOX_FORWARD_CONFIG.playerShrinkGrid.map((k) => boxForwardBlock(rows, window, k));
  return { block: boxForwardBlock(rows, window), byShrinkK };
}

export interface ForwardTrainingData {
  blocks: ForwardTrainingBlock[];
  /** Full-season box weights per season. */
  seasonBoxWeights: Map<string, number[]>;
}

interface GameLite {
  gameId: string;
  date: string;
  homeTeamId: string;
  players: DrblBoxPlayer[];
  possessions: DrblPossession[];
}

async function loadGames(season: string, root: string): Promise<GameLite[]> {
  const dir = path.join(root, "data/drbl/normalized", season);
  const ids = (await readdir(dir)).filter((n) => /^\d{10}$/.test(n)).sort();
  const games: GameLite[] = [];
  for (const id of ids) {
    const g = await loadNormalizedGame(season, id);
    if (!g) continue;
    games.push({
      gameId: g.box.gameId,
      date: g.box.gameDate || "",
      homeTeamId: g.box.homeTeamId,
      players: g.box.players,
      possessions: g.possessions,
    });
  }
  return games.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
}

/** Null when the window is too short to fit box weights and there is no fallback. */
async function windowOf(season: string, games: readonly GameLite[], fallbackBoxWeights?: readonly number[]) {
  const input = createAnchoredLineupInput();
  const totals: BoxPriorTotals = new Map();
  for (const g of games) {
    addGameToAnchoredLineupInput(input, g.homeTeamId, g.possessions);
    addBoxScoreToTotals(totals, g.players);
  }
  const boxFeatures = boxPriorFeatures(totals, input.appearances);
  const seasonFit = fitBoxPrior(input.rows, boxFeatures);
  const fit = seasonFit ?? (fallbackBoxWeights ? boxPriorFitFromWeights(boxFeatures, fallbackBoxWeights) : null);
  if (!fit) return null;
  const drbl = await drblForWindow(
    season,
    games.map((g) => g.gameId)
  );
  const window: BoxForwardWindow = {
    features: boxForwardFeatures(boxFeatures, input.appearances, drbl.drblPbp100, input.rows),
    v1: boxPriorV1(fit, drbl.raw, drbl.possessions),
    appearances: input.appearances,
  };
  return { window, rows: input.rows, boxWeightsPer100: seasonFit?.weightsPer100 ?? null };
}

function rowsOf(games: readonly GameLite[]) {
  const input = createAnchoredLineupInput();
  for (const g of games) addGameToAnchoredLineupInput(input, g.homeTeamId, g.possessions);
  return input.rows;
}

const startYear = (season: string) => Number(season.slice(0, 4));

/** Needs the fitted EPV coefficients loaded (requireEpvModel). */
export async function forwardTrainingData(
  seasons: readonly string[],
  root: string = process.cwd(),
  onSeason?: (season: string) => void
): Promise<ForwardTrainingData> {
  const blocks: ForwardTrainingBlock[] = [];
  const seasonBoxWeights = new Map<string, number[]>();
  let prev: { season: string; games: number; window: BoxForwardWindow } | null = null;
  for (const season of [...seasons].sort()) {
    onSeason?.(season);
    const games = await loadGames(season, root);
    const mid = Math.floor(games.length / 2);
    const full = await windowOf(season, games);
    if (!full?.boxWeightsPer100) throw new Error(`${season}: ${games.length} games too few to fit box weights`);
    seasonBoxWeights.set(season, full.boxWeightsPer100);
    const consecutive = prev && startYear(season) === startYear(prev.season) + 1 ? prev : null;
    if (consecutive) {
      const b = blocksFor(full.rows, consecutive.window);
      blocks.push({
        info: { kind: "pair", from: consecutive.season, to: season, games: consecutive.games, possessions: b.block.possessions },
        ...b,
      });
    }
    const add = async (kind: "early" | "half", n: number) => {
      const fallback = consecutive ? seasonBoxWeights.get(consecutive.season) : undefined;
      const first = await windowOf(season, games.slice(0, n), fallback);
      if (!first) return;
      const b = blocksFor(rowsOf(games.slice(n)), first.window);
      blocks.push({ info: { kind, from: season, to: season, games: n, possessions: b.block.possessions }, ...b });
    };
    for (const n of EARLY_WINDOW_GAMES) if (n < mid) await add("early", n);
    await add("half", mid);
    prev = { season, games: games.length, window: full.window };
  }
  return { blocks, seasonBoxWeights };
}

/** Blocks whose target possessions all come from seasons up to and including `through`. */
export function blocksThrough(blocks: readonly ForwardTrainingBlock[], through: string): ForwardTrainingBlock[] {
  return blocks.filter((b) => startYear(b.info.to) <= startYear(through));
}

/** Blocks whose target possessions all come from seasons before `season`. */
export function blocksBefore(blocks: readonly ForwardTrainingBlock[], season: string): ForwardTrainingBlock[] {
  return blocks.filter((b) => startYear(b.info.to) < startYear(season));
}

export interface ForwardFit {
  weightsPer100: number[];
  playerShrinkK: number;
  calibration: BoxForwardCalibrationPoint[];
  /** Residual sum of squares on the later possessions for each candidate K. */
  sseByShrinkK: Record<string, number>;
  blocks: string[];
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/**
 * Forward weights from the half and pair blocks. Then, for each candidate
 * per-player K, the calibration of the shrunk blend for each window length
 * (one point per early size, one for half blocks, one for pair blocks); the
 * K whose calibrated blends leave the least error on later points wins.
 */
export function fitForward(blocks: readonly ForwardTrainingBlock[]): ForwardFit | null {
  const core = blocks.filter((b) => b.info.kind !== "early");
  if (core.length === 0) return null;
  const weightsPer100 = solveBoxForward(core.map((b) => b.block));
  const groups = new Map<string, ForwardTrainingBlock[]>();
  for (const b of blocks) {
    const key = b.info.kind === "early" ? `early ${b.info.games}` : b.info.kind;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const grid = BOX_FORWARD_CONFIG.playerShrinkGrid;
  const candidates = grid.map((k, ki) => {
    let sse = 0;
    const calibration = [...groups.values()]
      .map((g) => {
        const fit = fitBoxForwardCalibration(
          g.map((b) => b.byShrinkK[ki]!),
          weightsPer100
        );
        sse += fit.sse;
        return { games: median(g.map((b) => b.info.games)), calibration: fit.calibration };
      })
      .sort((a, b) => a.games - b.games);
    return { k, sse, calibration };
  });
  const best = candidates.reduce((a, b) => (b.sse < a.sse ? b : a));
  return {
    weightsPer100,
    playerShrinkK: best.k,
    calibration: best.calibration,
    sseByShrinkK: Object.fromEntries(candidates.map((c) => [String(c.k), Number(c.sse.toFixed(1))])),
    blocks: blocks.map((b) => `${b.info.kind} ${b.info.from}→${b.info.to} (${b.info.games} games)`),
  };
}
