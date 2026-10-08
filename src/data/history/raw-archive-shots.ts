/**
 * Shot events from raw PBP: local disk, or the R2 archive on Workers.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  buildShotEventsFromActions,
  type GameShotEvent,
} from "@/lib/shots/shot-events";
import { readRawGameFile, rawGamesRoot } from "@/data/runtime/game-archive-store";
import type { RawHistoryAction } from "@/lib/history/score-flow";

const SHOT_CACHE_MAX = 32;
const shotEventsByGame = new Map<string, GameShotEvent[]>();

type RawArchivePbp = { game?: { actions?: RawHistoryAction[] } };

function shotsFromRaw(id: string, raw: RawArchivePbp | null): GameShotEvent[] {
  const actions = raw?.game?.actions;
  if (!Array.isArray(actions)) return [];
  const shots = buildShotEventsFromActions(id, actions, { source: "nba_pbp" });
  if (shotEventsByGame.size >= SHOT_CACHE_MAX) {
    const oldest = shotEventsByGame.keys().next().value;
    if (oldest !== undefined) shotEventsByGame.delete(oldest);
  }
  shotEventsByGame.set(id, shots);
  return shots;
}

/** Shot events from local raw PBP on disk. */
export function loadRawArchiveShotEvents(gameId: string): GameShotEvent[] {
  const id = String(gameId ?? "").trim();
  if (!id) return [];
  const cached = shotEventsByGame.get(id);
  if (cached) return cached;

  const p = path.join(rawGamesRoot(), "games", id, "playbyplay.json");
  if (!existsSync(p)) return [];
  try {
    return shotsFromRaw(id, JSON.parse(readFileSync(p, "utf8")) as RawArchivePbp);
  } catch {
    return [];
  }
}

/** Same as `loadRawArchiveShotEvents`, falling back to the R2 archive on Workers. */
export async function loadRawArchiveShotEventsAsync(gameId: string): Promise<GameShotEvent[]> {
  const id = String(gameId ?? "").trim();
  if (!id) return [];
  const cached = shotEventsByGame.get(id);
  if (cached) return cached;
  return shotsFromRaw(id, await readRawGameFile<RawArchivePbp>(id, "playbyplay.json"));
}
