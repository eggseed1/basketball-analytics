import type { DrblBoxScore, DrblEvent, DrblPossession } from "../../drbl/types";

import type { PossessionValidationReport } from "./product-types";

function countRawActions(raw: unknown): number {
  const actions = (raw as { game?: { actions?: unknown[] } }).game?.actions;
  return Array.isArray(actions) ? actions.length : 0;
}

function finalScoreFromEvents(events: DrblEvent[]): {
  home: number;
  away: number;
} | null {
  if (!events.length) return null;
  let home = 0;
  let away = 0;
  for (const event of events) {
    if (event.scoreHome > home) home = event.scoreHome;
    if (event.scoreAway > away) away = event.scoreAway;
  }
  if (home === 0 && away === 0) {
    const sorted = [...events].sort(
      (a, b) =>
        a.period - b.period ||
        a.orderNumber - b.orderNumber ||
        a.actionNumber - b.actionNumber
    );
    const last = sorted[sorted.length - 1]!;
    return { home: last.scoreHome, away: last.scoreAway };
  }
  return { home, away };
}

function isUnknownEventType(event: DrblEvent): boolean {
  return event.actionType === "unknown";
}

function checkEventOrdering(events: DrblEvent[]): {
  duplicateActionNumbers: number;
  duplicateOrderNumbers: number;
  nonMonotonicOrdering: boolean;
} {
  const actionSeen = new Set<number>();
  const orderSeen = new Set<number>();
  let duplicateActionNumbers = 0;
  let duplicateOrderNumbers = 0;
  let prevKey = "";
  let nonMonotonicOrdering = false;

  const sorted = [...events].sort(
    (a, b) =>
      a.period - b.period ||
      a.orderNumber - b.orderNumber ||
      a.actionNumber - b.actionNumber
  );

  for (const event of sorted) {
    if (actionSeen.has(event.actionNumber)) duplicateActionNumbers += 1;
    actionSeen.add(event.actionNumber);
    if (orderSeen.has(event.orderNumber)) duplicateOrderNumbers += 1;
    orderSeen.add(event.orderNumber);
    const key = `${event.period}|${event.orderNumber}|${event.actionNumber}`;
    if (prevKey && key < prevKey) nonMonotonicOrdering = true;
    prevKey = key;
  }

  return { duplicateActionNumbers, duplicateOrderNumbers, nonMonotonicOrdering };
}

function countUnresolvedFreeThrowSequences(events: DrblEvent[]): number {
  let openSequence = false;
  let unresolved = 0;

  for (const event of events) {
    if (event.actionType === "freethrow") {
      openSequence = true;
      const m = /(\d+)\s+of\s+(\d+)/i.exec(event.subType);
      const isLast = m ? m[1] === m[2] : /1\s+of\s+1/i.test(event.subType);
      if (isLast) openSequence = false;
      continue;
    }
    if (
      openSequence &&
      (event.actionType === "rebound" ||
        event.actionType === "turnover" ||
        event.actionType === "2pt" ||
        event.actionType === "3pt" ||
        event.actionType === "period")
    ) {
      unresolved += 1;
      openSequence = false;
    }
  }

  if (openSequence) unresolved += 1;
  return unresolved;
}

function countPossessionOwnershipFailures(
  events: DrblEvent[],
  possessions: DrblPossession[]
): number {
  let failures = 0;
  for (const possession of possessions) {
    const slice = events.filter((e) =>
      possession.eventActionNumbers.includes(e.actionNumber)
    );
    for (const event of slice) {
      if (
        event.possessionTeamId &&
        event.possessionTeamId !== possession.offenseTeamId &&
        event.teamId &&
        event.teamId === event.possessionTeamId &&
        (event.actionType === "2pt" ||
          event.actionType === "3pt" ||
          event.actionType === "turnover")
      ) {
        failures += 1;
      }
    }
  }
  return failures;
}

