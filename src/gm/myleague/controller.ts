/**
 * MyLeagueController - phase guards + decision logging (Milestone 2).
 * Does not run Layer A sim; only gates and records Layer B shell state.
 */

import type { GmLeagueState } from "@/gm/types";
import type {
  DecisionLog,
  MyLeaguePhase,
  PendingDecision,
  SimulationUniverse,
  TimelineEvent,
} from "@/gm/myleague/types";
import {
  isSimAllowed,
  knowledgeOf,
  nextPhase,
  nextPlayablePhase,
} from "@/gm/myleague/phase";
import {
  appendPendingDecision,
  createDecisionLog,
  createTimelineEvent,
  hasBlockingDecisions,
  resolvePendingDecision,
  setSimulationPhase,
  syncSimulationFromGmLeague,
} from "@/gm/myleague/simulation-universe";

export type AdvancePhaseResult =
  | { ok: true; from: MyLeaguePhase; to: MyLeaguePhase; simulation: SimulationUniverse }
  | { ok: false; reason: string };

export type SimGateResult =
  | { ok: true }
  | { ok: false; reason: string };

export function gateSimulate(sim: SimulationUniverse): SimGateResult {
  if (!isSimAllowed(sim.phase)) {
    return {
      ok: false,
      reason: `Simulation blocked in phase ${sim.phase}`,
    };
  }
  if (hasBlockingDecisions(sim)) {
    return {
      ok: false,
      reason: "Required front-office decisions are pending",
    };
  }
  return { ok: true };
}

export function advanceMyLeaguePhase(
  sim: SimulationUniverse,
  opts?: { playableOnly?: boolean }
): AdvancePhaseResult {
  if (hasBlockingDecisions(sim)) {
    return { ok: false, reason: "Resolve required decisions before advancing" };
  }
  const from = sim.phase;
  const to = opts?.playableOnly ? nextPlayablePhase(from) : nextPhase(from);
  return {
    ok: true,
    from,
    to,
    simulation: setSimulationPhase(sim, to),
  };
}

export function recordUserDecision(input: {
  sim: SimulationUniverse;
  league: GmLeagueState;
  action: string;
  beforeStateRef: string;
  afterStateRef: string;
  alternativeOptions?: string[];
}): { simulation: SimulationUniverse; decision: DecisionLog } {
  const knowledgeDate = knowledgeOf(
    input.league.season,
    input.sim.phase,
    input.league.day
  );
  const decision = createDecisionLog({
    season: input.league.season,
    phase: input.sim.phase,
    userId: input.league.userTeamId,
    action: input.action,
    beforeStateRef: input.beforeStateRef,
    afterStateRef: input.afterStateRef,
    knowledgeDate,
    alternativeOptions: input.alternativeOptions,
    analyticsRecommendation: null,
  });
  return {
    decision,
    simulation: {
      ...input.sim,
      decisionLogIds: [...input.sim.decisionLogIds, decision.id],
    },
  };
}

export function enqueueDecision(
  sim: SimulationUniverse,
  decision: Omit<PendingDecision, "id"> & { id?: string }
): SimulationUniverse {
  return appendPendingDecision(sim, decision);
}

export function clearDecision(
  sim: SimulationUniverse,
  decisionId: string
): SimulationUniverse {
  return resolvePendingDecision(sim, decisionId);
}

export function syncControllerFromLeague(
  sim: SimulationUniverse,
  league: GmLeagueState
): SimulationUniverse {
  return syncSimulationFromGmLeague(sim, league);
}

export function markSeasonEndEvent(
  sim: SimulationUniverse,
  season: number
): { simulation: SimulationUniverse; event: TimelineEvent } {
  const event = createTimelineEvent({
    season,
    type: "season_end",
    universe: "simulation",
    description: `Season ${season - 1}-${String(season).slice(-2)} closed in simulation.`,
    phase: "SEASON_END",
  });
  return {
    event,
    simulation: {
      ...sim,
      timelineEventIds: [...sim.timelineEventIds, event.eventId],
    },
  };
}
