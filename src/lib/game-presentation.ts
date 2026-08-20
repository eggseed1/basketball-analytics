/**
 * Game presentation integrity — reject invented ? 0-0 FINAL shells.
 */

import type { Game } from "@/data/types";
import type { GameStatusKind } from "@/lib/game-status";

export type GamePresentationIssue =
  | "MISSING_HOME_TEAM"
  | "MISSING_AWAY_TEAM"
  | "MISSING_SCORE"
  | "INVALID_FINAL_SCORE"
  | "UNKNOWN_PROVIDER"
  | "GAME_LOOKUP_FAILED"
  | "IDENTITY_CONFLICT"
  | "MALFORMED_GAME_RECORD";

export type GamePresentationState =
  | "COMPLETE"
  | "PARTIAL"
  | "LOOKUP_FAILURE"
  | "SOURCE_DATA_FAILURE";

export interface GamePresentationValidation {
  state: GamePresentationState;
  issues: GamePresentationIssue[];
  /** Safe to render normal final-score header. */
  canRenderScoreHeader: boolean;
  /** Safe to render deep features (PBP, shot chart, flow). */
  canRenderDeepFeatures: boolean;
}

function hasTeamId(id: unknown): boolean {
  return typeof id === "string" && id.trim().length > 0;
}

function scorePresent(score: unknown): score is number {
  return typeof score === "number" && Number.isFinite(score);
}

/**
 * Validate a game object before normal header / deep feature rendering.
 * Does not invent teams or scores.
 */
export function validateGamePresentation(
  game: Game | null | undefined
): GamePresentationValidation {
  if (!game || !String(game.id ?? "").trim()) {
    return {
      state: "LOOKUP_FAILURE",
      issues: ["GAME_LOOKUP_FAILED"],
      canRenderScoreHeader: false,
      canRenderDeepFeatures: false,
    };
  }

  const issues: GamePresentationIssue[] = [];
  if (!hasTeamId(game.homeTeamId)) issues.push("MISSING_HOME_TEAM");
  if (!hasTeamId(game.awayTeamId)) issues.push("MISSING_AWAY_TEAM");

  const status = (game.status ?? "unknown") as GameStatusKind;
  const homeOk = scorePresent(game.homeScore);
  const awayOk = scorePresent(game.awayScore);

  if (status === "final") {
    if (!homeOk || !awayOk) {
      issues.push("MISSING_SCORE");
    } else if (
      game.homeScore === 0 &&
      game.awayScore === 0 &&
      (!game.homeTeamId || !game.awayTeamId)
    ) {
      issues.push("INVALID_FINAL_SCORE");
    } else if (
      game.homeScore === 0 &&
      game.awayScore === 0 &&
      !game.gameDate
    ) {
      // Suspicious invented shell: FINAL 0-0 with no date
      issues.push("INVALID_FINAL_SCORE");
    }
  }

  const identityBroken =
    issues.includes("MISSING_HOME_TEAM") ||
    issues.includes("MISSING_AWAY_TEAM");
  const scoreBroken =
    issues.includes("MISSING_SCORE") ||
    issues.includes("INVALID_FINAL_SCORE");

  if (identityBroken && scoreBroken) {
    return {
      state: "SOURCE_DATA_FAILURE",
      issues,
      canRenderScoreHeader: false,
      canRenderDeepFeatures: false,
    };
  }

  if (identityBroken) {
    return {
      state: "SOURCE_DATA_FAILURE",
      issues,
      canRenderScoreHeader: false,
      canRenderDeepFeatures: false,
    };
  }

  if (scoreBroken && status === "final") {
    return {
      state: "PARTIAL",
      issues,
      canRenderScoreHeader: false,
      canRenderDeepFeatures: false,
    };
  }

  const hasBoxSignals =
    Boolean(game.homeTeamAbbr || game.awayTeamAbbr) ||
    Boolean(game.homePeriodScores?.length);

  return {
    state: hasBoxSignals || status !== "final" ? "COMPLETE" : "PARTIAL",
    issues,
    canRenderScoreHeader: true,
    canRenderDeepFeatures: true,
  };
}

/** True for the classic invented shell: blank teams + 0-0 + FINAL. */
export function isMalformedEmptyFinalShell(game: Game | null | undefined): boolean {
  if (!game) return true;
  const blankTeams = !hasTeamId(game.homeTeamId) || !hasTeamId(game.awayTeamId);
  const zeroZero = game.homeScore === 0 && game.awayScore === 0;
  const finalish = game.status === "final" || game.status == null;
  return blankTeams && zeroZero && finalish;
}

/** Season from NBA Stats GameID `002YY#####`. */
export function seasonFromNbaGameId(gameId: string): string | null {
  const m = /^002(\d{2})\d{5}$/.exec(String(gameId).trim());
  if (!m) return null;
  const yy = Number(m[1]);
  const start = yy >= 50 ? 1900 + yy : 2000 + yy;
  const end = (start + 1) % 100;
  return `${start}-${String(end).padStart(2, "0")}`;
}
