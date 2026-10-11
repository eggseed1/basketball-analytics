/**
 * Training blocks for the forward box weights (drbl/models/box-forward.ts),
 * built from local normalized games. A season contributes a half block
 * (first-half features → second-half possessions) and, when the previous
 * season is local too, a pair block (previous full-season features → this
 * season's possessions).
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

import { addGameToAnchoredLineupInput, createAnchoredLineupInput } from "../models/anchored-lineup";
import {
  boxForwardBlock,
  boxForwardFeatures,
  type BoxForwardBlock,
  type BoxForwardBlockInfo,
} from "../models/box-forward";
import { addBoxScoreToTotals, boxPriorFeatures, type BoxPriorTotals } from "../models/box-prior";
import type { DrblBoxPlayer, DrblPossession } from "../types";
import { loadNormalizedGame } from "./m16c-dataset";
import { drblForWindow } from "./window-drbl";

export interface ForwardTrainingBlock {
  info: BoxForwardBlockInfo;
  block: BoxForwardBlock;
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

async function windowFeatures(season: string, games: readonly GameLite[]) {
  const input = createAnchoredLineupInput();
  const totals: BoxPriorTotals = new Map();
  for (const g of games) {
    addGameToAnchoredLineupInput(input, g.homeTeamId, g.possessions);
    addBoxScoreToTotals(totals, g.players);
  }
  const drbl = await drblForWindow(
    season,
    games.map((g) => g.gameId)
  );
  return {
    features: boxForwardFeatures(boxPriorFeatures(totals, input.appearances), input.appearances, drbl.drbl100, input.rows),
    rows: input.rows,
  };
}

const startYear = (season: string) => Number(season.slice(0, 4));

/**
 * Every half and consecutive-season pair block for the given seasons, oldest
 * first. Needs the fitted EPV coefficients loaded (requireEpvModel).
 */
export async function forwardTrainingBlocks(
  seasons: readonly string[],
  root: string = process.cwd(),
  onSeason?: (season: string) => void
): Promise<ForwardTrainingBlock[]> {
  const out: ForwardTrainingBlock[] = [];
  let prev: { season: string; features: Map<string, number[]> } | null = null;
  for (const season of [...seasons].sort()) {
    onSeason?.(season);
    const games = await loadGames(season, root);
    const mid = Math.floor(games.length / 2);
    const full = await windowFeatures(season, games);
    if (prev && startYear(season) === startYear(prev.season) + 1) {
      const block = boxForwardBlock(full.rows, prev.features);
      out.push({ info: { kind: "pair", from: prev.season, to: season, possessions: block.possessions }, block });
    }
    const first = await windowFeatures(season, games.slice(0, mid));
    const later = createAnchoredLineupInput();
    for (const g of games.slice(mid)) addGameToAnchoredLineupInput(later, g.homeTeamId, g.possessions);
    const block = boxForwardBlock(later.rows, first.features);
    out.push({ info: { kind: "half", from: season, to: season, possessions: block.possessions }, block });
    prev = { season, features: full.features };
  }
  return out;
}

/** Blocks whose target possessions all come from seasons up to and including `through`. */
export function blocksThrough(blocks: readonly ForwardTrainingBlock[], through: string): ForwardTrainingBlock[] {
  return blocks.filter((b) => startYear(b.info.to) <= startYear(through));
}

/** Blocks whose target possessions all come from seasons before `season`. */
export function blocksBefore(blocks: readonly ForwardTrainingBlock[], season: string): ForwardTrainingBlock[] {
  return blocks.filter((b) => startYear(b.info.to) < startYear(season));
}
