/**
 * SimulationUniverse - branching playable state (references Layer A league).
 */

import type { GmLeagueState } from "@/gm/types";
import type {
  DecisionLog,
  KnowledgeDate,
  LeagueEvolutionState,
  MyLeagueMode,
  MyLeaguePhase,
  PendingDecision,
  SimulationUniverse,
  TimelineEvent,
} from "@/gm/myleague/types";
import { knowledgeOf, mapGmPhaseToMyLeague } from "@/gm/myleague/phase";
import { uid } from "@/gm/engine/rng";

export function defaultEvolution(season: number): LeagueEvolutionState {
  return {
    season,
    expansionEligible: false,
    paceTrend: 0,
    threePointRateTrend: 0,
    generatedPlayerSeed: season * 997,
  };
}

export function createSimulationUniverse(opts: {
  parentHistoricalUniverseId: string;
  parentSnapshotId: string;
  branchPoint: KnowledgeDate;
  mode: MyLeagueMode;
  leagueStateRef: string;
  currentSeason: number;
  phase: MyLeaguePhase;
  day?: number;
  id?: string;
}): SimulationUniverse {
  return {
    id: opts.id ?? uid("su"),
    label: "simulation",
    parentHistoricalUniverseId: opts.parentHistoricalUniverseId,
    parentSnapshotId: opts.parentSnapshotId,
    branchPoint: opts.branchPoint,
    mode: opts.mode,
    leagueStateRef: opts.leagueStateRef,
    currentSeason: opts.currentSeason,
    phase: opts.phase,
    day: opts.day ?? 0,
    timelineEventIds: [],
    decisionLogIds: [],
    staffByTeamId: {},
    evolution: defaultEvolution(opts.currentSeason),
    pendingDecisions: [],
  };
}

/** Sync calendar fields from Franchise Lab Layer A without mutating history. */
export function syncSimulationFromGmLeague(
  sim: SimulationUniverse,
  league: GmLeagueState,
  opts?: { isFinals?: boolean; pastTradeDeadline?: boolean }
): SimulationUniverse {
  const phase = mapGmPhaseToMyLeague(league.phase, opts);
  return {
    ...sim,
    currentSeason: league.season,
    phase,
    day: league.day,
    evolution: {
      ...sim.evolution,
      season: league.season,
    },
  };
}

export function setSimulationPhase(
  sim: SimulationUniverse,
  phase: MyLeaguePhase
): SimulationUniverse {
  return { ...sim, phase };
}

export function appendPendingDecision(
  sim: SimulationUniverse,
  decision: Omit<PendingDecision, "id"> & { id?: string }
): SimulationUniverse {
  const row: PendingDecision = {
    id: decision.id ?? uid("pend"),
    phase: decision.phase,
    kind: decision.kind,
    teamId: decision.teamId,
    required: decision.required,
    expiresAt: decision.expiresAt,
  };
  return {
    ...sim,
    pendingDecisions: [...sim.pendingDecisions, row],
  };
}

export function resolvePendingDecision(
  sim: SimulationUniverse,
  decisionId: string
): SimulationUniverse {
  return {
    ...sim,
    pendingDecisions: sim.pendingDecisions.filter((d) => d.id !== decisionId),
  };
}

export function hasBlockingDecisions(sim: SimulationUniverse): boolean {
  return sim.pendingDecisions.some((d) => d.required);
}

export function createDecisionLog(input: {
  season: number;
  phase: MyLeaguePhase;
  userId: string;
  action: string;
  beforeStateRef: string;
  afterStateRef: string;
  knowledgeDate: KnowledgeDate;
  analyticsRecommendation?: DecisionLog["analyticsRecommendation"];
  alternativeOptions?: string[];
}): DecisionLog {
  return {
    id: uid("dec"),
    timestamp: new Date().toISOString(),
    ...input,
  };
}

export function createTimelineEvent(input: {
  season: number;
  type: string;
  universe: "reality" | "simulation";
  description: string;
  participants?: string[];
  phase?: MyLeaguePhase;
  date?: string;
  realWorldEquivalent?: string;
}): TimelineEvent {
  return {
    eventId: uid("evt"),
    participants: [],
    ...input,
  };
}

export function branchKnowledgeFromLeague(
  league: GmLeagueState
): KnowledgeDate {
  return knowledgeOf(
    league.season,
    mapGmPhaseToMyLeague(league.phase),
    league.day
  );
}
