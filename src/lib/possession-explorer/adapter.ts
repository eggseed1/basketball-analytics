import type { DrblEvent, DrblPossession } from "../../../drbl/types";
import type { GamePossessionResult } from "@/pbp/product-types";
import { formatPlayClock } from "@/data/transformers/play-by-play";
import { provenanceSourceLabel } from "./provenance-labels";
import {
  buildPossessionTeamContext,
  isInvalidPublicTeamAbbreviation,
  resolveOffenseAgainstContext,
  type PossessionExplorerTeamContext,
  type TeamContextBuildInput,
} from "./team-identity";
import type {
  PossessionExplorerModel,
  PossessionExplorerNotice,
  PossessionExplorerRow,
  PossessionExplorerUnavailableReason,
  PossessionResultGroup,
} from "./types";

export type { PossessionExplorerTeamContext, TeamContextBuildInput };
export {
  buildPossessionTeamContext,
  isInvalidPublicTeamAbbreviation,
  legacyBrokenAbbreviationFallback,
  resolveOffenseAgainstContext,
} from "./team-identity";

const UNAVAILABLE_COPY: Record<
  PossessionExplorerUnavailableReason,
  string
> = {
  pbp_fetch_failed: "Play-by-play is unavailable for this game.",
  pbp_empty: "Play-by-play is unavailable for this game.",
  normalization_failed: "The play sequence could not be prepared for this game.",
  validation_failed:
    "Possession sequences could not be validated for this game.",
  identity_unresolved:
    "Team identities for this game’s possession sequences could not be resolved.",
};

export const POSSESSION_EXPLORER_SECONDARY_MESSAGE =
  "The box score and standard play-by-play may still be available above.";

export function periodLabel(period: number): string {
  if (period <= 0) return `P${period}`;
  if (period <= 4) return `Q${period}`;
  if (period === 5) return "OT";
  return `${period - 4}OT`;
}

/** Presentation-only grouping — does not alter possession truth. */
export function resultGroupForEndReason(
  endReason: string
): PossessionResultGroup {
  switch (endReason) {
    case "made_fg":
      return "made_shot";
    case "def_rebound":
      return "missed_shot";
    case "turnover":
      return "turnover";
    case "made_ft":
      return "free_throws";
    case "period":
      return "end_of_period";
    case "jumpball":
    case "team_rebound":
    case "other":
      return "other";
    default:
      return "other";
  }
}

export function resultGroupLabel(group: PossessionResultGroup): string {
  switch (group) {
    case "made_shot":
      return "Made shot";
    case "missed_shot":
      return "Missed shot";
    case "turnover":
      return "Turnover";
    case "free_throws":
      return "Free throws";
    case "end_of_period":
      return "End of period";
    case "other":
      return "Other";
    default: {
      const _exhaustive: never = group;
      return String(_exhaustive);
    }
  }
}

/** Same vocabulary as filter chips — never alternate “Made field goal”. */
export function endReasonLabel(endReason: string): string {
  return resultGroupLabel(resultGroupForEndReason(endReason));
}

export function stablePossessionRowId(
  possession: Pick<
    DrblPossession,
    | "possessionId"
    | "gameId"
    | "period"
    | "startActionNumber"
    | "endActionNumber"
    | "offenseTeamId"
  >
): string {
  if (possession.possessionId?.trim()) return possession.possessionId;
  return [
    possession.gameId,
    `p${possession.period}`,
    `a${possession.startActionNumber}`,
    `e${possession.endActionNumber}`,
    possession.offenseTeamId,
  ].join("-");
}

function eventByActionNumber(events: DrblEvent[]): Map<number, DrblEvent> {
  const map = new Map<number, DrblEvent>();
  for (const event of events) {
    map.set(event.actionNumber, event);
  }
  return map;
}

