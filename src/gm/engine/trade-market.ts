/**
 * Living trade market. Rumors are deterministic front-office signals based on
 * existing rosters, contracts, morale and team needs. Interest is never
 * misrepresented as a submitted/accepted offer.
 *
 * Refreshes on a calendar cadence; the stored pulse makes save/reload stable.
 */
import type {
  GmLeagueState,
  GmPlayer,
  GmTradeMarket,
  GmTradeMarketRumor,
} from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";
import { needRank, rosterProfile, shopWindow } from "@/gm/engine/roster-fit";
import { tradeStance } from "@/gm/engine/value";
import { tradeDeadlineDay } from "@/gm/engine/schedule";

export function tradeWindowDeadline(league: GmLeagueState): number {
  return league.schedule?.length
    ? Math.max(100, tradeDeadlineDay(league.schedule))
    : 110;
}

export function tradeDaysRemaining(league: GmLeagueState): number {
  return Math.max(0, tradeWindowDeadline(league) - league.day);
}

/** A player request is exceptional and requires genuine dissatisfaction. */
export function wantsTrade(player: GmPlayer): boolean {
  if (!player.contract || !player.teamId) return false;
  const activeGames = player.seasonLine?.gp ?? 0;
  if (activeGames < 20) return false;
  const unmetPromise = player.rolePromise?.status === "unmet";
  return player.morale <= 18 || (unmetPromise && player.morale <= 35);
}

function possibleBuyers(
  league: GmLeagueState,
  player: GmPlayer
): string[] {
  const positions = [player.position, player.secondaryPosition].filter(
    (position): position is NonNullable<typeof position> => Boolean(position)
  );
  const ovr = overallOf(player);
  return league.teams
    .filter(team => team.id !== player.teamId && team.id !== league.userTeamId &&
      !team.id.startsWith("as-"))
    .map(team => {
      const stance = tradeStance(league, team.id);
      const profile = rosterProfile(league, team.id);
      const rank = Math.min(...positions.map(position => needRank(profile, position)));
      const best = Math.max(0, ...positions.map(position =>
        profile.depth.find(row => row.position === position)?.best ?? 0));
      const upgrade = ovr - best;
      const expiring = (player.contract?.yearsRemaining ?? 3) <= 1;
      const budget = stance === "buy" ? 12 : stance === "stay" ? 2 : -24;
      // Sellers will rarely bid for expensive veterans. Other clubs only
      // count as interested if the target plausibly upgrades their rotation.
      const young = player.age <= 25 && stance !== "buy" ? 7 : 0;
      const veteranPenalty = stance === "sell" && player.age > 27 ? 14 : 0;
      const fit = (3 - rank) * 11 + Math.max(-10, Math.min(14, upgrade)) * 1.5 +
        budget + young - veteranPenalty + (expiring && stance === "buy" ? 3 : 0);
      return { id: team.id, rank, fit, upgrade };
    })
    .filter(row => row.rank <= 2 && row.upgrade >= -2 && row.fit >= 14)
    .sort((a, b) => b.fit - a.fit || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map(row => row.id);
}

/**
 * A compact published board (max 7); high-profile requests and confirmed
 * trade blocks outrank speculative names.
 */
export function buildTradeMarket(league: GmLeagueState): GmTradeMarket {
  const remaining = tradeDaysRemaining(league);
  const eligible = league.phase === "regular" && !league.tradeDeadlinePassed;
  if (!eligible) return {
    season: league.season, lastPulseDay: league.day,
    lastCpuDealWindow: league.tradeMarket?.lastCpuDealWindow, rumors: [],
  };
  const rumors: Array<GmTradeMarketRumor & { priority: number }> = [];
  for (const team of league.teams) {
    if (team.id.startsWith("as-")) continue;
    const listed = new Set(team.tradeBlock ?? []);
    const requested = league.players.filter(player =>
      player.teamId === team.id && wantsTrade(player));
    const eligiblePool = [
      ...requested,
      ...league.players.filter(player => player.teamId === team.id &&
        listed.has(player.id) && player.contract),
      ...(team.id !== league.userTeamId && tradeStance(league, team.id) === "sell"
        ? shopWindow(league, team.id).slice(0, 3)
        : []),
    ];
    const seen = new Set<string>();
    for (const player of eligiblePool) {
      if (!player.contract || seen.has(player.id)) continue;
      seen.add(player.id);
      const request = wantsTrade(player);
      const signal: GmTradeMarketRumor["signal"] = request
        ? "request" : listed.has(player.id) ? "listed" : "monitoring";
      const interestedTeamIds = possibleBuyers(league, player);
      const level = remaining <= 12 ? "deadline" :
        interestedTeamIds.length >= 2 || request ? "active" : "quiet";
      const priority = (request ? 90 : signal === "listed" ? 65 : 30) +
        (team.id === league.userTeamId ? 50 : 0) +
        interestedTeamIds.length * 8 + Math.max(0, overallOf(player) - 75) * 1.8 +
        ((player.contract.yearsRemaining ?? 3) <= 1 ? 8 : 0);
      // Quiet CPU rumors must have actual team interest; a player merely
      // being on a rebuild roster is not itself a compelling market story.
      if (signal === "monitoring" && !interestedTeamIds.length) continue;
      rumors.push({
        playerId: player.id, teamId: team.id, signal, interestedTeamIds,
        urgency: level, priority,
      });
    }
  }
  rumors.sort((a, b) => b.priority - a.priority ||
    a.playerId.localeCompare(b.playerId));
  return {
    season: league.season,
    lastPulseDay: league.day,
    lastCpuDealWindow: league.tradeMarket?.lastCpuDealWindow,
    rumors: rumors.slice(0, 7).map(row => ({
      playerId: row.playerId, teamId: row.teamId, signal: row.signal,
      interestedTeamIds: row.interestedTeamIds, urgency: row.urgency,
    })),
  };
}

/** Stable derived market for a first-day save; reuse during finder searches. */
const displayedMarkets = new WeakMap<GmLeagueState, GmTradeMarket>();
export function marketForDisplay(league: GmLeagueState): GmTradeMarket {
  if (league.tradeMarket?.season === league.season &&
      league.tradeMarket.lastPulseDay <= league.day &&
      league.day - league.tradeMarket.lastPulseDay <= 18) {
    return league.tradeMarket;
  }
  const cached = displayedMarkets.get(league);
  if (cached) return cached;
  const built = buildTradeMarket(league);
  displayedMarkets.set(league, built);
  return built;
}

/** A real rival interest premium, never a fabricated competing contract. */
export function tradeCompetitionMultiplier(
  league: GmLeagueState,
  playerId: string,
  sellerTeamId: string
): number {
  const snapshot = marketForDisplay(league);
  if (snapshot.season !== league.season) return 1;
  const rumor = snapshot.rumors.find(row =>
    row.playerId === playerId && row.teamId === sellerTeamId);
  if (!rumor) return 1;
  return 1 + Math.min(0.12, Math.max(0, rumor.interestedTeamIds.length - 1) * 0.055);
}
