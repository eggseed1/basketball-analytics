/**
 * Derive employment / rights / negotiation from save state.
 * These are views over contracts and the FA market, not a second source of truth.
 */

import type {
  GmEmploymentStatus,
  GmFaMarket,
  GmFaStage,
  GmLeagueState,
  GmNegotiationStatus,
  GmPlayer,
  GmRightsStatus,
} from "@/gm/types";

export function hasPendingOption(player: GmPlayer): boolean {
  return Boolean(
    player.teamId &&
      player.contract &&
      player.contract.yearsRemaining <= 0 &&
      player.contract.option
  );
}

export function employmentOf(player: GmPlayer): GmEmploymentStatus {
  if (player.teamId == null && !player.contract) return "unsigned";
  if (player.teamId != null && player.contract) return "contracted";
  if (player.teamId != null && hasPendingOption(player)) return "contracted";
  if (player.teamId == null) return "unsigned";
  return "unavailable";
}

export function rightsOf(player: GmPlayer): GmRightsStatus {
  if (player.rightsKind === "restricted") return "restricted";
  if (player.rightsKind === "exclusive_draft") return "exclusive_draft";
  if (player.rightsKind === "bird") return "bird";
  if (player.rightsKind === "early") return "early_bird";
  if (player.teamId == null && !player.rightsTeamId) return "unrestricted";
  if (player.teamId == null && player.rightsTeamId) {
    if (player.rightsKind === "bird") return "bird";
    if (player.rightsKind === "early") return "early_bird";
    return "unrestricted";
  }
  return "none";
}

export function negotiationOf(
  player: GmPlayer,
  market: GmFaMarket | undefined
): GmNegotiationStatus {
  if (hasPendingOption(player)) return "pending_option";
  if (player.teamId != null && player.contract && player.contract.yearsRemaining > 0) {
    return "signed";
  }
  if (!market) return player.teamId == null ? "available" : "signed";
  if (market.offerSheets?.some((row) => row.playerId === player.id && row.status === "pending_match")) {
    return "offer_sheet_pending";
  }
  if (market.agreements.some((row) => row.playerId === player.id)) return "committed";
  const offers = market.pending.filter(
    (row) =>
      row.playerId === player.id &&
      row.kind !== "rejected" &&
      row.kind !== "withdrawn" &&
      row.kind !== "expired" &&
      row.kind !== "invalidated" &&
      row.kind !== "signed"
  );
  if (offers.some((row) => row.kind === "awaiting_match" || row.kind === "offer_sheet")) {
    return "offer_sheet_pending";
  }
  if (offers.some((row) => row.kind === "pending" || row.kind === "counter" || row.kind === "ready")) {
    return "awaiting_response";
  }
  if (offers.some((row) => row.kind === "interest")) return "negotiating";
  if (player.teamId == null) return "available";
  return "signed";
}

export function isSignableFreeAgent(player: GmPlayer, league: GmLeagueState): boolean {
  if (hasPendingOption(player)) return false;
  if (player.teamId != null) return false;
  if (player.rightsKind === "exclusive_draft") return false;
  if (!league.freeAgents.includes(player.id)) return false;
  const market = league.faMarket;
  if (market?.agreements.some((row) => row.playerId === player.id)) return false;
  if (
    market?.offerSheets?.some(
      (row) => row.playerId === player.id && row.status === "pending_match"
    )
  ) {
    return false;
  }
  return true;
}

export function estimatedServiceYears(player: GmPlayer, season: number): number {
  if (typeof player.serviceYears === "number") return player.serviceYears;
  if (typeof player.draftYear === "number") {
    return Math.max(0, season - player.draftYear);
  }
  // Undrafted veterans: age as a rough stand-in so QO bands still work.
  return Math.max(0, Math.min(15, player.age - 19));
}

/** RFA window: typically early career after a first NBA deal. */
export function isRfaEligible(player: GmPlayer, season: number): boolean {
  if (player.teamId != null && !hasPendingOption(player)) return false;
  if (player.qoStatus === "ineligible") return false;
  const service = estimatedServiceYears(player, season);
  return service >= 3 && service <= 4;
}

export function faStageOrder(): GmFaStage[] {
  return [
    "options",
    "qualifying_offers",
    "rights",
    "re_signing",
    "moratorium",
    "open",
    "fill",
  ];
}