function scoreAfterForPossession(
  possession: DrblPossession,
  byAction: Map<number, DrblEvent>
): { home: number; away: number } | null {
  let last: DrblEvent | null = null;
  for (const actionNumber of possession.eventActionNumbers) {
    const event = byAction.get(actionNumber);
    if (event) last = event;
  }
  if (!last) {
    const end = byAction.get(possession.endActionNumber);
    if (!end) return null;
    last = end;
  }
  return { home: last.scoreHome, away: last.scoreAway };
}

function collectObservedTeamIds(
  possessions: DrblPossession[],
  events: DrblEvent[]
): string[] {
  const ids = new Set<string>();
  for (const possession of possessions) {
    if (possession.offenseTeamId) ids.add(possession.offenseTeamId);
    if (possession.defenseTeamId) ids.add(possession.defenseTeamId);
  }
  for (const event of events) {
    if (event.teamId) ids.add(event.teamId);
    if (event.possessionTeamId) ids.add(event.possessionTeamId);
  }
  return [...ids];
}

function buildRows(
  possessions: DrblPossession[],
  events: DrblEvent[],
  teams: PossessionExplorerTeamContext
): { rows: PossessionExplorerRow[]; unresolvedOffenseIds: string[] } {
  const byAction = eventByActionNumber(events);
  const unresolvedOffenseIds: string[] = [];
  const rows: PossessionExplorerRow[] = [];

  for (let index = 0; index < possessions.length; index++) {
    const possession = possessions[index]!;
    const offense = resolveOffenseAgainstContext(
      possession.offenseTeamId,
      teams
    );
    if (!offense) {
      unresolvedOffenseIds.push(possession.offenseTeamId);
      continue;
    }
    if (isInvalidPublicTeamAbbreviation(offense.abbreviation)) {
      unresolvedOffenseIds.push(possession.offenseTeamId);
      continue;
    }

    const endReasonKey = possession.endReason || "other";
    const rowEvents = possession.eventActionNumbers
      .map((actionNumber) => byAction.get(actionNumber))
      .filter((event): event is DrblEvent => Boolean(event))
      .map((event) => ({
        id: `${stablePossessionRowId(possession)}-e${event.actionNumber}`,
        clock: formatPlayClock(event.clockSeconds),
        description: event.description?.trim() || event.actionType,
        actionType: event.actionType,
        teamId: event.teamId,
      }));

    rows.push({
      id: stablePossessionRowId(possession),
      ordinal: index + 1,
      period: possession.period,
      periodLabel: periodLabel(possession.period),
      startClock: formatPlayClock(possession.startClockSeconds),
      endClock:
        possession.endClockSeconds != null
          ? formatPlayClock(possession.endClockSeconds)
          : null,
      offenseTeamId: offense.canonicalTeamId,
      offenseNbaTeamId: offense.nbaTeamId,
      offenseTeamAbbreviation: offense.abbreviation,
      offenseTeamName: offense.displayName,
      offenseSide: offense.side,
      points: possession.points,
      endReasonKey,
      endReasonLabel: endReasonLabel(endReasonKey),
      resultGroup: resultGroupForEndReason(endReasonKey),
      scoreAfter: scoreAfterForPossession(possession, byAction),
      events: rowEvents,
    });
  }

  return { rows, unresolvedOffenseIds };
}

function buildNotices(input: {
  comparison: import("@/pbp/product-types").OfficialPossessionComparison;
  lineupDerived: boolean;
}): PossessionExplorerNotice[] {
  const notices: PossessionExplorerNotice[] = [
    {
      kind: "derived",
      message:
        "These sequences are reconstructed from play-by-play. They are not labeled as official NBA possession counts.",
    },
  ];

  if (input.comparison === "mismatched") {
    notices.push({
      kind: "mismatch",
      message:
        "Derived possession boundaries differ from the NBA-reported totals for this game. Sequence browsing remains available, but aggregate possession metrics are hidden.",
    });
  } else if (input.comparison === "unavailable") {
    notices.push({
      kind: "comparison_unavailable",
      message:
        "Official NBA possession totals were not available for comparison on this game.",
    });
  }

  if (!input.lineupDerived) {
    notices.push({
      kind: "lineup_unavailable",
      message:
        "Lineup context is unavailable because the substitution sequence could not be fully validated.",
    });
  }

  return notices;
}

