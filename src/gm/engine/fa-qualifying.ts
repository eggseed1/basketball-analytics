import { cbaSeason } from "@/gm/engine/season-flow-state";
/**
 * Qualifying offers. Tendering preserves restricted matching rights.
 * Accepting the QO creates the one-year contract; tender alone does not.
 */

import type { GmFaDecision, GmLeagueState, GmPlayer } from "@/gm/types";
import {
  estimatedServiceYears,
  isRfaEligible,
} from "@/gm/engine/fa-status";
import { qualifyingOfferAmount } from "@/gm/engine/free-agency-ask";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { overallOf } from "@/gm/engine/lineup";
import { uid } from "@/gm/engine/rng";

export type QoRow = {
  player: GmPlayer;
  rightsTeamId: string;
  amountM: number;
  status: NonNullable<GmPlayer["qoStatus"]>;
};

export function qualifyingOfferCandidates(state: GmLeagueState): QoRow[] {
  const rules = getCbaRules(cbaSeason(state));
  if (!rules.restrictedFreeAgency) return [];
  return state.players
    .filter((player) => {
      if (player.teamId != null) return false;
      if (!player.rightsTeamId) return false;
      if (player.qoStatus === "tendered" || player.qoStatus === "accepted") return true;
      if (player.qoStatus === "declined" || player.qoStatus === "expired") return false;
      return isRfaEligible(player, state.season);
    })
    .map((player) => ({
      player,
      rightsTeamId: player.rightsTeamId!,
      amountM: player.qoAmountM ?? qualifyingOfferAmount(player, rules),
      status: (player.qoStatus ?? "eligible") as NonNullable<GmPlayer["qoStatus"]>,
    }));
}

export function tenderQualifyingOffer(
  state: GmLeagueState,
  playerId: string,
  teamId: string
): { ok: true; state: GmLeagueState } | { ok: false; reason: string } {
  if (state.seasonFlow && (state.phase !== "free_agency" || state.faMarket?.stage !== "qualifying_offers")) return { ok: false, reason: "Qualifying offers open after contract options." };
  const rules = getCbaRules(cbaSeason(state));
  if (!rules.restrictedFreeAgency) {
    return { ok: false, reason: "Restricted free agency is off in this ruleset." };
  }
  const player = state.players.find((row) => row.id === playerId);
  if (!player || player.teamId != null) {
    return { ok: false, reason: "Player is not on the market." };
  }
  if (player.rightsTeamId !== teamId) {
    return { ok: false, reason: "Only the rights-holding club can tender a QO." };
  }
  if (!isRfaEligible(player, state.season) && player.qoStatus !== "eligible") {
    return { ok: false, reason: "He is not eligible for a qualifying offer." };
  }
  const amountM = qualifyingOfferAmount(player, rules);
  const players = state.players.map((row) =>
    row.id === playerId
      ? {
          ...row,
          qoStatus: "tendered" as const,
          qoAmountM: amountM,
          rightsKind: "restricted" as const,
        }
      : row
  );
  const decision: GmFaDecision = {
    id: uid("fadec"),
    kind: "qualifying_offer",
    playerId,
    teamId,
    headline: `Qualifying offer tendered to ${player.name}`,
    detail: `$${amountM.toFixed(1)}M for one year. Matching rights stay with the club until the QO is pulled or he signs elsewhere.`,
  };
  return {
    ok: true,
    state: {
      ...state,
      players,
      faMarket: state.faMarket
        ? {
            ...state.faMarket,
            decisions: [decision, ...(state.faMarket.decisions ?? [])].slice(0, 40),
            recap: [
              `${state.teams.find((t) => t.id === teamId)?.abbr ?? "Club"} tenders a QO to ${player.name} ($${amountM.toFixed(1)}M).`,
              ...(state.faMarket.recap ?? []),
            ].slice(0, 40),
          }
        : state.faMarket,
    },
  };
}

