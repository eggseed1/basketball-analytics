import { cbaSeason } from "@/gm/engine/season-flow-state";
/**
 * Restricted free agency: outside offer sheets and incumbent match windows.
 * Match deadlines are compressed game ticks from market config, not a
 * hardcoded real-world 48-hour claim.
 */

import type {
  GmFaDecision,
  GmFaOfferSheet,
  GmFaReservation,
  GmLeagueState,
  GmSignVia,
} from "@/gm/types";
import { evaluateSigning } from "@/gm/engine/cap";
import { autoSetLineup, overallOf } from "@/gm/engine/lineup";
import { defaultFaConfig, ensureFaMarket } from "@/gm/engine/fa-market-config";
import { uid } from "@/gm/engine/rng";

function applySign(
  state: GmLeagueState,
  playerId: string,
  teamId: string,
  salaryM: number,
  years: number,
  via: GmSignVia
): GmLeagueState {
  const annual = Math.round(salaryM * 100) / 100;
  const players = state.players.map((player) =>
    player.id === playerId
      ? {
          ...player,
          teamId,
          identityRevealed: true,
          rightsTeamId: null,
          rightsStartSeason: undefined,
          rightsKind: undefined,
          lastSalaryM: undefined,
          qoStatus: undefined,
          qoAmountM: undefined,
          contract: {
            yearsRemaining: years,
            annualSalaryM: annual,
            birdRights: (player.rightsTeamId === teamId ? "bird" : "none") as "bird" | "none",
            originalYears: years,
            years: Array.from({ length: years }, (_, index) => ({ season: cbaSeason(state) + index, salaryM: annual })),
            birdStartSeason: player.rightsTeamId === teamId ? player.rightsStartSeason ?? cbaSeason(state) : cbaSeason(state),
            signedSeason: cbaSeason(state),
            signedVia: via,
          },
        }
      : player
  );
  const freeAgents = players
    .filter((player) => player.teamId == null)
    .map((player) => player.id);
  const market = state.faMarket
    ? {
        ...state.faMarket,
        agreements: state.faMarket.agreements.filter((row) => row.playerId !== playerId),
        pending: state.faMarket.pending.filter((row) => row.playerId !== playerId),
        reservations: (state.faMarket.reservations ?? []).filter(
          (row) => row.playerId !== playerId
        ),
        offerSheets: (state.faMarket.offerSheets ?? []).map((row) =>
          row.playerId === playerId && row.status === "pending_match"
            ? row
            : row
        ),
      }
    : state.faMarket;
  return {
    ...state,
    players,
    freeAgents,
    faMarket: market,
    teams: state.teams.map((team) => autoSetLineup(team, players)),
  };
}

