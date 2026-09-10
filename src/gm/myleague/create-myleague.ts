/**
 * Bootstrap a MyLeague save shell around a Franchise Lab league (Layer A).
 */

import type { GmLeagueState } from "@/gm/types";
import type {
  DecisionLog,
  GmCareerResume,
  HistoricalSeasonSnapshot,
  HistoricalUniverse,
  MyLeague,
  MyLeagueMode,
  MyLeagueSettings,
  SimulationUniverse,
  TimelineEvent,
} from "@/gm/myleague/types";
import {
  attachHistoricalSnapshot,
  createEmptyHistoricalUniverse,
  createPlaceholderSnapshot,
} from "@/gm/myleague/historical-universe";
import {
  branchKnowledgeFromLeague,
  createSimulationUniverse,
  createTimelineEvent,
} from "@/gm/myleague/simulation-universe";
import { mapGmPhaseToMyLeague } from "@/gm/myleague/phase";
import { uid } from "@/gm/engine/rng";

export const DEFAULT_MYLEAGUE_SETTINGS: MyLeagueSettings = {
  mode: "alternate_history",
  startEra: "latest",
  startSeason: 2026,
  difficulty: "realistic",
  scoutingFog: "realistic",
  historicalAccuracy: 0.5,
  automation: {
    autoLineup: false,
    autoScout: false,
    autoMinContracts: false,
    autoGLeague: false,
    autoStaff: false,
    autoTradeAiAssist: false,
  },
  analyticsProviderId: "null",
  realDataProviderId: "scaffold",
};

export type MyLeagueBundle = {
  myLeague: MyLeague;
  historical: HistoricalUniverse;
  simulation: SimulationUniverse;
  timeline: Record<string, TimelineEvent>;
  decisions: Record<string, DecisionLog>;
};

const emptyCareer = (): GmCareerResume => ({
  seasonsManaged: 0,
  wins: 0,
  losses: 0,
  championships: 0,
  finals: 0,
  playoffAppearances: 0,
});

/**
 * Create Reality + Simulation scaffolding for an existing Franchise Lab save.
 * Historical snapshot is a placeholder until Milestone 3 ingest.
 */
export function createMyLeagueBundle(
  league: GmLeagueState,
  overrides?: Partial<MyLeagueSettings> & { mode?: MyLeagueMode },
  opts?: { snapshot?: HistoricalSeasonSnapshot }
): MyLeagueBundle {
  const settings: MyLeagueSettings = {
    ...DEFAULT_MYLEAGUE_SETTINGS,
    ...overrides,
    startSeason: overrides?.startSeason ?? league.season,
    automation: {
      ...DEFAULT_MYLEAGUE_SETTINGS.automation,
      ...overrides?.automation,
    },
    realDataProviderId: opts?.snapshot
      ? "espn+darko+raptor"
      : overrides?.realDataProviderId ??
        DEFAULT_MYLEAGUE_SETTINGS.realDataProviderId,
  };

  let historical = createEmptyHistoricalUniverse({
    realDataHorizon: league.season,
  });
  const snapshot =
    opts?.snapshot ?? createPlaceholderSnapshot(league.season);
  historical = attachHistoricalSnapshot(historical, snapshot);


  const branchPoint = branchKnowledgeFromLeague(league);
  const simulation = createSimulationUniverse({
    parentHistoricalUniverseId: historical.id,
    parentSnapshotId: snapshot.id,
    branchPoint,
    mode: settings.mode,
    leagueStateRef: "franchise-lab-gm",
    currentSeason: league.season,
    phase: mapGmPhaseToMyLeague(league.phase),
    day: league.day,
  });

  const now = new Date().toISOString();
  const myLeague: MyLeague = {
    version: 1,
    id: uid("ml"),
    createdAt: now,
    updatedAt: now,
    userTeamId: league.userTeamId,
    settings,
    historicalUniverseId: historical.id,
    simulationUniverseId: simulation.id,
    career: emptyCareer(),
    notes: opts?.snapshot
      ? "Seeded from real NBA season data (ESPN + impact overlays)."
      : "Milestone 2 scaffold - historical ingest lands in Milestone 3.",
  };

  const birth = createTimelineEvent({
    season: league.season,
    type: "league_created",
    universe: "simulation",
    description: `MyLeague branched from placeholder ${league.season} snapshot (${settings.mode}).`,
    participants: [league.userTeamId],
    phase: simulation.phase,
  });

  return {
    myLeague,
    historical,
    simulation: {
      ...simulation,
      timelineEventIds: [birth.eventId],
    },
    timeline: { [birth.eventId]: birth },
    decisions: {},
  };
}
