/**
 * The salary ceiling and agent interest shown to users come from the same
 * contract legality and FA utility rules used by the simulation. The forecast
 * is an estimate, not a guaranteed/secret player decision roll.
 */
import type { GmFaOffer, GmLeagueState, GmPlayer } from "@/gm/types";
import { evaluateSigning, exceptionAmounts, maxSalaryForAge } from "@/gm/engine/cap";
import { askingSalary, askingYears } from "@/gm/engine/free-agency-ask";
import { evaluateOfferUtility, agentFeedback } from "@/gm/engine/fa-utility";
import { overallOf } from "@/gm/engine/lineup";

const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

export function maxFreeAgentYears(league: GmLeagueState, player: GmPlayer): number {
  const ownBird = player.rightsTeamId === league.userTeamId &&
    (player.rightsKind === "bird" || player.rightsKind === "restricted");
  return ownBird ? 5 : 4;
}

/** Finds the highest actually legal *annual first-year salary*, including
 * cap room, Bird rights and available exceptions, net of reserved offers.
 */
export function legalFreeAgentSalaryRange(league: GmLeagueState, player: GmPlayer, years: number): {
  minM: number; maxM: number; reason: string | null; via: string | null;
} {
  const minM = exceptionAmounts(league.settings).minimumM;
  const possibleMax = maxSalaryForAge(player.age, league.settings);
  if (!Number.isInteger(years) || years < 1 || years > maxFreeAgentYears(league, player) ||
      (player.rightsKind === "restricted" && player.rightsTeamId !== league.userTeamId && years < 2)) {
    return { minM, maxM: 0, reason: "That contract length is not available under your signing rights.", via: null };
  }
  const minimum = evaluateSigning(league, league.userTeamId, player, minM, years);
  if (!minimum.ok) return { minM, maxM: 0, reason: minimum.reason, via: null };
  if (evaluateSigning(league, league.userTeamId, player, possibleMax, years).ok) {
    const legal = evaluateSigning(league, league.userTeamId, player, possibleMax, years);
    return { minM, maxM: possibleMax, reason: null, via: legal.ok ? legal.via : null };
  }
  let lo = minM, hi = possibleMax;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (evaluateSigning(league, league.userTeamId, player, mid, years).ok) lo = mid;
    else hi = mid;
  }
  // Fallback under the rounded exception amount, never imply an illegal max.
  let maxM = Math.max(minM, Math.floor((lo + 0.000001) * 100) / 100);
  for (let i = 0; i < 8 && !evaluateSigning(league, league.userTeamId, player, maxM, years).ok; i++) {
    maxM = round(maxM - 0.01);
  }
  const legal = evaluateSigning(league, league.userTeamId, player, maxM, years);
  return { minM, maxM: legal.ok ? maxM : 0, reason: legal.ok ? null : legal.reason, via: legal.ok ? legal.via : null };
}

export function competingFreeAgentOffers(league: GmLeagueState, player: GmPlayer): GmFaOffer[] {
  const market = league.faMarket;
  const all = [...(market?.pending ?? []), ...(market?.agreements ?? [])]
    .filter(o => o.playerId === player.id && o.teamId !== league.userTeamId &&
      !["withdrawn", "expired", "invalidated", "rejected"].includes(o.kind));
  const current = new Map<string, GmFaOffer>();
  for (const offer of all) {
    const prior = current.get(offer.teamId);
    if (!prior || offer.day > prior.day ||
       (offer.day === prior.day && offer.kind === "agreement")) current.set(offer.teamId, offer);
  }
  return [...current.values()].sort((a, b) => b.salaryM - a.salaryM || a.teamId.localeCompare(b.teamId));
}

export function projectFreeAgentResponse(
  league: GmLeagueState, player: GmPlayer, salaryM: number, years: number
): { chance: number; level: "unlikely" | "possible" | "strong"; note: string;
  legal: boolean; reason: string | null; score: number; rivalScore: number | null } {
  const verdict = evaluateSigning(league, league.userTeamId, player, salaryM, years);
  const stage = league.faMarket?.stage;
  const marketOpen = league.phase === "free_agency" && !!league.faMarket && !league.faMarket.done &&
    ["re_signing", "moratorium", "open", "fill"].includes(stage ?? "");
  const available = player.teamId == null &&
    (stage !== "re_signing" || player.rightsTeamId === league.userTeamId) &&
    !(league.faMarket?.agreements ?? []).some(o => o.playerId === player.id);
  // NBA offer sheets are an exception to the usual moratorium signing
  // restrictions. They may be filed in moratorium, open, and fill stages.
  const outsideRestricted = player.rightsKind === "restricted" &&
    player.rightsTeamId !== league.userTeamId;
  const sheetWindowClosed = outsideRestricted &&
    !["moratorium", "open", "fill"].includes(stage ?? "");
  const sheetNotTendered = outsideRestricted &&
    (!player.rightsTeamId || player.qoStatus !== "tendered");
  const sheetPendingMatch = outsideRestricted && (league.faMarket?.offerSheets ?? [])
    .some(sheet => sheet.playerId === player.id && sheet.status === "pending_match");
  if (!verdict.ok || !marketOpen || !available || sheetWindowClosed ||
      sheetNotTendered || sheetPendingMatch) {
    const reason = !marketOpen ? "Negotiations are not open in this market stage." :
      !available ? "This player is unavailable or already committed." :
      sheetWindowClosed ? "Restricted offer sheets open during the moratorium." :
      sheetNotTendered ? "He needs a tendered qualifying offer before an outside offer sheet." :
      sheetPendingMatch ? "An offer sheet is already awaiting a match decision." :
      verdict.ok ? null : verdict.reason;
    return { chance: 0, level: "unlikely", note: reason ?? "Cannot offer now.",
      legal: false, reason, score: 0, rivalScore: null };
  }
  const team = league.teams.find(t => t.id === league.userTeamId)!;
  const offered = evaluateOfferUtility(league, player, team, salaryM, years);
  const rivals = competingFreeAgentOffers(league, player)
    .map(o => {
      const club = league.teams.find(t => t.id === o.teamId);
      return club ? evaluateOfferUtility(league, player, club, o.salaryM, o.years) : null;
    }).filter((o): o is NonNullable<typeof o> => !!o)
    .sort((a, b) => b.total - a.total);
  const rival = rivals[0] ?? null;
  const ask = askingSalary(player, league);
  const askYears = askingYears(player, league);
  const salaryRatio = salaryM / Math.max(0.5, ask);
  const ovr = overallOf(player);
  const floor = ovr >= 86 ? .80 : ovr >= 83 ? .67 : ovr >= 80 ? .54 : ovr >= 78 ? .42 : 0;
  // Mirrors the NBA-style agent reservation and competitor comparisons.
  // Actual offers still go through userOfferFreeAgent / resolvePlayers.
  let chance = clamp(46 + (salaryRatio - 1) * 95 + (offered.total - 46) * .55 +
    (rival ? (offered.total - rival.total) * 1.1 : 9) +
    (years - askYears) * 2, 4, 96);
  if (salaryRatio + 0.001 < floor) chance = Math.min(chance, 8);
  if (player.rightsKind === "restricted" && player.rightsTeamId !== league.userTeamId) {
    // His original team may still match an otherwise accepted offer sheet.
    chance = Math.min(chance, 80);
  }
  chance = Math.round(chance);
  return {
    chance, level: chance >= 66 ? "strong" : chance >= 34 ? "possible" : "unlikely",
    note: agentFeedback(player, offered, rival, salaryM, ask),
    legal: true, reason: null, score: offered.total, rivalScore: rival?.total ?? null,
  };
}