export function submitOfferSheet(
  state: GmLeagueState,
  playerId: string,
  offeringTeamId: string,
  salaryM: number,
  years: number
): { ok: true; state: GmLeagueState; note: string } | { ok: false; reason: string } {
  const market = ensureFaMarket(state);
  const player = state.players.find((row) => row.id === playerId);
  if (!player || player.teamId != null) {
    return { ok: false, reason: "Player is not on the market." };
  }
  if (player.rightsKind !== "restricted" || player.qoStatus !== "tendered") {
    return { ok: false, reason: "He is not a restricted free agent with a tendered QO." };
  }
  if (!player.rightsTeamId || player.rightsTeamId === offeringTeamId) {
    return { ok: false, reason: "Offer sheets are for outside clubs." };
  }
  if (
    (market.offerSheets ?? []).some(
      (row) => row.playerId === playerId && row.status === "pending_match"
    )
  ) {
    return { ok: false, reason: "An offer sheet is already pending on this player." };
  }
  const verdict = evaluateSigning(state, offeringTeamId, player, salaryM, years);
  if (!verdict.ok) return verdict;

  const config = market.config ?? defaultFaConfig();
  const sheet: GmFaOfferSheet = {
    id: uid("sheet"),
    playerId,
    offeringTeamId,
    rightsTeamId: player.rightsTeamId,
    salaryM,
    years,
    via: verdict.via,
    matchDeadlineDay: market.day + config.rfaMatchTicks,
    status: "pending_match",
    offerId: uid("fa"),
  };
  const reservation: GmFaReservation = {
    id: uid("res"),
    teamId: offeringTeamId,
    playerId,
    salaryM,
    via: verdict.via,
    offerId: sheet.offerId,
    kind: "offer_sheet",
  };
  const offering = state.teams.find((t) => t.id === offeringTeamId);
  const incumbent = state.teams.find((t) => t.id === player.rightsTeamId);
  return {
    ok: true,
    note: `Offer sheet filed. ${incumbent?.abbr ?? "The rights holder"} has until day ${sheet.matchDeadlineDay + 1} to match.`,
    state: {
      ...state,
      faMarket: {
        ...market,
        offerSheets: [...(market.offerSheets ?? []), sheet],
        reservations: [...(market.reservations ?? []), reservation],
        pending: [
          ...market.pending.filter(
            (row) => !(row.playerId === playerId && row.teamId === offeringTeamId)
          ),
          {
            id: sheet.offerId,
            playerId,
            teamId: offeringTeamId,
            salaryM,
            years,
            day: market.day,
            kind: "offer_sheet",
            via: verdict.via,
            responseNote: "Offer sheet pending match.",
          },
        ],
        decisions: [
          {
            id: uid("fadec"),
            kind: "rfa_match",
            playerId,
            teamId: player.rightsTeamId,
            headline: `Offer sheet on ${player.name}`,
            detail: `${offering?.abbr ?? "A club"} filed $${salaryM.toFixed(1)}M / ${years} yrs. Match or decline by day ${sheet.matchDeadlineDay + 1}.`,
            deadlineDay: sheet.matchDeadlineDay,
            payload: { sheetId: sheet.id },
          } satisfies GmFaDecision,
          ...(market.decisions ?? []),
        ].slice(0, 40),
        recap: [
          `${offering?.abbr ?? "Club"} files an offer sheet on ${player.name} ($${salaryM.toFixed(1)}M / ${years}).`,
          ...(market.recap ?? []),
        ].slice(0, 40),
      },
    },
  };
}

export function matchOfferSheet(
  state: GmLeagueState,
  sheetId: string,
  actingTeamId?: string
): { ok: true; state: GmLeagueState; note: string } | { ok: false; reason: string } {
  const market = ensureFaMarket(state);
  const sheet = (market.offerSheets ?? []).find((row) => row.id === sheetId);
  if (!sheet || sheet.status !== "pending_match") {
    return { ok: false, reason: "No pending offer sheet to match." };
  }
  const actor = actingTeamId ?? state.userTeamId;
  if (sheet.rightsTeamId !== actor) {
    return { ok: false, reason: "Only the rights-holding club can match." };
  }
  const player = state.players.find((row) => row.id === sheet.playerId);
  if (!player) return { ok: false, reason: "Player missing." };
  const verdict = evaluateSigning(
    state,
    sheet.rightsTeamId,
    player,
    sheet.salaryM,
    sheet.years
  );
  if (!verdict.ok) return verdict;

  let next = applySign(
    state,
    sheet.playerId,
    sheet.rightsTeamId,
    sheet.salaryM,
    sheet.years,
    verdict.via
  );
  next = {
    ...next,
    faMarket: next.faMarket
      ? {
          ...next.faMarket,
          offerSheets: (next.faMarket.offerSheets ?? []).map((row) =>
            row.id === sheetId ? { ...row, status: "matched" as const } : row
          ),
          reservations: (next.faMarket.reservations ?? []).filter(
            (row) => row.offerId !== sheet.offerId
          ),
          decisions: (next.faMarket.decisions ?? []).map((row) =>
            row.payload?.sheetId === sheetId ? { ...row, read: true } : row
          ),
          recap: [
            `${next.teams.find((t) => t.id === sheet.rightsTeamId)?.abbr ?? "Club"} matches ${player.name}.`,
            ...(next.faMarket.recap ?? []),
          ].slice(0, 40),
        }
      : next.faMarket,
  };
  return {
    ok: true,
    note: `Matched ${player.name} at $${sheet.salaryM.toFixed(1)}M / ${sheet.years} yrs.`,
    state: next,
  };
}

