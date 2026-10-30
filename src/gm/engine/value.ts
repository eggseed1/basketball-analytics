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

export type TradeStance = "buy" | "sell" | "stay";

/**
 * Per-league memo for outlook / pick slots. Trade search hammers these
 * thousands of times per offer; recomputing roster sorts each call freezes the UI.
 */
type LeagueValueCache = {
  outlook: Map<string, number>;
  rankedIds: string[];
  pickStars: Map<string, number>;
  stance: Map<string, TradeStance>;
};

const valueCaches = new WeakMap<GmLeagueState, LeagueValueCache>();

function playersByTeam(league: GmLeagueState): Map<string, GmPlayer[]> {
  const byTeam = new Map<string, GmPlayer[]>();
  for (const player of league.players) {
    if (!player.teamId) continue;
    const list = byTeam.get(player.teamId);
    if (list) list.push(player);
    else byTeam.set(player.teamId, [player]);
  }
  return byTeam;
}

function outlookFor(
  league: GmLeagueState,
  teamId: string,
  roster: GmPlayer[]
): number {
  const row = league.standings[teamId];
  const games = (row?.wins ?? 0) + (row?.losses ?? 0);
  const winPct = games > 0 ? (row?.wins ?? 0) / games : null;
  const core = [...roster]
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

function leagueValueCache(league: GmLeagueState): LeagueValueCache {
  const hit = valueCaches.get(league);
  if (hit) return hit;

  const byTeam = playersByTeam(league);
  const outlook = new Map<string, number>();
  const clubs = league.teams.filter(
    (team) => team.id !== "as-stars" && !team.id.startsWith("as-")
  );
  for (const team of clubs) {
    outlook.set(team.id, outlookFor(league, team.id, byTeam.get(team.id) ?? []));
  }
  const rankedIds = [...clubs]
    .sort(
      (a, b) =>
        (outlook.get(b.id) ?? 0) - (outlook.get(a.id) ?? 0) ||
        a.id.localeCompare(b.id)
    )
    .map((team) => team.id);

  const cache: LeagueValueCache = {
    outlook,
    rankedIds,
    pickStars: new Map(),
    stance: new Map(),
  };
  valueCaches.set(league, cache);
  return cache;
}

/** Win rate used to place a team's pick. Early on, the roster stands in for the record. */
export function teamOutlook(league: GmLeagueState, teamId: string): number {
  const cache = leagueValueCache(league);
  const cached = cache.outlook.get(teamId);
  if (cached != null) return cached;
  const roster = league.players.filter((player) => player.teamId === teamId);
  const value = outlookFor(league, teamId, roster);
  cache.outlook.set(teamId, value);
  return value;
}

/** 1 is the first pick. Second-round picks are 31 through 60. */
export function projectedSlot(league: GmLeagueState, pick: GmDraftPick): number {
  const ranked = leagueValueCache(league).rankedIds;
  const index = Math.max(0, ranked.indexOf(pick.originalTeamId));
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

/**
 * Trade points for a known draft slot (1–60).
 * #1 is a franchise cornerstone; value falls off hard after that, the way
 * real boards price the top of the lottery versus the rest of the first.
 */
export function draftSlotTradePoints(slot: number): number {
  const n = clamp(Math.round(slot), 1, 60);
  // Explicit top of the board — #1 is a franchise cornerstone, not "a bit
  // better than #2". Ratios track modern trade charts: ~2× #2, ~5× #10.
  if (n === 1) return 58;
  if (n === 2) return 30;
  if (n === 3) return 23;
  if (n === 4) return 19;
  if (n === 5) return 16.5;
  if (n === 6) return 14.5;
  if (n === 7) return 13;
  if (n === 8) return 12;
  if (n === 9) return 11;
  if (n === 10) return 10;
  // Mid / late first, then seconds.
  if (n <= 14) return Math.round((10 - (n - 10) * 0.65) * 10) / 10;
  if (n <= 20) return Math.round((7.4 - (n - 14) * 0.42) * 10) / 10;
  if (n <= 30) return Math.round((4.9 - (n - 20) * 0.21) * 10) / 10;
  if (n <= 45) return Math.round((2.8 - (n - 30) * 0.08) * 10) / 10;
  return Math.round((1.6 - (n - 45) * 0.04) * 10) / 10;
}

export function pickStars(league: GmLeagueState, pick: GmDraftPick): number {
  const cache = leagueValueCache(league);
  const cached = cache.pickStars.get(pick.id);
  if (cached != null) return cached;
  const slot = projectedSlot(league, pick);
  const points = draftSlotTradePoints(slot);
  // Same 0.5–5 scale as players. #1 lands at 5; #2 ~4; mid-first ~2–3; seconds ~1.
  const stars = clamp(Math.round((points / 11.6) * 2) / 2, 0.5, 5);
  cache.pickStars.set(pick.id, stars);
  return stars;
}

export function starsToPoints(stars: number): number {
  return Math.round(stars * 10);
}

/** Buyers are in the race. Sellers are out of it. The rest stay put. */
export function tradeStance(league: GmLeagueState, teamId: string): TradeStance {
  const cache = leagueValueCache(league);
  const cached = cache.stance.get(teamId);
  if (cached) return cached;
  const goal = league.teams.find((team) => team.id === teamId)?.ownerGoal ?? "retool";
  const outlook = teamOutlook(league, teamId);
  let stance: TradeStance = "stay";
  if (outlook >= 0.56 || (goal === "contend" && outlook >= 0.48)) {
    stance = goal === "tank" && outlook < 0.62 ? "sell" : "buy";
  } else if (outlook <= 0.4 || (goal === "tank" && outlook <= 0.5)) {
    stance = goal === "contend" && outlook > 0.34 ? "stay" : "sell";
  }
  cache.stance.set(teamId, stance);
  return stance;
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

export function playerTradePoints(player: GmPlayer, league?: GmLeagueState): number {
  const overall = overallOf(player);
  const talent = 1 + 0.15 * Math.pow(Math.max(0, overall - 50), 1.7);
  const age = player.age <= 23 ? 1.22 : player.age <= 27 ? 1.1 : player.age >= 35 ? 0.63 : player.age >= 32 ? 0.82 : 1;
  const potential = player.age <= 24 ? Math.max(0, (player.sheet?.potential.ceiling ?? overall) - overall) * 0.45 : 0;
  const cap = league?.settings.salaryCapM ?? 140.588;
  const salary = player.contract?.annualSalaryM;
  const expectedShare = clamp((overall - 64) * 0.009, 0.008, 0.35);
  const years = player.contract?.yearsRemaining ?? 0;
  const surplus = salary == null ? 0 : clamp((expectedShare - salary / cap) * 60 * Math.min(3, years), -28, 25);
  const control = years <= 1 ? 0.88 : 1 + Math.min(4, years - 1) * 0.025;
  const availability = player.injury ? clamp(1 - player.injury.gamesRemaining / 100, 0.65, 1) : 1;
  return Math.max(1, Math.round((talent * age * control + potential + surplus) * availability));
}

export function pickTradePoints(league: GmLeagueState, pick: GmDraftPick): number {
  // Use the slot curve directly so #1 stays expensive in package math,
  // not flattened by the 5-star display cap.
  return Math.round(draftSlotTradePoints(projectedSlot(league, pick)));
}

export function formatStars(stars: number): string {
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

export function teamById(teams: GmTeam[], id: string): GmTeam | undefined {
  return teams.find((team) => team.id === id);
}

