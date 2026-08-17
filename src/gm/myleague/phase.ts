/**
 * MyLeague phase machine helpers + Franchise Lab phase bridge.
 * Milestone 2 scaffolding - full FO substates land in later milestones.
 */

import type { GmSeasonPhase } from "@/gm/types";
import type { KnowledgeDate, MyLeaguePhase } from "@/gm/myleague/types";

/** Canonical annual order (see docs/myleague-season-flow.md). */
export const MYLEAGUE_PHASE_ORDER: readonly MyLeaguePhase[] = [
  "SEASON_REVIEW",
  "FRONT_OFFICE_REVIEW",
  "ROSTER_DECISIONS",
  "STAFF_REVIEW",
  "DRAFT_LOTTERY",
  "DRAFT_COMBINE",
  "DRAFT",
  "POST_DRAFT",
  "FREE_AGENCY",
  "TRAINING_CAMP",
  "PRESEASON",
  "REGULAR_SEASON",
  "TRADE_DEADLINE",
  "PLAYOFFS",
  "FINALS",
  "SEASON_END",
] as const;

/** First playable loop (Milestone 4) - soft FO phases collapsed. */
export const PLAYABLE_LOOP_PHASES: readonly MyLeaguePhase[] = [
  "DRAFT_LOTTERY",
  "DRAFT",
  "FREE_AGENCY",
  "PRESEASON",
  "REGULAR_SEASON",
  "PLAYOFFS",
  "FINALS",
  "SEASON_END",
] as const;

const SIM_ALLOWED: ReadonlySet<MyLeaguePhase> = new Set([
  "PRESEASON",
  "REGULAR_SEASON",
  "TRADE_DEADLINE",
  "PLAYOFFS",
  "FINALS",
]);

export function phaseIndex(phase: MyLeaguePhase): number {
  return MYLEAGUE_PHASE_ORDER.indexOf(phase);
}

export function nextPhase(phase: MyLeaguePhase): MyLeaguePhase {
  const i = phaseIndex(phase);
  if (i < 0) return "SEASON_REVIEW";
  if (phase === "SEASON_END") return "SEASON_REVIEW";
  if (phase === "TRADE_DEADLINE") return "REGULAR_SEASON";
  return MYLEAGUE_PHASE_ORDER[(i + 1) % MYLEAGUE_PHASE_ORDER.length]!;
}

/** Soft advance for scaffolding - skips FO polish phases when collapsing. */
export function nextPlayablePhase(phase: MyLeaguePhase): MyLeaguePhase {
  let cursor = nextPhase(phase);
  let guard = 0;
  while (
    guard < MYLEAGUE_PHASE_ORDER.length &&
    !PLAYABLE_LOOP_PHASES.includes(cursor) &&
    cursor !== "TRADE_DEADLINE"
  ) {
    cursor = nextPhase(cursor);
    guard += 1;
  }
  return cursor;
}

export function isSimAllowed(phase: MyLeaguePhase): boolean {
  return SIM_ALLOWED.has(phase);
}

export function knowledgeOf(
  season: number,
  phase: MyLeaguePhase,
  day?: number
): KnowledgeDate {
  return day == null ? { season, phase } : { season, phase, day };
}

/**
 * Map Franchise Lab coarse phase → MyLeague phase.
 * Trade-deadline / finals nuance can refine later via day + bracket.
 */
export function mapGmPhaseToMyLeague(
  phase: GmSeasonPhase["phase"],
  opts?: { isFinals?: boolean; pastTradeDeadline?: boolean }
): MyLeaguePhase {
  switch (phase) {
    case "preseason":
      return "PRESEASON";
    case "regular":
      return opts?.pastTradeDeadline ? "TRADE_DEADLINE" : "REGULAR_SEASON";
    case "play_in":
    case "playoffs":
      return opts?.isFinals ? "FINALS" : "PLAYOFFS";
    case "draft":
      return "DRAFT";
    case "free_agency":
      return "FREE_AGENCY";
    case "offseason":
      return "SEASON_REVIEW";
    default:
      return "REGULAR_SEASON";
  }
}

/** Best-effort reverse map for writing back into Franchise Lab. */
export function mapMyLeaguePhaseToGm(
  phase: MyLeaguePhase
): GmSeasonPhase["phase"] {
  switch (phase) {
    case "TRAINING_CAMP":
    case "PRESEASON":
      return "preseason";
    case "REGULAR_SEASON":
    case "TRADE_DEADLINE":
      return "regular";
    case "PLAYOFFS":
    case "FINALS":
      return "playoffs";
    case "DRAFT_LOTTERY":
    case "DRAFT_COMBINE":
    case "DRAFT":
    case "POST_DRAFT":
      return "draft";
    case "FREE_AGENCY":
    case "ROSTER_DECISIONS":
      return "free_agency";
    case "SEASON_REVIEW":
    case "FRONT_OFFICE_REVIEW":
    case "STAFF_REVIEW":
    case "SEASON_END":
      return "offseason";
    default:
      return "regular";
  }
}

export function compareKnowledgeDate(a: KnowledgeDate, b: KnowledgeDate): number {
  if (a.season !== b.season) return a.season - b.season;
  const pa = phaseIndex(a.phase);
  const pb = phaseIndex(b.phase);
  if (pa !== pb) return pa - pb;
  return (a.day ?? 0) - (b.day ?? 0);
}

export function knowledgeGte(a: KnowledgeDate, b: KnowledgeDate): boolean {
  return compareKnowledgeDate(a, b) >= 0;
}