function unavailableModel(
  gameId: string,
  reason: PossessionExplorerUnavailableReason
): PossessionExplorerModel {
  return {
    status: "unavailable",
    gameId,
    reason,
    userMessage: UNAVAILABLE_COPY[reason],
    secondaryMessage: POSSESSION_EXPLORER_SECONDARY_MESSAGE,
  };
}

function isTeamContext(
  value: TeamContextBuildInput | PossessionExplorerTeamContext
): value is PossessionExplorerTeamContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "home" in value &&
    "away" in value &&
    value.home != null &&
    typeof value.home === "object" &&
    "canonicalTeamId" in value.home &&
    Array.isArray(value.home.aliasIds)
  );
}

/**
 * Pure presentation adapter — serializable view model only.
 * Never pass raw provider payloads or validation stacks to the client.
 */
export function buildPossessionExplorerModel(
  result: GamePossessionResult,
  teamInput: TeamContextBuildInput | PossessionExplorerTeamContext
): PossessionExplorerModel {
  if (result.status === "unavailable") {
    return unavailableModel(result.gameId, result.reason);
  }

  const observedTeamIds = collectObservedTeamIds(
    result.possessions,
    result.events
  );

  const teams: PossessionExplorerTeamContext | null = isTeamContext(teamInput)
    ? teamInput
    : buildPossessionTeamContext({
        ...teamInput,
        observedTeamIds: [
          ...(teamInput.observedTeamIds ?? []),
          ...observedTeamIds,
        ],
      });

  if (!teams) {
    return unavailableModel(result.gameId, "identity_unresolved");
  }

  if (
    isInvalidPublicTeamAbbreviation(teams.home.abbreviation) ||
    isInvalidPublicTeamAbbreviation(teams.away.abbreviation)
  ) {
    return unavailableModel(result.gameId, "identity_unresolved");
  }

  const { rows, unresolvedOffenseIds } = buildRows(
    result.possessions,
    result.events,
    teams
  );

  if (unresolvedOffenseIds.length > 0 || rows.length === 0) {
    return unavailableModel(result.gameId, "identity_unresolved");
  }

  const sides = new Set(rows.map((row) => row.offenseSide));
  if (!sides.has("home") || !sides.has("away")) {
    return unavailableModel(result.gameId, "identity_unresolved");
  }

  const comparison = result.officialPossessionComparison;
  const lineupContextAvailable = result.capability.lineupsDerived;
  const suppressAggregateMetrics =
    comparison === "mismatched" || comparison === "unavailable";

  const periodOptions = [...new Set(rows.map((row) => row.period))].sort(
    (a, b) => a - b
  );

  return {
    status: "available",
    gameId: result.gameId,
    teams,
    provenance: {
      playByPlay: result.provenance.playByPlay,
      boxScore: result.provenance.boxScore,
      playByPlayLabel: provenanceSourceLabel(result.provenance.playByPlay),
      boxScoreLabel: provenanceSourceLabel(result.provenance.boxScore),
    },
    quality: {
      officialComparison: comparison,
      lineupContextAvailable,
      suppressAggregateMetrics,
      notices: buildNotices({
        comparison,
        lineupDerived: lineupContextAvailable,
      }),
      details: {
        derivedHome: result.derivedPossessions.home,
        derivedAway: result.derivedPossessions.away,
        officialHome: result.officialPossessions?.home ?? null,
        officialAway: result.officialPossessions?.away ?? null,
        deltaHome: result.possessionDelta?.home ?? null,
        deltaAway: result.possessionDelta?.away ?? null,
      },
    },
    rows,
    periodOptions,
  };
}
