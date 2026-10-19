/**
 * Roster strengths and holes used to shape CPU trades.
 * A deal has to improve fit for both clubs, not just clear salary math.
 */

import type { GmLeagueState, GmPlayer, GmPosition, GmTeam } from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";
import { tradeStance, type TradeStance } from "@/gm/engine/value";

const POSITIONS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];

export type PosDepth = {
  position: GmPosition;
  count: number;
  best: number;
  second: number;
  /** Higher = stronger / deeper. */
  strength: number;
};

export type RosterProfile = {
  teamId: string;
  stance: TradeStance;
  depth: PosDepth[];
  /** Weakest positions first. */
  needs: GmPosition[];
  /** Deepest / strongest positions first. */
  surplus: GmPosition[];
};

function rosterOf(teamId: string, players: GmPlayer[]): GmPlayer[] {
  return players.filter((player) => player.teamId === teamId);
}

function depthAt(roster: GmPlayer[], position: GmPosition): PosDepth {
  const at = roster
    .filter((player) => player.position === position)
    .map((player) => overallOf(player))
    .sort((a, b) => b - a);
  const best = at[0] ?? 0;
  const second = at[1] ?? 0;
  const count = at.length;
  // Empty or soft starters are real holes. Raw depth cannot hide a 68.
  if (count === 0) {
    return { position, count, best, second, strength: -30 };
  }
  const soft = Math.max(0, 75 - best) * 4;
  const strength =
    best * 1.15 + second * 0.35 + Math.min(count, 4) * 1.5 - soft;
  return { position, count, best, second, strength };
}

export function rosterProfile(
  league: GmLeagueState,
  teamId: string
): RosterProfile {
  const roster = rosterOf(teamId, league.players);
  const depth = POSITIONS.map((position) => depthAt(roster, position));
  const needs = [...depth]
    .sort((a, b) => a.strength - b.strength || a.best - b.best)
    .map((row) => row.position);
  const surplus = [...depth]
    .sort((a, b) => b.strength - a.strength || b.second - a.second)
    .map((row) => row.position);
  return {
    teamId,
    stance: tradeStance(league, teamId),
    depth,
    needs,
    surplus,
  };
}

export function needRank(profile: RosterProfile, position: GmPosition): number {
  const index = profile.needs.indexOf(position);
  return index < 0 ? 4 : index;
}

export function surplusRank(
  profile: RosterProfile,
  position: GmPosition
): number {
  const index = profile.surplus.indexOf(position);
  return index < 0 ? 4 : index;
}

/** How badly this club wants this player on the current roster. */
export function wantScore(
  profile: RosterProfile,
  player: GmPlayer
): number {
  const hole = needRank(profile, player.position);
  const ovr = overallOf(player);
  const at = profile.depth.find((row) => row.position === player.position);
  const upgrade = at ? ovr - at.best : ovr;
  let score = (4 - hole) * 14 + Math.max(0, upgrade) * 2.4;

  if (profile.stance === "buy") {
    if (player.age <= 32 && ovr >= 78) score += 10;
    if (hole <= 1 && ovr >= (at?.best ?? 0) - 1) score += 16;
    if (player.age >= 34) score -= 8;
  } else if (profile.stance === "sell") {
    if (player.age <= 24) score += 18;
    if (ovr >= 80 && player.age <= 26) score += 8;
    if (player.age >= 30) score -= 12;
  } else {
    if (hole <= 1) score += 8;
    if (player.age <= 23) score += 4;
  }
  return score;
}

/** Cost of giving this player up (higher = hurts more). */
export function keepCost(
  profile: RosterProfile,
  player: GmPlayer
): number {
  const hole = needRank(profile, player.position);
  const deep = surplusRank(profile, player.position);
  const ovr = overallOf(player);
  const at = profile.depth.find((row) => row.position === player.position);
  const isBest = at != null && ovr + 0.05 >= at.best;
  let cost = ovr * 0.9;
  if (isBest && hole <= 2) cost += 22;
  if (deep <= 1 && (at?.count ?? 0) >= 3 && !isBest) cost -= 14;
  if (deep <= 1 && (at?.second ?? 0) >= 74) cost -= 6;
  if (profile.stance === "sell") {
    if (player.age >= 29 || ovr < 76) cost -= 10;
    if (player.age >= 27) cost -= 8;
    if ((player.contract?.yearsRemaining ?? 99) <= 1) cost -= 12;
  }
  if (profile.stance === "buy" && player.age <= 23) cost += 8;
  return cost;
}

/**
 * Net roster fit for one club: what they get minus what they give.
 * Positive means the deal helps their board.
 */
export function fitDelta(
  league: GmLeagueState,
  teamId: string,
  incoming: GmPlayer[],
  outgoing: GmPlayer[]
): number {
  const profile = rosterProfile(league, teamId);
  const gain = incoming.reduce((sum, player) => sum + wantScore(profile, player), 0);
  const loss = outgoing.reduce((sum, player) => sum + keepCost(profile, player), 0);
  return gain - loss;
}

