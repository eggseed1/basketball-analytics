/**
 * MyNBA-style free agency: moratorium pitches, competing offers, Bird re-signs,
 * then an open signing window and a fill week for leftovers.
 */

import type {
  GmFaMarket,
  GmFaOffer,
  GmFaStage,
  GmLeagueState,
  GmPlayer,
  GmSignVia,
  GmTeam,
} from "@/gm/types";
import { evaluateSigning, rosterCount } from "@/gm/engine/cap";
import { overallOf } from "@/gm/engine/lineup";
import { autoSetLineup } from "@/gm/engine/lineup";
import { rosterNeeds } from "@/gm/engine/draft-room";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { createRng, clamp, uid } from "@/gm/engine/rng";
import type { CBARules } from "@/gm/myleague/types";

const MORATORIUM_DAYS = 5;
const OPEN_DAYS = 8;
const FILL_DAYS = 5;

export function emptyFaMarket(): GmFaMarket {
  return {
    stage: "moratorium",
    day: 0,
    agreements: [],
    pending: [],
    recap: [],
  };
}

export function askingSalary(player: GmPlayer, rules: CBARules): number {
  const max = rules.maxSalaryM || Math.max(5, rules.salaryCapM * 0.35);
  const min = rules.minSalaryM || Math.max(0.5, rules.salaryCapM * 0.008);
  const like = (overallOf(player) - 76) / 2.35;
  const t = clamp((like + 1.5) / 8, 0, 1);
  return Math.round((min + (max - min) * t * t) * 100) / 100;
}

export function askingYears(player: GmPlayer, rules: CBARules): number {
  const overall = overallOf(player);
  const years = overall >= 85 ? 4 : overall >= 81 ? 3 : overall >= 76 ? 2 : 1;
  return clamp(years, 1, rules.maxContractYears || 5);
}

function news(
  league: GmLeagueState,
  headline: string,
  body: string,
  tone: GmLeagueState["news"][number]["tone"] = "info"
) {
  return {
    id: uid("news"),
    day: league.day,
    season: league.season,
    headline,
    body,
    tone,
  };
}

function fitScore(team: GmTeam, player: GmPlayer, players: GmPlayer[]): number {
  const needs = rosterNeeds(team, players);
  let score = 0;
  if (player.position === needs[0]) score += 18;
  else if (player.position === needs[1]) score += 8;
  if (team.ownerGoal === "contend" && overallOf(player) >= 82) score += 12;
  if (team.ownerGoal === "tank" && player.age <= 23) score += 10;
  if (team.ownerGoal === "retool" && overallOf(player) >= 78) score += 6;
  return score;
}