export function buildPossessionValidationReport(input: {
  raw: unknown;
  events: DrblEvent[];
  possessions: DrblPossession[];
  box: DrblBoxScore | null;
  eventsDroppedDuringNormalization?: number;
  officialFinalScore?: { home: number; away: number } | null;
}): PossessionValidationReport {
  const warnings: string[] = [];
  const fatalErrors: string[] = [];

  const rawEventCount = countRawActions(input.raw);
  const normalizedEventCount = input.events.length;
  const derivedPossessionCount = input.possessions.length;
  const periodsObserved = [
    ...new Set(input.events.map((e) => e.period)),
  ].sort((a, b) => a - b);
  const teamsObserved = [
    ...new Set(
      input.events
        .map((e) => e.teamId)
        .filter((id): id is string => Boolean(id))
    ),
  ].sort();

  const unknownEventCount = input.events.filter(isUnknownEventType).length;
  const ordering = checkEventOrdering(input.events);
  const possessionOwnershipFailures = countPossessionOwnershipFailures(
    input.events,
    input.possessions
  );
  const unresolvedFreeThrowSequences =
    countUnresolvedFreeThrowSequences(input.events);

  const finalPbpScore = finalScoreFromEvents(input.events);
  const officialFinalScore =
    input.officialFinalScore ??
    (input.box
      ? { home: input.box.homeScore, away: input.box.awayScore }
      : null);

  let scoreConservationOk: boolean | null = null;
  if (finalPbpScore && officialFinalScore) {
    scoreConservationOk =
      finalPbpScore.home === officialFinalScore.home &&
      finalPbpScore.away === officialFinalScore.away;
    if (!scoreConservationOk) {
      fatalErrors.push(
        `PBP final score ${finalPbpScore.home}-${finalPbpScore.away} does not match official ${officialFinalScore.home}-${officialFinalScore.away}.`
      );
    }
  }

  if (rawEventCount > 0 && normalizedEventCount === 0) {
    fatalErrors.push("Normalization produced zero events from non-empty raw PBP.");
  }

  if (normalizedEventCount > 0 && derivedPossessionCount === 0) {
    fatalErrors.push("Possession reconstruction produced zero possessions.");
  }

  if (!input.box) {
    fatalErrors.push("Box score required for possession reconstruction.");
  } else if (
    input.box.players.filter((p) => p.starter).length < 10 &&
    input.events.some((e) => e.actionType === "substitution")
  ) {
    warnings.push(
      "Box score missing starter flags — lineup reconstruction may be incomplete."
    );
  }

  if (ordering.duplicateActionNumbers > 0) {
    warnings.push(
      `${ordering.duplicateActionNumbers} duplicate actionNumber values observed.`
    );
  }
  if (ordering.duplicateOrderNumbers > 0) {
    warnings.push(
      `${ordering.duplicateOrderNumbers} duplicate orderNumber values observed.`
    );
  }
  if (ordering.nonMonotonicOrdering) {
    warnings.push("Event ordering is not strictly monotonic after sort.");
  }
  if (unknownEventCount > 0) {
    warnings.push(`${unknownEventCount} events mapped to unknown action type.`);
  }
  if (possessionOwnershipFailures > 0) {
    warnings.push(
      `${possessionOwnershipFailures} possession-team mismatches within reconstructed possessions.`
    );
  }
  if (unresolvedFreeThrowSequences > 0) {
    warnings.push(
      `${unresolvedFreeThrowSequences} unresolved free-throw sequences detected.`
    );
  }

  const eventsDroppedDuringNormalization =
    input.eventsDroppedDuringNormalization ??
    Math.max(0, rawEventCount - normalizedEventCount);

  return {
    rawEventCount,
    normalizedEventCount,
    derivedPossessionCount,
    periodsObserved,
    teamsObserved,
    unknownEventCount,
    eventsDroppedDuringNormalization,
    duplicateActionNumbers: ordering.duplicateActionNumbers,
    duplicateOrderNumbers: ordering.duplicateOrderNumbers,
    nonMonotonicOrdering: ordering.nonMonotonicOrdering,
    possessionOwnershipFailures,
    unresolvedFreeThrowSequences,
    finalPbpScore,
    officialFinalScore,
    scoreConservationOk,
    warnings,
    fatalErrors,
  };
}

export function validationFailed(
  report: PossessionValidationReport
): boolean {
  return report.fatalErrors.length > 0;
}
