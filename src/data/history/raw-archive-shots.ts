/**
 * Load shot events from local raw PBP (no network).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  buildShotEventsFromActions,
  type GameShotEvent,
} from "@/lib/shots/shot-events";
import type { RawHistoryAction } from "@/lib/history/score-flow";

function rawGamesRoot(): string {
  return (
    process.env.DRBL_DATA_ROOT?.trim() ||
    path.join(process.cwd(), "data", "drbl", "raw")
  );
}

const SHOT_CACHE_MAX = 32;
const shotEventsByGame = new Map<string, GameShotEvent[]>();

export function loadRawArchiveShotEvents(gameId: string): GameShotEvent[] {
  const id = String(gameId ?? "").trim();
  if (!id) return [];
  const cached = shotEventsByGame.get(id);
  if (cached) return cached;

  const p = path.join(rawGamesRoot(), "games", id, "playbyplay.json");
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      game?: { actions?: RawHistoryAction[] };
    };
    const actions = raw.game?.actions;
    if (!Array.isArray(actions)) return [];
    const shots = buildShotEventsFromActions(id, actions, {
      source: "nba_pbp",
    });
    if (shotEventsByGame.size >= SHOT_CACHE_MAX) {
      const oldest = shotEventsByGame.keys().next().value;
      if (oldest !== undefined) shotEventsByGame.delete(oldest);
    }
    shotEventsByGame.set(id, shots);
    return shots;
  } catch {
    return [];
  }
}
