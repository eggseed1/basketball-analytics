/**
 * Transparent free-agency utility. Component scales are normalized ~0–100
 * so money does not drown out role or continuity. Noise is seeded once per
 * (league seed, player, team) and does not reroll on reload.
 */

import type {
  GmFaUtilityBreakdown,
  GmLeagueState,
  GmPlayer,
  GmTeam,
} from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";
import { rosterNeeds } from "@/gm/engine/draft-room";
import { teamOutlook } from "@/gm/engine/value";
import { createRng, clamp } from "@/gm/engine/rng";
import { askingSalary, askingYears } from "@/gm/engine/free-agency-ask";

export type FaPersonality = "opportunity" | "security" | "contention" | "continuity";

export function faPersonality(player: GmPlayer): FaPersonality {
  const ovr = overallOf(player);
  if (player.age <= 23 && ovr < 82) return "opportunity";
  if (player.age >= 32 || ovr >= 86) return "security";
  if (ovr >= 80 && player.age >= 26 && player.age <= 31) return "contention";
  return "continuity";
}

function weightsFor(personality: FaPersonality): {
  money: number;
  winning: number;
  role: number;
  continuity: number;
  fit: number;
} {
  switch (personality) {
    case "opportunity":
      return { money: 0.22, winning: 0.12, role: 0.38, continuity: 0.08, fit: 0.2 };
    case "security":
      return { money: 0.42, winning: 0.18, role: 0.12, continuity: 0.18, fit: 0.1 };
    case "contention":
      return { money: 0.28, winning: 0.34, role: 0.16, continuity: 0.1, fit: 0.12 };
    case "continuity":
      return { money: 0.3, winning: 0.18, role: 0.14, continuity: 0.28, fit: 0.1 };
  }
}

function seededNoise(seed: number, playerId: string, teamId: string): number {
  const rng = createRng(
    seed ^
      Array.from(`${playerId}:${teamId}`).reduce(
        (sum, ch) => sum + ch.charCodeAt(0) * 17,
        0
      )
  );
  return (rng() - 0.5) * 10;
}

function financialUtility(
  player: GmPlayer,
  salaryM: number,
  years: number,
  league: GmLeagueState
): number {
  const ask = askingSalary(player, league);
  const askY = askingYears(player, league);
  const firstYear = clamp((salaryM / Math.max(0.5, ask)) * 55, 0, 100);
  const term = clamp((years / Math.max(1, askY)) * 35, 0, 55);
  const guarantee = clamp(years * 8, 0, 40);
  // Longer deals are not automatically better than a strong short deal.
  const stretchPenalty = years > askY + 1 ? (years - askY) * 4 : 0;
  return clamp(firstYear * 0.55 + term * 0.25 + guarantee * 0.2 - stretchPenalty, 0, 100);
}

function winningUtility(league: GmLeagueState, teamId: string): number {
  const outlook = teamOutlook(league, teamId);
  return clamp(outlook * 100, 0, 100);
}

function roleUtility(team: GmTeam, player: GmPlayer, players: GmPlayer[]): number {
  const needs = rosterNeeds(team, players);
  const roster = players
    .filter((row) => row.teamId === team.id)
    .sort((a, b) => overallOf(b) - overallOf(a));
  const samePos = roster.filter((row) => row.position === player.position);
  const ahead = samePos.filter((row) => overallOf(row) >= overallOf(player) - 1).length;
  let score = 40;
  if (player.position === needs[0]) score += 28;
  else if (player.position === needs[1]) score += 14;
  if (ahead === 0) score += 22;
  else if (ahead === 1) score += 8;
  else score -= ahead * 10;
  return clamp(score, 0, 100);
}

function continuityUtility(player: GmPlayer, teamId: string): number {
  if (player.rightsTeamId === teamId) {
    const ovr = overallOf(player);
    const promise = player.rolePromise?.teamId === teamId ? player.rolePromise.status : undefined;
    return clamp((ovr >= 80 ? 78 : 62) + (promise === "met" ? 8 : promise === "unmet" ? -18 : 0), 0, 100);
  }
  return 28;
}

function fitUtility(team: GmTeam, player: GmPlayer, players: GmPlayer[]): number {
  const needs = rosterNeeds(team, players);
  let score = 35;
  if (player.position === needs[0]) score += 25;
  if (team.ownerGoal === "contend" && overallOf(player) >= 82) score += 18;
  if (team.ownerGoal === "tank" && player.age <= 23) score += 16;
  if (team.ownerGoal === "retool" && overallOf(player) >= 76 && player.age <= 28) score += 12;
  return clamp(score, 0, 100);
}

export function evaluateOfferUtility(
  league: GmLeagueState,
  player: GmPlayer,
  team: GmTeam,
  salaryM: number,
  years: number
): GmFaUtilityBreakdown {
  const personality = faPersonality(player);
  const w = weightsFor(personality);
  const seed = league.faMarket?.seed ?? league.season * 7919;
  const money = financialUtility(player, salaryM, years, league);
  const winning = winningUtility(league, team.id);
  const role = roleUtility(team, player, league.players);
  const continuity = continuityUtility(player, team.id);
  const fit = fitUtility(team, player, league.players);
  const noise = seededNoise(seed, player.id, team.id);
  const total =
    money * w.money +
    winning * w.winning +
    role * w.role +
    continuity * w.continuity +
    fit * w.fit +
    noise;
  return {
    total: Math.round(total * 10) / 10,
    money: Math.round(money * 10) / 10,
    winning: Math.round(winning * 10) / 10,
    role: Math.round(role * 10) / 10,
    continuity: Math.round(continuity * 10) / 10,
    fit: Math.round(fit * 10) / 10,
    noise: Math.round(noise * 10) / 10,
  };
}

/** Plain-English agent note from the stored breakdown vs the runner-up. */
export function agentFeedback(
  player: GmPlayer,
  winner: GmFaUtilityBreakdown,
  rival: GmFaUtilityBreakdown | null,
  salaryM: number,
  ask: number
): string {
  const personality = faPersonality(player);
  if (salaryM + 0.05 < ask * 0.85) {
    return "The salary remains below his asking range.";
  }
  if (rival && winner.total + 1.5 < rival.total) {
    if (rival.role - winner.role >= 8) {
      return "Your offer is competitive. He prefers the larger role elsewhere.";
    }
    if (rival.winning - winner.winning >= 8) {
      return "He likes the money, but the other club looks closer to contention.";
    }
    return "He is leaning toward another offer on the board.";
  }
  if (personality === "opportunity" && winner.role >= 70) {
    return "The role reads as real playing time. That matters to him.";
  }
  if (personality === "security" && winner.money >= 70) {
    return "The security on this deal matches what he wanted.";
  }
  if (player.rightsTeamId && winner.continuity >= 60) {
    return "Staying put still carries weight if the number is close.";
  }
  return "He wants one more day to see how the market develops.";
}

