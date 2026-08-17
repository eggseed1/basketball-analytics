import type { DrblBoxScore, DrblEvent, DrblLineupState } from "../types";

function sortedUnique(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

/**
 * Reconstruct on-court lineups after every substitution / period start.
 * Starts from box-score starters; applies substitution in/out events.
 */
export function reconstructLineups(
  events: DrblEvent[],
  box: DrblBoxScore
): DrblLineupState[] {
  const homeStarters = box.players
    .filter((p) => p.teamId === box.homeTeamId && p.starter)
    .map((p) => p.playerId);
  const awayStarters = box.players
    .filter((p) => p.teamId === box.awayTeamId && p.starter)
    .map((p) => p.playerId);

  let home = new Set(homeStarters);
  let away = new Set(awayStarters);
  const states: DrblLineupState[] = [
    {
      afterActionNumber: 0,
      period: 1,
      clockSeconds: 720,
      homePlayerIds: sortedUnique(home),
      awayPlayerIds: sortedUnique(away),
    },
  ];

  // Pending outs before matching ins within the same whistle.
  const pendingOutHome: string[] = [];
  const pendingOutAway: string[] = [];

  function flushState(event: DrblEvent): void {
    states.push({
      afterActionNumber: event.actionNumber,
      period: event.period,
      clockSeconds: event.clockSeconds,
      homePlayerIds: sortedUnique(home),
      awayPlayerIds: sortedUnique(away),
    });
  }

  for (const event of events) {
    if (event.actionType === "period" && event.subType.toLowerCase() === "start") {
      // Reset to starters only at start of game; later periods keep current
      // lineup (NBA does not auto-reset). First period already seeded.
      flushState(event);
      continue;
    }

    if (event.actionType !== "substitution" || !event.playerId || !event.teamId) {
      continue;
    }

    const isHome = event.teamId === box.homeTeamId;
    const onCourt = isHome ? home : away;
    const pending = isHome ? pendingOutHome : pendingOutAway;

    if (event.substitutionSide === "out") {
      onCourt.delete(event.playerId);
      pending.push(event.playerId);
      // Do not flush mid-substitution (4-man) — wait for matching "in".
      continue;
    }

    if (event.substitutionSide === "in") {
      onCourt.add(event.playerId);
      // Clear one pending out if present (paired sub).
      if (pending.length > 0) pending.shift();
      // Cap at 5 if source glitches.
      if (onCourt.size > 5) {
        const keep = [...onCourt].slice(-5);
        onCourt.clear();
        for (const id of keep) onCourt.add(id);
      }
      flushState(event);
    }
  }

  return states;
}

/** Lineup active after a given action number. */
export function lineupAtAction(
  states: DrblLineupState[],
  actionNumber: number
): DrblLineupState {
  let current = states[0]!;
  for (const state of states) {
    if (state.afterActionNumber <= actionNumber) current = state;
    else break;
  }
  return current;
}
