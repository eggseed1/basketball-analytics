import type {
  DrblBoxScore,
  DrblEvent,
  DrblLineupState,
  DrblPossession,
  DrblPossessionEndReason,
} from "../types";
import { lineupAtAction } from "./reconstruct-lineups";

function otherTeam(box: DrblBoxScore, teamId: string): string {
  return teamId === box.homeTeamId ? box.awayTeamId : box.homeTeamId;
}

function isMadeFg(event: DrblEvent): boolean {
  return (
    (event.actionType === "2pt" || event.actionType === "3pt") &&
    event.shotResult === "Made"
  );
}

function isMissedFg(event: DrblEvent): boolean {
  return (
    (event.actionType === "2pt" || event.actionType === "3pt") &&
    event.shotResult === "Missed"
  );
}

function isDefensiveRebound(event: DrblEvent): boolean {
  return (
    event.actionType === "rebound" &&
    event.subType.toLowerCase().includes("defensive")
  );
}

function isOffensiveRebound(event: DrblEvent): boolean {
  return (
    event.actionType === "rebound" &&
    event.subType.toLowerCase().includes("offensive")
  );
}

function isLastFreeThrow(event: DrblEvent): boolean {
  if (event.actionType !== "freethrow") return false;
  const m = /(\d+)\s+of\s+(\d+)/i.exec(event.subType);
  if (!m) return event.subType.toLowerCase().includes("1 of 1");
  return m[1] === m[2];
}

function isAndOneFreeThrow(event: DrblEvent): boolean {
  return (
    event.actionType === "freethrow" &&
    /1\s+of\s+1/i.test(event.subType)
  );
}

function lookAheadAndOne(events: DrblEvent[], index: number): boolean {
  // Made FG followed soon by foul + 1-of-1 FT (and-1).
  for (let i = index + 1; i < Math.min(events.length, index + 8); i++) {
    const e = events[i]!;
    if (e.actionType === "period" || e.actionType === "jumpball") return false;
    if (e.actionType === "foul") continue;
    if (isAndOneFreeThrow(e)) return true;
    if (
      e.actionType === "2pt" ||
      e.actionType === "3pt" ||
      e.actionType === "turnover" ||
      e.actionType === "rebound"
    ) {
      return false;
    }
  }
  return false;
}

interface OpenPossession {
  offenseTeamId: string;
  period: number;
  startActionNumber: number;
  startClockSeconds: number;
  points: number;
  eventActionNumbers: number[];
  offensePlayerIds: string[];
  defensePlayerIds: string[];
}

/**
 * Deterministic possession boundaries from normalized PBP + lineups.
 * Spec §5: end on made FG (except and-1), FT sequence change of control,
 * turnover, defensive rebound, end of period.
 */
