/**
 * Map a strict scoring run's event-index window onto shot event IDs.
 * Free throws are already excluded from GameShotEvent[].
 */
import type { GameShotEvent } from "@/lib/shots/shot-events";

export interface RunIndexWindow {
  teamId: string;
  points: number;
  startEventIndex: number;
  endEventIndex: number;
}

export function shotEventIdsForRun(
  shots: GameShotEvent[],
  run: RunIndexWindow
): string[] {
  return shots
    .filter(
      (s) =>
        s.made &&
        s.points > 0 &&
        s.teamId === run.teamId &&
        s.eventIndex >= run.startEventIndex &&
        s.eventIndex <= run.endEventIndex
    )
    .map((s) => s.eventId);
}

/** Two-way: history eventIndex → shot eventId when present. */
export function shotIdForEventIndex(
  shots: GameShotEvent[],
  eventIndex: number
): string | null {
  return shots.find((s) => s.eventIndex === eventIndex)?.eventId ?? null;
}

export function eventIndexForShotId(
  shots: GameShotEvent[],
  eventId: string
): number | null {
  const hit = shots.find((s) => s.eventId === eventId);
  return hit ? hit.eventIndex : null;
}