export function declineQualifyingOffer(
  state: GmLeagueState,
  playerId: string,
  teamId: string
): { ok: true; state: GmLeagueState } | { ok: false; reason: string } {
  const player = state.players.find((row) => row.id === playerId);
  if (!player || player.rightsTeamId !== teamId) {
    return { ok: false, reason: "Not your rights to decline." };
  }
  // No QO → no restricted matching. Prior Bird/early hold can still apply
  // when lastSalaryM is set from the expiring deal.
  const service = estimatedServiceYears(player, state.season);
  const bird =
    player.lastSalaryM != null
      ? service >= 3
        ? ("bird" as const)
        : ("early" as const)
      : undefined;
  const players = state.players.map((row) =>
    row.id === playerId
      ? {
          ...row,
          qoStatus: "declined" as const,
          qoAmountM: undefined,
          rightsKind: bird,
          rightsTeamId: bird ? teamId : null,
          lastSalaryM: bird ? row.lastSalaryM : undefined,
        }
      : row
  );

  return {
    ok: true,
    state: {
      ...state,
      players,
      faMarket: state.faMarket
        ? {
            ...state.faMarket,
            recap: [
              `${state.teams.find((t) => t.id === teamId)?.abbr ?? "Club"} declines to tender ${player.name}.`,
              ...(state.faMarket.recap ?? []),
            ].slice(0, 40),
          }
        : state.faMarket,
    },
  };
}

/** Player accepts the one-year QO — creates the contract. */
export function acceptQualifyingOffer(
  state: GmLeagueState,
  playerId: string
): { ok: true; state: GmLeagueState } | { ok: false; reason: string } {
  const player = state.players.find((row) => row.id === playerId);
  if (!player || player.qoStatus !== "tendered" || !player.rightsTeamId || !player.qoAmountM) {
    return { ok: false, reason: "No tendered qualifying offer to accept." };
  }
  const teamId = player.rightsTeamId;
  const players = state.players.map((row) =>
    row.id === playerId
      ? {
          ...row,
          teamId,
          qoStatus: "accepted" as const,
          rightsTeamId: null,
          rightsKind: undefined,
          lastSalaryM: undefined,
          contract: {
            yearsRemaining: 1,
            annualSalaryM: player.qoAmountM!,
            birdRights: "none" as const,
            signedSeason: cbaSeason(state),
            signedVia: "room" as const,
          },
        }
      : row
  );
  return {
    ok: true,
    state: {
      ...state,
      players,
      freeAgents: state.freeAgents.filter((id) => id !== playerId),
      faMarket: state.faMarket
        ? {
            ...state.faMarket,
            recap: [
              `${player.name} accepts the qualifying offer ($${player.qoAmountM!.toFixed(1)}M).`,
              ...(state.faMarket.recap ?? []),
            ].slice(0, 40),
          }
        : state.faMarket,
    },
  };
}

/** CPU: tender QOs on useful RFAs; skip aging fringe. */
export function resolveCpuQualifyingOffers(state: GmLeagueState): GmLeagueState {
  let next = state;
  for (const row of qualifyingOfferCandidates(next)) {
    if (row.rightsTeamId === next.userTeamId) continue;
    if (row.status === "tendered" || row.status === "accepted") continue;
    const keep = overallOf(row.player) >= 74 || estimatedServiceYears(row.player, next.season) <= 3;
    const result = keep
      ? tenderQualifyingOffer(next, row.player.id, row.rightsTeamId)
      : declineQualifyingOffer(next, row.player.id, row.rightsTeamId);
    if (result.ok) next = result.state;
  }
  return next;
}

export function userQoBlocking(state: GmLeagueState): QoRow[] {
  return qualifyingOfferCandidates(state).filter(
    (row) =>
      row.rightsTeamId === state.userTeamId &&
      (row.status === "eligible" || !row.player.qoStatus)
  );
}