/** How much a player likes an offer relative to their ask and the club. */
export function offerAppeal(
  player: GmPlayer,
  team: GmTeam,
  salaryM: number,
  years: number,
  players: GmPlayer[],
  rules: CBARules
): number {
  const ask = askingSalary(player, rules);
  const askY = askingYears(player, rules);
  const ovr = overallOf(player);
  let score =
    (salaryM / Math.max(0.5, ask)) * 42 +
    (years / askY) * 14 +
    fitScore(team, player, players);
  if (player.rightsTeamId === team.id) {
    score += ovr >= 80 ? 22 : 14;
  }
  if (ovr >= 86 && salaryM + 0.05 < ask * 0.92) score -= 25;
  if (ovr >= 82 && years < askY) score -= 8;
  return score;
}

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
          rightsKind: undefined,
          lastSalaryM: undefined,
          contract: {
            yearsRemaining: years,
            annualSalaryM: annual,
            birdRights: "none" as const,
            signedSeason: state.season,
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

function bestLegalBid(
  state: GmLeagueState,
  team: GmTeam,
  player: GmPlayer,
  rules: CBARules,
  aggressiveness: number
): { salaryM: number; years: number; via: GmSignVia } | null {
  const ask = askingSalary(player, rules);
  const years = askingYears(player, rules);
  const own = player.rightsTeamId === team.id;
  const tries = own
    ? [ask, ask * 0.95, ask * 0.88, ask * 0.8]
    : [ask * aggressiveness, ask * 0.9, ask * 0.75, ask * 0.6, rules.minSalaryM || 1];
  for (const raw of tries) {
    const salaryM = Math.round(Math.max(rules.minSalaryM || 1, raw) * 100) / 100;
    const verdict = evaluateSigning(state, team.id, player, salaryM, years);
    if (verdict.ok) return { salaryM, years, via: verdict.via };
    const short = evaluateSigning(state, team.id, player, salaryM, Math.max(1, years - 1));
    if (short.ok) return { salaryM, years: Math.max(1, years - 1), via: short.via };
  }
  const min = Math.max(rules.minSalaryM || 1, state.settings.salaryCapM * (2.087 / 140.588));
  const floor = evaluateSigning(state, team.id, player, min, 1);
  if (floor.ok) return { salaryM: min, years: 1, via: floor.via };
  return null;
}

function teamTargets(state: GmLeagueState, team: GmTeam, rules: CBARules): GmPlayer[] {
  const size = rosterCount(team.id, state.players);
  if (size >= state.settings.maxRoster) return [];
  const needs = rosterNeeds(team, state.players);
  const pool = state.players
    .filter((player) => player.teamId == null)
    .filter((player) => !state.faMarket?.agreements.some((row) => row.playerId === player.id && row.teamId !== team.id));
  const own = pool.filter((player) => player.rightsTeamId === team.id);
  const rest = pool
    .filter((player) => player.rightsTeamId !== team.id)
    .sort((a, b) => {
      const sa =
        overallOf(a) * 2 +
        (a.position === needs[0] ? 8 : a.position === needs[1] ? 3 : 0) +
        (team.ownerGoal === "tank" && a.age <= 23 ? 4 : 0);
      const sb =
        overallOf(b) * 2 +
        (b.position === needs[0] ? 8 : b.position === needs[1] ? 3 : 0) +
        (team.ownerGoal === "tank" && b.age <= 23 ? 4 : 0);
      return sb - sa;
    });
  // Bird re-signs first. Contenders chase stars. Everyone else fills holes.
  const stars = rest.filter((player) => overallOf(player) >= 82);
  const board =
    team.ownerGoal === "contend"
      ? [...own, ...stars, ...rest]
      : [...own, ...rest];
  const slots =
    size < state.settings.minRoster
      ? 4
      : team.ownerGoal === "contend"
        ? 3
        : team.ownerGoal === "retool"
          ? 2
          : 1;
  return board.slice(0, slots);
}

function placeCpuOffers(state: GmLeagueState, rules: CBARules): GmLeagueState {
  const market = state.faMarket ?? emptyFaMarket();
  const rng = createRng(state.season * 7919 + market.day * 97 + state.draftPool.length);
  let pending = [...market.pending];
  const taken = new Set(
    [...market.agreements, ...pending]
      .filter((row) => row.kind !== "interest")
      .map((row) => `${row.teamId}:${row.playerId}`)
  );

  for (const team of state.teams) {
    if (team.id === state.userTeamId) continue;
    const aggression =
      team.ownerGoal === "contend" ? 1.05 : team.ownerGoal === "tank" ? 0.72 : 0.9;
    for (const player of teamTargets(state, team, rules)) {
      if (rng() > (overallOf(player) >= 84 ? 0.92 : overallOf(player) >= 78 ? 0.72 : 0.5))
        continue;
      const key = `${team.id}:${player.id}`;
      if (taken.has(key)) continue;
      const bid = bestLegalBid(state, team, player, rules, aggression);
      if (!bid) continue;
      pending.push({
        id: uid("fa"),
        playerId: player.id,
        teamId: team.id,
        salaryM: bid.salaryM,
        years: bid.years,
        day: market.day,
        kind: "interest",
        via: bid.via,
      });
      taken.add(key);
    }
  }

  return { ...state, faMarket: { ...market, pending } };
}

function resolvePlayers(
  state: GmLeagueState,
  rules: CBARules,
  mode: "agree" | "sign"
): { state: GmLeagueState; lines: string[] } {
  const market = state.faMarket ?? emptyFaMarket();
  const lines: string[] = [];
  let next = state;
  const byPlayer = new Map<string, GmFaOffer[]>();
  for (const offer of market.pending) {
    const list = byPlayer.get(offer.playerId) ?? [];
    list.push(offer);
    byPlayer.set(offer.playerId, list);
  }
  for (const agree of market.agreements) {
    if (mode === "sign") {
      const list = byPlayer.get(agree.playerId) ?? [];
      list.push(agree);
      byPlayer.set(agree.playerId, list);
    }
  }

  for (const [playerId, offers] of byPlayer) {
    const player = next.players.find((row) => row.id === playerId);
    if (!player || player.teamId != null) continue;
    const ranked = offers
      .map((offer) => {
        const team = next.teams.find((row) => row.id === offer.teamId);
        if (!team) return null;
        const appeal = offerAppeal(
          player,
          team,
          offer.salaryM,
          offer.years,
          next.players,
          rules
        );
        return { offer, team, appeal };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.appeal - a.appeal);
    const winner = ranked[0];
    if (!winner) continue;
    const ovr = overallOf(player);
    const ask = askingSalary(player, rules);
    // Moratorium: stars shop; mid-tier wait for a second suitor or a near-ask.
    if (mode === "agree") {
      if (ovr >= 86 && winner.offer.salaryM + 0.05 < ask * 0.95) continue;
      if (ovr >= 84 && winner.offer.salaryM + 0.05 < ask * 0.9) continue;
      if (ovr >= 80 && ranked.length < 2 && winner.offer.salaryM < ask * 0.92) continue;
      if (ovr >= 76 && ranked.length < 2 && winner.offer.salaryM < ask * 0.88) continue;
      // Own-team Bird deals still land with one pitch if near the ask.
      const birdHome =
        player.rightsTeamId === winner.team.id &&
        winner.offer.salaryM + 0.05 >= ask * 0.9;
      if (!birdHome && ovr >= 78 && ranked.length < 2) continue;
    }
    if (mode === "agree") {
      const agreements = [
        ...((next.faMarket ?? market).agreements.filter((row) => row.playerId !== playerId)),
        { ...winner.offer, kind: "agreement" as const },
      ];
      const pending = (next.faMarket ?? market).pending.filter(
        (row) => row.playerId !== playerId
      );
      next = {
        ...next,
        faMarket: { ...(next.faMarket ?? market), agreements, pending },
      };
      if (ovr >= 78) {
        lines.push(
          `${player.name} agrees with ${winner.team.abbr}: ${winner.offer.years} yrs, $${winner.offer.salaryM.toFixed(1)}M (moratorium).`
        );
      }
      continue;
    }

    const via =
      winner.offer.via ??
      evaluateSigning(next, winner.team.id, player, winner.offer.salaryM, winner.offer.years);
    if (typeof via === "object" && !via.ok) continue;
    const path = typeof via === "string" ? via : via.via;
    next = applySign(
      next,
      playerId,
      winner.team.id,
      winner.offer.salaryM,
      winner.offer.years,
      path
    );
    if (ovr >= 78 || player.rightsTeamId === winner.team.id) {
      lines.push(
        `${winner.team.city} ${winner.team.name} sign ${player.name}, ${winner.offer.years} years, $${winner.offer.salaryM.toFixed(1)}M`
      );
    }
  }

  return { state: next, lines };
}

function fillMinimums(state: GmLeagueState, rules: CBARules): { state: GmLeagueState; lines: string[] } {
  let next = state;
  const lines: string[] = [];
  const min = Math.max(rules.minSalaryM || 1, state.settings.salaryCapM * (2.087 / 140.588));
  for (const team of state.teams) {
    let guard = 0;
    const needs = rosterNeeds(team, next.players);
    while (rosterCount(team.id, next.players) < next.settings.minRoster && guard < 8) {
      guard += 1;
      const pool = next.players
        .filter((player) => player.teamId == null)
        .sort((a, b) => {
          const na = a.position === needs[0] ? 12 : a.position === needs[1] ? 5 : 0;
          const nb = b.position === needs[0] ? 12 : b.position === needs[1] ? 5 : 0;
          return overallOf(b) + nb - (overallOf(a) + na);
        });
      const choice = pool[0];
      if (!choice) break;
      const verdict = evaluateSigning(next, team.id, choice, min, 1);
      if (!verdict.ok) break;
      next = applySign(next, choice.id, team.id, min, 1, verdict.via);
      if (overallOf(choice) >= 74) {
        lines.push(`${team.abbr} takes ${choice.name} on a minimum.`);
      }
    }
  }
  return { state: next, lines };
}

function scarcityLine(state: GmLeagueState): string | null {
  const unsigned = state.players.filter((player) => player.teamId == null);
  if (unsigned.length < 8) return null;
  const byPos = new Map<string, number>();
  for (const player of unsigned) {
    byPos.set(player.position, (byPos.get(player.position) ?? 0) + 1);
  }
  const thin = [...byPos.entries()].sort((a, b) => a[1] - b[1])[0];
  if (!thin || thin[1] > Math.max(3, unsigned.length / 8)) return null;
  return `${thin[0]}s are scarce on the board (${thin[1]} left).`;
}

function stageAfter(day: number): GmFaStage | "done" {
  if (day < MORATORIUM_DAYS) return "moratorium";
  if (day < MORATORIUM_DAYS + OPEN_DAYS) return "open";
  if (day < MORATORIUM_DAYS + OPEN_DAYS + FILL_DAYS) return "fill";
  return "done";
}

/** One day on the MyNBA offseason clock. */
export function advanceFaDay(state: GmLeagueState): GmLeagueState {
  if (state.phase !== "free_agency") return state;
  const rules = getCbaRules(state.season);
  let next = placeCpuOffers(
    {
      ...state,
      faMarket: state.faMarket ?? emptyFaMarket(),
    },
    rules
  );
  const market = next.faMarket!;
  const stage = market.stage;
  const lines: string[] = [];

  if (stage === "moratorium") {
    const resolved = resolvePlayers(next, rules, "agree");
    next = resolved.state;
    lines.push(...resolved.lines);
  } else if (stage === "open") {
    // Lock moratorium agreements first, then new battles.
    for (const agree of [...(next.faMarket?.agreements ?? [])]) {
      const player = next.players.find((row) => row.id === agree.playerId);
      if (!player || player.teamId != null) continue;
      const verdict = evaluateSigning(
        next,
        agree.teamId,
        player,
        agree.salaryM,
        agree.years
      );
      if (!verdict.ok) continue;
      next = applySign(
        next,
        agree.playerId,
        agree.teamId,
        agree.salaryM,
        agree.years,
        agree.via ?? verdict.via
      );
      const team = next.teams.find((row) => row.id === agree.teamId);
      if (team && overallOf(player) >= 78) {
        lines.push(
          `${team.abbr} locks ${player.name} (${agree.years} yrs, $${agree.salaryM.toFixed(1)}M).`
        );
      }
    }
    const resolved = resolvePlayers(next, rules, "sign");
    next = resolved.state;
    lines.push(...resolved.lines);
  } else if (stage === "fill") {
    const resolved = resolvePlayers(next, rules, "sign");
    next = resolved.state;
    lines.push(...resolved.lines);
    const filled = fillMinimums(next, rules);
    next = filled.state;
    lines.push(...filled.lines);
  }

  const day = market.day + 1;
  const nextStage = stageAfter(day);
  const scarce = scarcityLine(next);
  if (scarce) lines.push(scarce);
  const recap = [...lines.slice(0, 10), ...(next.faMarket?.recap ?? [])].slice(0, 40);
  const headline =
    nextStage === "open" && stage === "moratorium"
      ? "The moratorium ends. Deals can sign."
      : nextStage === "fill" && stage === "open"
        ? "The big board is thin. Clubs fill with mins."
        : nextStage === "done"
          ? "Free agency is quiet. Training camp is next."
          : `Free agency day ${day}`;

  return {
    ...next,
    faMarket: {
      stage: nextStage === "done" ? "fill" : nextStage,
      day,
      agreements: next.faMarket?.agreements ?? [],
      pending: next.faMarket?.pending ?? [],
      recap,
      done: nextStage === "done",
    },
    news: [
      news(
        next,
        headline,
        lines.length
          ? lines.slice(0, 4).join(" ")
          : "Quiet day. A few clubs still shopping the back of the board."
      ),
      ...next.news,
    ].slice(0, 50),
  };
}

/** Run several FA days (CPU automation / “let other teams sign”). */
export function runFaPeriod(
  state: GmLeagueState,
  days = MORATORIUM_DAYS + OPEN_DAYS + FILL_DAYS
): GmLeagueState {
  let next: GmLeagueState = {
    ...state,
    faMarket: state.faMarket ?? emptyFaMarket(),
  };
  for (let i = 0; i < days; i++) {
    if (next.faMarket?.done) break;
    next = advanceFaDay(next);
  }
  return next;
}

export function userOfferFreeAgent(
  state: GmLeagueState,
  playerId: string,
  salaryM: number,
  years: number
):
  | { ok: true; state: GmLeagueState; note: string }
  | { ok: false; reason: string; state?: GmLeagueState } {
  if (state.phase !== "free_agency") {
    return { ok: false, reason: "Free agency is not open." };
  }
  const player = state.players.find((row) => row.id === playerId);
  if (!player || player.teamId != null) {
    return { ok: false, reason: "That player is not on the market." };
  }
  const verdict = evaluateSigning(state, state.userTeamId, player, salaryM, years);
  if (!verdict.ok) return verdict;
  const market = state.faMarket ?? emptyFaMarket();
  const team = state.teams.find((row) => row.id === state.userTeamId)!;
  const rules = getCbaRules(state.season);
  const appeal = offerAppeal(player, team, salaryM, years, state.players, rules);
  const offer: GmFaOffer = {
    id: uid("fa"),
    playerId,
    teamId: state.userTeamId,
    salaryM,
    years,
    day: market.day,
    kind: market.stage === "moratorium" ? "interest" : "interest",
    via: verdict.via,
  };

  if (market.stage === "moratorium") {
    const rivals = market.pending.filter((row) => row.playerId === playerId);
    const bestRival = rivals.reduce((best, row) => {
      const club = state.teams.find((t) => t.id === row.teamId);
      if (!club) return best;
      return Math.max(
        best,
        offerAppeal(player, club, row.salaryM, row.years, state.players, rules)
      );
    }, 0);
    const ovr = overallOf(player);
    if (ovr >= 84 && appeal + 4 < bestRival) {
      return {
        ok: false,
        reason: `${player.name} is leaning elsewhere. Raise it or wait for the open.`,
      };
    }
    if (ovr >= 84 && salaryM + 0.05 < askingSalary(player, rules) * 0.9 && rivals.length) {
      return {
        ok: false,
        reason: `${player.name} wants closer to $${askingSalary(player, rules).toFixed(1)}M.`,
      };
    }
    const agreements = [
      ...market.agreements.filter((row) => row.playerId !== playerId),
      { ...offer, kind: "agreement" as const },
    ];
    return {
      ok: true,
      note: `Agreement with ${player.name} during the moratorium. It locks when the window opens.`,
      state: {
        ...state,
        faMarket: {
          ...market,
          agreements,
          pending: market.pending.filter(
            (row) => !(row.playerId === playerId && row.teamId === state.userTeamId)
          ),
        },
      },
    };
  }

  // Open / fill: sign now if they take it; otherwise keep the bid on the board.
  const pending = [
    ...market.pending.filter(
      (row) => !(row.playerId === playerId && row.teamId === state.userTeamId)
    ),
    offer,
  ];
  let next: GmLeagueState = { ...state, faMarket: { ...market, pending } };
  const resolved = resolvePlayers(next, rules, "sign");
  next = resolved.state;
  const signed = next.players.find((row) => row.id === playerId)?.teamId === state.userTeamId;
  if (!signed) {
    return {
      ok: false,
      reason: `${player.name} is still shopping. Your offer is on the board. Bump it or wait a day.`,
      state: next,
    };
  }
  return {
    ok: true,
    note: `Signed ${player.name} on the ${verdict.via.replaceAll("_", " ")}.`,
    state: next,
  };
}

/** One-click Bird / early-Bird re-sign at the ask. */
export function resignOwnFreeAgent(
  state: GmLeagueState,
  playerId: string
): { ok: true; state: GmLeagueState; note: string } | { ok: false; reason: string } {
  const player = state.players.find((row) => row.id === playerId);
  if (!player || player.teamId != null) {
    return { ok: false, reason: "Not on the market." };
  }
  if (player.rightsTeamId !== state.userTeamId) {
    return { ok: false, reason: "You do not hold his Bird rights." };
  }
  const rules = getCbaRules(state.season);
  const salaryM = askingSalary(player, rules);
  const years = askingYears(player, rules);
  return userOfferFreeAgent(state, playerId, salaryM, years);
}

export function faBoard(state: GmLeagueState): GmPlayer[] {
  return state.players
    .filter((player) => player.teamId == null && state.freeAgents.includes(player.id))
    .sort((a, b) => overallOf(b) - overallOf(a) || a.name.localeCompare(b.name));
}

export function faStageLabel(market: GmFaMarket | undefined): string {
  if (!market) return "Closed";
  if (market.done) return "Quiet";
  if (market.stage === "moratorium") return `Moratorium · day ${market.day + 1}`;
  if (market.stage === "open") return `Open signing · day ${market.day + 1}`;
  return `Roster fill · day ${market.day + 1}`;
}