export function declineOfferSheet(
  state: GmLeagueState,
  sheetId: string,
  actingTeamId?: string
): { ok: true; state: GmLeagueState; note: string } | { ok: false; reason: string } {
  const market = ensureFaMarket(state);
  const sheet = (market.offerSheets ?? []).find((row) => row.id === sheetId);
  if (!sheet || sheet.status !== "pending_match") {
    return { ok: false, reason: "No pending offer sheet to decline." };
  }
  const actor = actingTeamId ?? state.userTeamId;
  if (sheet.rightsTeamId !== actor) {
    return { ok: false, reason: "Only the rights-holding club can decline the match." };
  }
  const player = state.players.find((row) => row.id === sheet.playerId);
  if (!player) return { ok: false, reason: "Player missing." };

  let next = applySign(
    state,
    sheet.playerId,
    sheet.offeringTeamId,
    sheet.salaryM,
    sheet.years,
    sheet.via
  );
  next = {
    ...next,
    faMarket: next.faMarket
      ? {
          ...next.faMarket,
          offerSheets: (next.faMarket.offerSheets ?? []).map((row) =>
            row.id === sheetId ? { ...row, status: "declined" as const } : row
          ),
          reservations: (next.faMarket.reservations ?? []).filter(
            (row) => row.offerId !== sheet.offerId
          ),
          decisions: (next.faMarket.decisions ?? []).map((row) =>
            row.payload?.sheetId === sheetId ? { ...row, read: true } : row
          ),
          recap: [
            `${next.teams.find((t) => t.id === sheet.rightsTeamId)?.abbr ?? "Club"} declines to match ${player.name}; he joins ${next.teams.find((t) => t.id === sheet.offeringTeamId)?.abbr ?? "the other club"}.`,
            ...(next.faMarket.recap ?? []),
          ].slice(0, 40),
        }
      : next.faMarket,
  };
  return {
    ok: true,
    note: `${player.name} signs with ${next.teams.find((t) => t.id === sheet.offeringTeamId)?.abbr ?? "the offering club"}.`,
    state: next,
  };
}

/** Expire sheets past their deadline (treated as a decline by the incumbent). */
export function resolveExpiredOfferSheets(state: GmLeagueState): GmLeagueState {
  const market = ensureFaMarket(state);
  let next = state;
  for (const sheet of market.offerSheets ?? []) {
    if (sheet.status !== "pending_match") continue;
    if (market.day < sheet.matchDeadlineDay) continue;
    const result = declineOfferSheet(next, sheet.id, sheet.rightsTeamId);
    if (result.ok) next = result.state;
  }
  return next;
}

/** CPU incumbent: match when the player is clearly worth the sheet. */
export function resolveCpuOfferSheetMatches(state: GmLeagueState): GmLeagueState {
  const market = ensureFaMarket(state);
  let next = state;
  for (const sheet of [...(market.offerSheets ?? [])]) {
    if (sheet.status !== "pending_match") continue;
    if (sheet.rightsTeamId === next.userTeamId) continue;
    const player = next.players.find((row) => row.id === sheet.playerId);
    if (!player) continue;
    const shouldMatch =
      overallOf(player) >= 78 &&
      sheet.salaryM <= (player.lastSalaryM ?? sheet.salaryM) * 1.4;
    const result = shouldMatch
      ? matchOfferSheet(next, sheet.id, sheet.rightsTeamId)
      : declineOfferSheet(next, sheet.id, sheet.rightsTeamId);
    if (result.ok) next = result.state;
  }
  return next;
}

export function userRfaSheetsBlocking(state: GmLeagueState): GmFaOfferSheet[] {
  const market = state.faMarket;
  if (!market) return [];
  return (market.offerSheets ?? []).filter(
    (row) => row.status === "pending_match" && row.rightsTeamId === state.userTeamId
  );
}
