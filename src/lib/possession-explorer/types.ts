import type {
  OfficialPossessionComparison,
  PbpProductSource,
} from "@/pbp/product-types";

/**
 * Canonical possession-side team identity.
 * `canonicalTeamId` is the DRBL/ESPN id; NBA Stats ids are aliases only.
 */
export type PossessionExplorerTeamIdentity = {
  canonicalTeamId: string;
  nbaTeamId: string | null;
  abbreviation: string;
  displayName: string;
  side: "home" | "away";
  /** All known provider / abbr tokens that map to this side. */
  aliasIds: string[];
};

export type PossessionExplorerNoticeKind =
  | "derived"
  | "mismatch"
  | "lineup_unavailable"
  | "comparison_unavailable";

export type PossessionExplorerNotice = {
  kind: PossessionExplorerNoticeKind;
  message: string;
};

export type PossessionExplorerEvent = {
  id: string;
  clock: string;
  description: string;
  actionType: string;
  teamId: string | null;
};

export type PossessionExplorerRow = {
  id: string;
  ordinal: number;
  period: number;
  periodLabel: string;
  startClock: string;
  endClock: string | null;
  /** Stable filter key = canonical team id. */
  offenseTeamId: string;
  offenseNbaTeamId: string | null;
  offenseTeamAbbreviation: string;
  offenseTeamName: string;
  offenseSide: "home" | "away";
  points: number;
  endReasonKey: string;
  endReasonLabel: string;
  resultGroup: PossessionResultGroup;
  scoreAfter: { home: number; away: number } | null;
  events: PossessionExplorerEvent[];
};

export type PossessionResultGroup =
  | "made_shot"
  | "missed_shot"
  | "turnover"
  | "free_throws"
  | "end_of_period"
  | "other";

export type PossessionExplorerUnavailableReason =
  | "pbp_fetch_failed"
  | "pbp_empty"
  | "normalization_failed"
  | "validation_failed"
  | "identity_unresolved";

export type PossessionExplorerQuality = {
  officialComparison: OfficialPossessionComparison;
  lineupContextAvailable: boolean;
  suppressAggregateMetrics: boolean;
  notices: PossessionExplorerNotice[];
  details: {
    derivedHome: number | null;
    derivedAway: number | null;
    officialHome: number | null;
    officialAway: number | null;
    deltaHome: number | null;
    deltaAway: number | null;
  };
};

export type PossessionExplorerModel =
  | {
      status: "available";
      gameId: string;
      teams: {
        home: PossessionExplorerTeamIdentity;
        away: PossessionExplorerTeamIdentity;
      };
      provenance: {
        playByPlay: PbpProductSource;
        boxScore: PbpProductSource;
        playByPlayLabel: string;
        boxScoreLabel: string;
      };
      quality: PossessionExplorerQuality;
      rows: PossessionExplorerRow[];
      periodOptions: number[];
    }
  | {
      status: "unavailable";
      gameId: string;
      reason: PossessionExplorerUnavailableReason;
      userMessage: string;
      secondaryMessage: string;
    };

export type PossessionExplorerFilters = {
  period: "all" | number;
  offense: "both" | "home" | "away";
  result: "all" | PossessionResultGroup;
};

export type PossessionExplorerVisibleState = {
  filters: PossessionExplorerFilters;
  visibleCount: number;
};
