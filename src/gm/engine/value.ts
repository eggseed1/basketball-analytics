/**
 * Trade value. Players are stars out of 5. Picks use the same scale,
 * from where the original team projects to land in the draft.
 */

import type { GmDraftPick, GmLeagueState, GmPlayer, GmTeam } from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";
import { clamp } from "@/gm/engine/rng";

/** The live overalls sit in the 70s and low 80s. Five stars is that top, not a 92. */
function starsFromOverall(overall: number): number {
  if (overall >= 82) return 5;
  if (overall >= 79) return 4.5;
  if (overall >= 76) return 4;
  if (overall >= 73) return 3.5;
  if (overall >= 70) return 3;
  if (overall >= 67) return 2.5;
  if (overall >= 63) return 2;
  if (overall >= 59) return 1.5;
  if (overall >= 55) return 1;
  return 0.5;
}

export function playerStars(player: GmPlayer): number {
  const overall = overallOf(player);
  let stars = starsFromOverall(overall);
  if (player.age <= 23 && overall >= 68) stars += 0.4;
  else if (player.age <= 25 && overall >= 74) stars += 0.2;
  else if (player.age >= 34) stars -= 0.4;
  else if (player.age >= 32) stars -= 0.2;

  const line =
    player.seasonLine && player.seasonLine.gp >= 15 ? player.seasonLine : player.nbaSeason;
  if (line && line.gp >= 15) {
    const ppg = line.pts / line.gp;
    if (ppg >= 26) stars += 0.5;
    else if (ppg >= 22) stars += 0.3;
    else if (ppg < 10 && overall >= 80) stars -= 0.5;
  }

  const snapped = Math.round(stars * 2) / 2;
  return clamp(snapped, 0.5, 5);
}

/** Win rate used to place a team's pick. Early on, the roster stands in for the record. */
export function teamOutlook(league: GmLeagueState, teamId: string): number {
  const row = league.standings[teamId];
  const games = (row?.wins ?? 0) + (row?.losses ?? 0);
  const winPct = games > 0 ? (row?.wins ?? 0) / games : null;
  const core = league.players
    .filter((player) => player.teamId === teamId)
    .sort((a, b) => overallOf(b) - overallOf(a))
    .slice(0, 8);
  const average = core.length
    ? core.reduce((sum, player) => sum + overallOf(player), 0) / core.length
    : 76;
  const talent = clamp(0.5 + (average - 76) * 0.025, 0.18, 0.82);
  if (winPct == null || games < 8) return talent;
  const trust = Math.min(1, games / 28);
  return winPct * trust + talent * (1 - trust);
}

/** 1 is the first pick. Second-round picks are 31 through 60. */
export function projectedSlot(league: GmLeagueState, pick: GmDraftPick): number {
  const teams = league.teams.filter((team) => team.id !== "as-stars" && !team.id.startsWith("as-"));
  const ranked = [...teams].sort(
    (a, b) => teamOutlook(league, b.id) - teamOutlook(league, a.id) || a.id.localeCompare(b.id)
  );
  const index = Math.max(0, ranked.findIndex((team) => team.id === pick.originalTeamId));
  const field = Math.max(ranked.length, 1);
  let slot = field - index;
  if (pick.round === 2) slot += 30;
  const yearsOut = Math.max(0, pick.season - league.season);
  const mean = pick.round === 1 ? (field + 1) / 2 : 30 + (field + 1) / 2;
  const keep = Math.max(0.22, 1 - yearsOut * 0.26);
  slot = slot * keep + mean * (1 - keep);
  const protection = pick.protectionTopN ?? 0;
  if (pick.round === 1 && protection > 0 && slot <= protection) {
    slot = protection + 7;
  }
  const cap = pick.round === 1 ? 30 : 60;
  const floor = pick.round === 1 ? 1 : 31;
  return clamp(Math.round(slot), floor, cap);
}

