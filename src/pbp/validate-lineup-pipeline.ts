import type {
  DrblBoxScore,
  DrblEvent,
  DrblLineupState,
} from "../../drbl/types";

import type { LineupValidationReport } from "./product-types";

function periodLengthSeconds(period: number): number {
  return period <= 4 ? 720 : 300;
}

function stateTimelineKey(state: DrblLineupState): string {
  return `${String(state.period).padStart(2, "0")}|${String(9999 - state.clockSeconds).padStart(4, "0")}|${String(state.afterActionNumber).padStart(6, "0")}`;
}

function hasDuplicateIds(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

function overlap(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((id) => setB.has(id));
}

export function buildLineupValidationReport(input: {
  events: DrblEvent[];
  box: DrblBoxScore;
  lineups: DrblLineupState[];
}): LineupValidationReport {
  const warnings: string[] = [];
  const fatalErrors: string[] = [];

  const homeStarters = input.box.players
    .filter((p) => p.teamId === input.box.homeTeamId && p.starter)
    .map((p) => p.playerId);
  const awayStarters = input.box.players
    .filter((p) => p.teamId === input.box.awayTeamId && p.starter)
    .map((p) => p.playerId);

  const startersResolvedHome = homeStarters.length === 5;
  const startersResolvedAway = awayStarters.length === 5;
  if (!startersResolvedHome) {
    fatalErrors.push(
      `Home starters unresolved (${homeStarters.length}/5 from box score).`
    );
  }
  if (!startersResolvedAway) {
    fatalErrors.push(
      `Away starters unresolved (${awayStarters.length}/5 from box score).`
    );
  }

  let invalidStintCount = 0;
  let dualTeamPlayerCount = 0;
  let negativeStintDurationCount = 0;
  let nonMonotonicStintOrdering = false;

  const sortedStates = [...input.lineups].sort((a, b) =>
    stateTimelineKey(a).localeCompare(stateTimelineKey(b))
  );

  for (let i = 0; i < sortedStates.length; i++) {
    const state = sortedStates[i]!;
    if (state.homePlayerIds.length !== 5 || state.awayPlayerIds.length !== 5) {
      invalidStintCount += 1;
    }
    if (hasDuplicateIds(state.homePlayerIds) || hasDuplicateIds(state.awayPlayerIds)) {
      invalidStintCount += 1;
    }
    const dual = overlap(state.homePlayerIds, state.awayPlayerIds);
    if (dual.length > 0) {
      dualTeamPlayerCount += dual.length;
      invalidStintCount += 1;
    }
    if (i > 0) {
      const prev = sortedStates[i - 1]!;
      if (stateTimelineKey(state) < stateTimelineKey(prev)) {
        nonMonotonicStintOrdering = true;
      }
      if (state.period === prev.period) {
        const duration = prev.clockSeconds - state.clockSeconds;
        if (duration < 0) negativeStintDurationCount += 1;
      }
    }
  }

  if (invalidStintCount > 0) {
    fatalErrors.push(
      `${invalidStintCount} lineup stints violate five-player / duplicate / dual-team invariants.`
    );
  }
  if (dualTeamPlayerCount > 0) {
    fatalErrors.push(
      `${dualTeamPlayerCount} player(s) active for both teams across stints.`
    );
  }
  if (negativeStintDurationCount > 0) {
    fatalErrors.push(
      `${negativeStintDurationCount} stint(s) have negative duration within a period.`
    );
  }
  if (nonMonotonicStintOrdering) {
    fatalErrors.push("Lineup stint ordering is not monotonic by period/clock/action.");
  }

  let substitutionOutInactiveCount = 0;
  let substitutionInActiveCount = 0;
  let unresolvedSubstitutions = 0;

  let home = new Set(homeStarters);
  let away = new Set(awayStarters);
  const pendingOutHome: string[] = [];
  const pendingOutAway: string[] = [];

  for (const event of input.events) {
    if (event.actionType !== "substitution" || !event.playerId || !event.teamId) {
      continue;
    }
    const isHome = event.teamId === input.box.homeTeamId;
    const onCourt = isHome ? home : away;
    const pending = isHome ? pendingOutHome : pendingOutAway;

    if (event.substitutionSide === "out") {
      if (!onCourt.has(event.playerId)) {
        substitutionOutInactiveCount += 1;
      }
      onCourt.delete(event.playerId);
      pending.push(event.playerId);
      continue;
    }

    if (event.substitutionSide === "in") {
      if (onCourt.has(event.playerId)) {
        substitutionInActiveCount += 1;
      }
      onCourt.add(event.playerId);
      if (pending.length > 0) pending.shift();
    }
  }

  unresolvedSubstitutions = pendingOutHome.length + pendingOutAway.length;

  if (substitutionOutInactiveCount > 0) {
    fatalErrors.push(
      `${substitutionOutInactiveCount} substitution-out event(s) removed an inactive player.`
    );
  }
  if (substitutionInActiveCount > 0) {
    fatalErrors.push(
      `${substitutionInActiveCount} substitution-in event(s) added an already-active player.`
    );
  }
  if (unresolvedSubstitutions > 0) {
    fatalErrors.push(
      `${unresolvedSubstitutions} unresolved substitution-out event(s) at end of game.`
    );
  }

  const periodsObserved = [
    ...new Set(input.events.map((e) => e.period)),
  ].sort((a, b) => a - b);
  const maxPeriod = periodsObserved.at(-1) ?? 4;
  const expectedRegulationPeriods = Math.min(4, maxPeriod);
  const regulationPeriodsCovered = periodsObserved.filter((p) => p <= 4).length;
  const overtimePeriodsCovered = periodsObserved.filter((p) => p > 4).length;
  const expectedOvertimePeriods = Math.max(0, maxPeriod - 4);
  const regulationCoverageOk =
    maxPeriod <= 4
      ? regulationPeriodsCovered >= expectedRegulationPeriods
      : regulationPeriodsCovered >= 4;
  const overtimeCoverageOk =
    expectedOvertimePeriods === 0 || overtimePeriodsCovered >= expectedOvertimePeriods;

  if (!regulationCoverageOk) {
    fatalErrors.push(
      `Regulation period coverage incomplete (${regulationPeriodsCovered}/4 periods observed).`
    );
  }
  if (!overtimeCoverageOk) {
    fatalErrors.push(
      `Overtime coverage incomplete (${overtimePeriodsCovered}/${expectedOvertimePeriods} OT periods observed).`
    );
  }

  let uncoveredGameClockSeconds = 0;
  const byPeriod = new Map<number, DrblEvent[]>();
  for (const event of input.events) {
    const list = byPeriod.get(event.period) ?? [];
    list.push(event);
    byPeriod.set(event.period, list);
  }

  for (const period of periodsObserved) {
    const periodEvents = (byPeriod.get(period) ?? []).slice().sort(
      (a, b) =>
        a.orderNumber - b.orderNumber || a.actionNumber - b.actionNumber
    );
    const periodLen = periodLengthSeconds(period);
    let covered = 0;
    let prevClock = periodLen;
    for (const event of periodEvents) {
      const elapsed = prevClock - event.clockSeconds;
      if (elapsed > 0 && elapsed <= periodLen) covered += elapsed;
      prevClock = event.clockSeconds;
    }
    if (prevClock > 0) covered += prevClock;
    const gap = Math.max(0, periodLen - Math.min(covered, periodLen));
    uncoveredGameClockSeconds += gap;
  }

  if (uncoveredGameClockSeconds > 60) {
    warnings.push(
      `${uncoveredGameClockSeconds}s of game clock uncovered by event timeline (tolerance 60s).`
    );
  }
  if (uncoveredGameClockSeconds > 180) {
    fatalErrors.push(
      `${uncoveredGameClockSeconds}s of game clock uncovered by event timeline.`
    );
  }

  return {
    lineupSnapshotCount: input.lineups.length,
    startersResolvedHome,
    startersResolvedAway,
    invalidStintCount,
    dualTeamPlayerCount,
    substitutionOutInactiveCount,
    substitutionInActiveCount,
    unresolvedSubstitutions,
    negativeStintDurationCount,
    nonMonotonicStintOrdering,
    regulationCoverageOk,
    overtimeCoverageOk,
    uncoveredGameClockSeconds,
    periodsObserved,
    warnings,
    fatalErrors,
  };
}

export function lineupValidationFailed(report: LineupValidationReport): boolean {
  return report.fatalErrors.length > 0;
}