export function reconstructPossessions(
  events: DrblEvent[],
  box: DrblBoxScore,
  lineups: DrblLineupState[]
): DrblPossession[] {
  const possessions: DrblPossession[] = [];
  const gate: { open: OpenPossession | null } = { open: null };
  let seq = 0;

  function lineupFor(event: DrblEvent, offenseTeamId: string) {
    const state = lineupAtAction(lineups, event.actionNumber);
    const offensePlayerIds =
      offenseTeamId === box.homeTeamId
        ? state.homePlayerIds
        : state.awayPlayerIds;
    const defensePlayerIds =
      offenseTeamId === box.homeTeamId
        ? state.awayPlayerIds
        : state.homePlayerIds;
    return { offensePlayerIds, defensePlayerIds };
  }

  function startPossession(event: DrblEvent, offenseTeamId: string): void {
    if (!offenseTeamId) return;
    const lu = lineupFor(event, offenseTeamId);
    gate.open = {
      offenseTeamId,
      period: event.period,
      startActionNumber: event.actionNumber,
      startClockSeconds: event.clockSeconds,
      points: 0,
      eventActionNumbers: [event.actionNumber],
      offensePlayerIds: lu.offensePlayerIds,
      defensePlayerIds: lu.defensePlayerIds,
    };
  }

  function endPossession(
    event: DrblEvent,
    reason: DrblPossessionEndReason
  ): void {
    const open = gate.open;
    if (!open) return;
    seq += 1;
    open.eventActionNumbers.push(event.actionNumber);
    possessions.push({
      gameId: box.gameId,
      possessionId: `${box.gameId}-p${String(seq).padStart(4, "0")}`,
      offenseTeamId: open.offenseTeamId,
      defenseTeamId: otherTeam(box, open.offenseTeamId),
      period: open.period,
      startActionNumber: open.startActionNumber,
      endActionNumber: event.actionNumber,
      startClockSeconds: open.startClockSeconds,
      endClockSeconds: event.clockSeconds,
      points: open.points,
      endReason: reason,
      offensePlayerIds: open.offensePlayerIds,
      defensePlayerIds: open.defensePlayerIds,
      eventActionNumbers: [...new Set(open.eventActionNumbers)],
    });
    gate.open = null;
  }

  function ensureOpen(event: DrblEvent, offenseTeamId: string | null): void {
    if (gate.open || !offenseTeamId) return;
    startPossession(event, offenseTeamId);
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;

    if (event.actionType === "period") {
      const sub = event.subType.toLowerCase();
      if (sub === "end" || sub === "start") {
        if (gate.open) endPossession(event, "period");
      }
      continue;
    }

    if (event.actionType === "jumpball" && event.subType.toLowerCase() === "recovered") {
      if (gate.open) endPossession(event, "jumpball");
      if (event.teamId) startPossession(event, event.teamId);
      continue;
    }

    if (event.actionType === "timeout" || event.actionType === "substitution") {
      if (gate.open) gate.open.eventActionNumbers.push(event.actionNumber);
      continue;
    }

    // Steal is usually paired with turnover — credit turnover end.
    if (event.actionType === "steal" || event.actionType === "block") {
      if (gate.open) gate.open.eventActionNumbers.push(event.actionNumber);
      continue;
    }

    if (event.actionType === "foul") {
      if (gate.open) gate.open.eventActionNumbers.push(event.actionNumber);
      continue;
    }

    if (isMadeFg(event)) {
      const offense =
        event.teamId ??
        event.possessionTeamId ??
        gate.open?.offenseTeamId ??
        null;
      if (gate.open && offense && gate.open.offenseTeamId !== offense) {
        // Missed boundary — close prior possession before crediting the make.
        endPossession(event, "other");
      }
      ensureOpen(event, offense);
      if (gate.open) {
        gate.open.points +=
          event.pointsOnAction || (event.actionType === "3pt" ? 3 : 2);
        gate.open.eventActionNumbers.push(event.actionNumber);
        if (!lookAheadAndOne(events, i)) {
          endPossession(event, "made_fg");
        }
      }
      continue;
    }

    if (isMissedFg(event)) {
      const offense =
        event.teamId ??
        event.possessionTeamId ??
        gate.open?.offenseTeamId ??
        null;
      ensureOpen(event, offense);
      if (gate.open) gate.open.eventActionNumbers.push(event.actionNumber);
      continue;
    }

    if (event.actionType === "freethrow") {
      const offense =
        event.teamId ??
        event.possessionTeamId ??
        gate.open?.offenseTeamId ??
        null;
      if (gate.open && offense && gate.open.offenseTeamId !== offense) {
        endPossession(event, "other");
      }
      ensureOpen(event, offense);
      if (gate.open) {
        if (event.shotResult === "Made") {
          gate.open.points += 1;
        }
        gate.open.eventActionNumbers.push(event.actionNumber);
        if (isLastFreeThrow(event)) {
          // And-1 or technical 1-of-1: end after the FT.
          // Multi-FT miss may still be followed by rebound — end on made last FT;
          // on miss, wait for rebound/turnover.
          if (event.shotResult === "Made") {
            endPossession(event, "made_ft");
          }
        }
      }
      continue;
    }

    if (isOffensiveRebound(event)) {
      const offense =
        event.teamId ??
        event.possessionTeamId ??
        gate.open?.offenseTeamId ??
        null;
      ensureOpen(event, offense);
      if (gate.open) gate.open.eventActionNumbers.push(event.actionNumber);
      continue;
    }

    if (isDefensiveRebound(event)) {
      if (gate.open) {
        gate.open.eventActionNumbers.push(event.actionNumber);
        endPossession(event, "def_rebound");
      }
      // New possession starts for rebound team on next offensive act.
      continue;
    }

    if (event.actionType === "rebound") {
      // Team rebound / unknown — if defensive team, treat as change.
      if (
        gate.open &&
        event.teamId &&
        event.teamId !== gate.open.offenseTeamId
      ) {
        gate.open.eventActionNumbers.push(event.actionNumber);
        endPossession(event, "team_rebound");
      } else if (gate.open) {
        gate.open.eventActionNumbers.push(event.actionNumber);
      }
      continue;
    }

    if (event.actionType === "turnover") {
      const offense =
        event.teamId ??
        event.possessionTeamId ??
        gate.open?.offenseTeamId ??
        null;
      // Team turnovers may have teamId but personId 0.
      if (gate.open && offense && gate.open.offenseTeamId !== offense) {
        endPossession(event, "other");
      }
      ensureOpen(event, offense);
      if (gate.open) {
        gate.open.eventActionNumbers.push(event.actionNumber);
        endPossession(event, "turnover");
      }
      continue;
    }

    // Generic: attach to open possession when relevant.
    if (gate.open && (event.teamId || event.possessionTeamId)) {
      gate.open.eventActionNumbers.push(event.actionNumber);
    }
  }

  if (gate.open && events.length > 0) {
    endPossession(events[events.length - 1]!, "other");
  }

  return possessions;
}