export function pickStars(league: GmLeagueState, pick: GmDraftPick): number {
  const slot = projectedSlot(league, pick);
  if (slot <= 2) return 4.5;
  if (slot <= 5) return 4;
  if (slot <= 9) return 3.5;
  if (slot <= 14) return 3;
  if (slot <= 20) return 2.5;
  if (slot <= 30) return 2;
  if (slot <= 40) return 1.5;
  if (slot <= 50) return 1;
  return 0.5;
}

export function starsToPoints(stars: number): number {
  return Math.round(stars * 10);
}

export type TradeStance = "buy" | "sell" | "stay";

/** Buyers are in the race. Sellers are out of it. The rest stay put. */
export function tradeStance(league: GmLeagueState, teamId: string): TradeStance {
  const goal = league.teams.find((team) => team.id === teamId)?.ownerGoal ?? "retool";
  const outlook = teamOutlook(league, teamId);
  if (outlook >= 0.56 || (goal === "contend" && outlook >= 0.48)) {
    if (goal === "tank" && outlook < 0.62) return "sell";
    return "buy";
  }
  if (outlook <= 0.4 || (goal === "tank" && outlook <= 0.5)) {
    if (goal === "contend" && outlook > 0.34) return "stay";
    return "sell";
  }
  return "stay";
}

export function stanceLabel(stance: TradeStance): string {
  if (stance === "buy") return "buying";
  if (stance === "sell") return "selling";
  return "staying put";
}

export function stanceNote(city: string, stance: TradeStance): string {
  if (stance === "buy") {
    return `${city} is buying. A player who can help this season is worth more on their board, and a pick is worth less.`;
  }
  if (stance === "sell") {
    return `${city} is selling. Picks and young players are worth more to them, and a veteran is easier to pry loose.`;
  }
  return `${city} is staying put. The two sides have to land close on their board.`;
}

/**
 * How much this club cares about the asset, relative to the league price.
 * Buyers pay up for a player who helps now and treat picks as spendable.
 * Sellers pay up for picks and youth and will move a veteran for less.
 */
export function stanceMultiplier(
  league: GmLeagueState,
  teamId: string,
  asset: { type: string; cashM?: number },
  player?: GmPlayer | null,
  pick?: GmDraftPick | null
): number {
  const stance = tradeStance(league, teamId);
  if (asset.type === "cash") {
    if (stance === "sell") return 1.2;
    if (stance === "buy") return 0.75;
    return 1;
  }
  if (asset.type === "pick") {
    const years = Math.max(0, (pick?.season ?? league.season) - league.season);
    if (stance === "buy") return Math.max(0.55, 0.72 - years * 0.06);
    if (stance === "sell") return 1.32 + years * 0.06;
    return 1;
  }
  if (!player || stance === "stay") return 1;
  const overall = overallOf(player);
  const young = player.age <= 23;
  const prime = player.age >= 24 && player.age <= 31 && overall >= 76;
  const vet = player.age >= 32 || (player.age >= 29 && overall >= 78);
  if (stance === "buy") {
    if (prime) return 1.25;
    if (young) return 0.82;
    if (player.age >= 32) return 0.9;
    return 1;
  }
  if (young) return 1.28;
  if (vet) return 0.72;
  return 0.92;
}

/** Positive means the deal is under the salary his overall would usually draw. */
export function contractSurplusM(player: GmPlayer): number | null {
  const salary = player.contract?.annualSalaryM;
  if (salary == null) return null;
  const expected = Math.max(2, (overallOf(player) - 70) * 2.4 + 10);
  return Math.round((expected - salary) * 10) / 10;
}

export function playerTradePoints(player: GmPlayer): number {
  return starsToPoints(playerStars(player));
}

export function pickTradePoints(league: GmLeagueState, pick: GmDraftPick): number {
  return starsToPoints(pickStars(league, pick));
}

export function formatStars(stars: number): string {
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

export function teamById(teams: GmTeam[], id: string): GmTeam | undefined {
  return teams.find((team) => team.id === id);
}