/** True when both clubs meaningfully improve fit (or a seller dumps for youth/picks). */
export function dealImprovesFit(
  league: GmLeagueState,
  fromTeamId: string,
  toTeamId: string,
  fromPlayers: GmPlayer[],
  toPlayers: GmPlayer[]
): boolean {
  // fromTeam sends fromPlayers, receives toPlayers
  const fromDelta = fitDelta(league, fromTeamId, toPlayers, fromPlayers);
  const toDelta = fitDelta(league, toTeamId, fromPlayers, toPlayers);
  const fromStance = tradeStance(league, fromTeamId);
  const toStance = tradeStance(league, toTeamId);

  // Pure lateral swap: similar overall, same role, nobody fills a hole.
  if (fromPlayers.length === 1 && toPlayers.length === 1) {
    const a = fromPlayers[0]!;
    const b = toPlayers[0]!;
    const samePos = a.position === b.position;
    const close =
      Math.abs(overallOf(a) - overallOf(b)) <= 2 &&
      Math.abs(a.age - b.age) <= 3;
    if (samePos && close) return false;
  }

  // Buyers must actually gain fit. Sellers can accept a small fit hit for futures
  // (picks handled by the caller via a pick bonus).
  const fromOk =
    fromStance === "sell"
      ? fromDelta >= -12
      : fromDelta >= 6;
  const toOk =
    toStance === "sell"
      ? toDelta >= -12
      : toDelta >= 6;
  return fromOk && toOk;
}

/** Players a club is willing to move, surplus-first. */
export function movablePlayers(
  league: GmLeagueState,
  teamId: string,
  opts?: { max?: number; minOverall?: number; maxOverall?: number }
): GmPlayer[] {
  const team = league.teams.find((row) => row.id === teamId);
  if (!team) return [];
  const blocked = new Set(team.untouchables ?? []);
  const profile = rosterProfile(league, teamId);
  const min = opts?.minOverall ?? 0;
  const max = opts?.maxOverall ?? 99;
  return rosterOf(teamId, league.players)
    .filter(
      (player) =>
        player.contract &&
        !blocked.has(player.id) &&
        overallOf(player) >= min &&
        overallOf(player) <= max
    )
    .sort((a, b) => keepCost(profile, a) - keepCost(profile, b))
    .slice(0, opts?.max ?? 10);
}

/** Players other clubs would target from this roster (sellers: vets; buyers: stars). */
export function shopWindow(
  league: GmLeagueState,
  teamId: string
): GmPlayer[] {
  const profile = rosterProfile(league, teamId);
  const team = league.teams.find((row) => row.id === teamId);
  if (!team) return [];
  const blocked = new Set(team.untouchables ?? []);
  const roster = rosterOf(teamId, league.players).filter(
    (player) => player.contract && !blocked.has(player.id)
  );

  if (profile.stance === "sell") {
    return roster
      .filter(
        (player) =>
          player.age >= 27 ||
          (player.contract?.yearsRemaining ?? 0) <= 1 ||
          overallOf(player) < 76
      )
      .sort((a, b) => keepCost(profile, a) - keepCost(profile, b));
  }

  // Buyers rarely shop a starter at a need. Surplus depth is fair game.
  return movablePlayers(league, teamId, { max: 8 }).filter((player) => {
    const hole = needRank(profile, player.position);
    const at = profile.depth.find((row) => row.position === player.position);
    const isBest = at != null && overallOf(player) + 0.05 >= at.best;
    if (isBest && hole <= 1) return false;
    return true;
  });
}

/** Best targets on a seller's roster for a buyer's holes. */
export function targetsForBuyer(
  league: GmLeagueState,
  buyerId: string,
  sellerId: string
): GmPlayer[] {
  const buyer = rosterProfile(league, buyerId);
  const seller = league.teams.find((row) => row.id === sellerId);
  if (!seller) return [];
  const blocked = new Set(seller.untouchables ?? []);
  const sellerStance = tradeStance(league, sellerId);
  return rosterOf(sellerId, league.players)
    .filter((player) => {
      if (!player.contract || blocked.has(player.id)) return false;
      if (sellerStance === "buy" && needRank(rosterProfile(league, sellerId), player.position) <= 1) {
        const at = rosterProfile(league, sellerId).depth.find(
          (row) => row.position === player.position
        );
        if (at && overallOf(player) + 0.05 >= at.best) return false;
      }
      if (sellerStance === "sell") {
        return (
          player.age >= 26 ||
          (player.contract.yearsRemaining ?? 99) <= 2 ||
          overallOf(player) >= 80
        );
      }
      return overallOf(player) >= 74;
    })
    .sort((a, b) => wantScore(buyer, b) - wantScore(buyer, a))
    .slice(0, 6);
}

export function positionLabel(position: GmPosition): string {
  return position;
}

export function teamNeedsBlurb(team: GmTeam, league: GmLeagueState): string {
  const profile = rosterProfile(league, team.id);
  const top = profile.needs.slice(0, 2).join("/");
  return `${team.abbr} needs ${top}`;
}
