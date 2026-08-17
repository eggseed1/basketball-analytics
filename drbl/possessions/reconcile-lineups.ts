import { DRBL_RECONSTRUCTION_VERSION } from "../constants";
import type {
  DrblBoxScore,
  DrblEvent,
  DrblLineupMinuteDiff,
  DrblLineupReconcileReport,
  DrblLineupState,
} from "../types";
import { lineupAtAction } from "./reconstruct-lineups";

function periodLengthSeconds(period: number): number {
  return period <= 4 ? 720 : 300;
}

/**
 * Accumulate reconstructed on-court minutes from lineup timeline + clocks.
 * Credits clock elapsed within each period to the five on each side.
 */
export function estimateLineupMinutes(
  events: DrblEvent[],
  box: DrblBoxScore,
  lineups: DrblLineupState[]
): Map<string, number> {
  const minutes = new Map<string, number>();

  function credit(
    playerIds: string[],
    seconds: number
  ): void {
    if (seconds <= 0) return;
    const add = seconds / 60;
    for (const id of playerIds) {
      minutes.set(id, (minutes.get(id) ?? 0) + add);
    }
  }

  const byPeriod = new Map<number, DrblEvent[]>();
  for (const event of events) {
    const list = byPeriod.get(event.period) ?? [];
    list.push(event);
    byPeriod.set(event.period, list);
  }

  const periods = [...byPeriod.keys()].sort((a, b) => a - b);
  for (const period of periods) {
    const periodEvents = (byPeriod.get(period) ?? []).slice().sort(
      (a, b) =>
        a.orderNumber - b.orderNumber || a.actionNumber - b.actionNumber
    );
    if (periodEvents.length === 0) continue;

    let prevClock = periodLengthSeconds(period);
    let prevAction = 0;

    for (const event of periodEvents) {
      const elapsed = prevClock - event.clockSeconds;
      if (elapsed > 0 && elapsed <= periodLengthSeconds(period)) {
        const state = lineupAtAction(lineups, prevAction);
        credit(state.homePlayerIds, elapsed);
        credit(state.awayPlayerIds, elapsed);
      }
      prevClock = event.clockSeconds;
      prevAction = event.actionNumber;
    }

    // Remainder of period after last event.
    if (prevClock > 0) {
      const state = lineupAtAction(lineups, prevAction);
      credit(state.homePlayerIds, prevClock);
      credit(state.awayPlayerIds, prevClock);
    }
  }

  // Ensure box players appear.
  for (const player of box.players) {
    if (!minutes.has(player.playerId)) minutes.set(player.playerId, 0);
  }
  return minutes;
}

/**
 * Compare reconstructed on-court minutes to official box minutes.
 */
export function reconcileLineupMinutes(
  box: DrblBoxScore,
  events: DrblEvent[],
  lineups: DrblLineupState[],
  options: { maxAbsMinuteDelta?: number } = {}
): DrblLineupReconcileReport {
  const maxAbsMinuteDelta = options.maxAbsMinuteDelta ?? 2;
  const estimated = estimateLineupMinutes(events, box, lineups);
  const warnings: string[] = [];
  const diffs: DrblLineupMinuteDiff[] = [];

  for (const player of box.players) {
    if (player.minutes <= 0 && (estimated.get(player.playerId) ?? 0) < 0.5) {
      continue;
    }
    const reconstructed = estimated.get(player.playerId) ?? 0;
    const delta = reconstructed - player.minutes;
    if (Math.abs(delta) > maxAbsMinuteDelta) {
      diffs.push({
        playerId: player.playerId,
        playerName: player.playerName,
        teamId: player.teamId,
        boxMinutes: round2(player.minutes),
        reconstructedMinutes: round2(reconstructed),
        delta: round2(delta),
      });
    }
  }

  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  let nonFive = 0;
  for (const state of lineups) {
    if (state.homePlayerIds.length !== 5 || state.awayPlayerIds.length !== 5) {
      nonFive += 1;
    }
  }
  if (nonFive > 0 && nonFive / Math.max(lineups.length, 1) > 0.5) {
    warnings.push(
      `${nonFive}/${lineups.length} lineup snapshots are not five-on-five`
    );
  }

  const ok = diffs.length === 0;
  if (!ok) {
    warnings.push(
      `${diffs.length} player(s) exceed ±${maxAbsMinuteDelta} min vs box`
    );
  }

  return {
    gameId: box.gameId,
    ok,
    reconstructionVersion: DRBL_RECONSTRUCTION_VERSION,
    lineupSnapshots: lineups.length,
    maxAbsMinuteDelta,
    playerMinuteDiffs: diffs,
    warnings,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
