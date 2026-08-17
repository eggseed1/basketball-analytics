/**
 * Historical CDN/NBA-Stats PBP adapter family (current 2024-25 / 2025-26 source).
 * Maps already-normalized DrblEvent streams into historical-pbp-normalized-v1.
 * No DRBL model logic.
 */
import type { DrblEvent } from "../../types";
import {
  HISTORICAL_NORMALIZATION_VERSION,
  type NormalizedHistoricalEvent,
  type NormalizedHistoricalGame,
} from "../normalized-event-schema";

export const CDN_ADAPTER_ID = "nba-cdn-playbyplayv3-family-v1";

export function adaptDrblEventsToHistoricalNormalized(input: {
  season: string;
  gameId: string;
  gameDate?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  events: DrblEvent[];
  rawSourcePointer: string;
}): NormalizedHistoricalGame {
  const missingnessFlags: string[] = [];
  const events: NormalizedHistoricalEvent[] = input.events.map((e, i) => {
    const eventType = String(e.actionType ?? "").trim() || null;
    if (!eventType || eventType === "unknown") {
      missingnessFlags.push(`event_${i}_type`);
    }
    let substitutionInPlayerId: string | null = null;
    let substitutionOutPlayerId: string | null = null;
    if (e.actionType === "substitution") {
      if (e.substitutionSide === "in") {
        substitutionInPlayerId = e.playerId ? String(e.playerId) : null;
      } else if (e.substitutionSide === "out") {
        substitutionOutPlayerId = e.playerId ? String(e.playerId) : null;
      }
    }
    return {
      season: input.season,
      gameId: input.gameId,
      eventIndex: i,
      period: e.period ?? null,
      clockSecondsRemaining:
        typeof e.clockSeconds === "number" ? e.clockSeconds : null,
      eventType,
      subType: e.subType ? String(e.subType) : null,
      offenseTeamId: e.possessionTeamId ? String(e.possessionTeamId) : null,
      defenseTeamId: null,
      primaryPlayerId: e.playerId ? String(e.playerId) : null,
      secondaryPlayerId: e.assistPlayerId ? String(e.assistPlayerId) : null,
      tertiaryPlayerId: e.stealPlayerId
        ? String(e.stealPlayerId)
        : e.blockPlayerId
          ? String(e.blockPlayerId)
          : null,
      points: typeof e.pointsOnAction === "number" ? e.pointsOnAction : null,
      scoreHome: typeof e.scoreHome === "number" ? e.scoreHome : null,
      scoreAway: typeof e.scoreAway === "number" ? e.scoreAway : null,
      shotMade:
        e.shotResult === "Made"
          ? true
          : e.shotResult === "Missed"
            ? false
            : null,
      shotValue: e.isFieldGoal
        ? e.actionType === "3pt"
          ? 3
          : e.actionType === "2pt"
            ? 2
            : e.actionType === "freethrow"
              ? 1
              : null
        : e.actionType === "freethrow"
          ? 1
          : null,
      shotX: typeof e.x === "number" ? e.x : null,
      shotY: typeof e.y === "number" ? e.y : null,
      freeThrowNumber: null,
      freeThrowTotal: null,
      reboundType: e.actionType === "rebound" ? e.subType || "rebound" : null,
      turnoverType: e.actionType === "turnover" ? e.subType || "turnover" : null,
      foulType: e.actionType === "foul" ? e.subType || "foul" : null,
      substitutionInPlayerId,
      substitutionOutPlayerId,
      sourceProvider: CDN_ADAPTER_ID,
      sourceEventId: String(e.actionNumber),
      normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
      rawSourcePointer: input.rawSourcePointer,
    };
  });

  return {
    season: input.season,
    gameId: input.gameId,
    gameDate: input.gameDate ?? null,
    homeTeamId: input.homeTeamId ?? null,
    awayTeamId: input.awayTeamId ?? null,
    homeScore: input.homeScore ?? null,
    awayScore: input.awayScore ?? null,
    events,
    normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
    rawSourcePointers: [input.rawSourcePointer],
    missingnessFlags: [...new Set(missingnessFlags)],
  };
}
