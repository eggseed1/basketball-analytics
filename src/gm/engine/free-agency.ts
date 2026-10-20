/**
 * Free agency desk: options → qualifying offers → rights → moratorium →
 * open signing → fill. Tick lengths are configurable game turns.
 */

import type {
  GmFaMarket,
  GmFaOffer,
  GmLeagueState,
  GmPlayer,
  GmSignVia,
  GmTeam,
} from "@/gm/types";
import { evaluateSigning, rosterCount, teamPayrollM } from "@/gm/engine/cap";
import { overallOf, autoSetLineup } from "@/gm/engine/lineup";
import { rosterNeeds } from "@/gm/engine/draft-room";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { createRng, uid } from "@/gm/engine/rng";
import type { CBARules } from "@/gm/myleague/types";
import { askingSalary, askingYears } from "@/gm/engine/free-agency-ask";
import {
  defaultFaConfig,
  emptyFaMarket,
  ensureFaMarket,
  stageAfterDay,
} from "@/gm/engine/fa-market-config";
import { evaluateOfferUtility, agentFeedback } from "@/gm/engine/fa-utility";
import {
  pendingOptions,
  resolveAutomatedOptions,
  resolveUserTeamOptionsWithPolicy,
  userTeamOptionsBlocking,
  applyOptionDecision,
} from "@/gm/engine/fa-options";
import {
  resolveCpuQualifyingOffers,
  tenderQualifyingOffer,
  declineQualifyingOffer,
  userQoBlocking,
} from "@/gm/engine/fa-qualifying";
import {
  resolveCpuOfferSheetMatches,
  resolveExpiredOfferSheets,
  userRfaSheetsBlocking,
  submitOfferSheet,
} from "@/gm/engine/fa-rfa";

export { askingSalary, askingYears, emptyFaMarket };
export {
  applyOptionDecision,
  tenderQualifyingOffer,
  declineQualifyingOffer,
  submitOfferSheet,
};

function autoFa(state: GmLeagueState): boolean {
  return state.automation?.autoFreeAgency ?? true;
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

export function applySign(
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
          qoStatus: undefined,
          qoAmountM: undefined,
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
        reservations: (state.faMarket.reservations ?? []).filter(
          (row) => row.playerId !== playerId
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

/** Legacy appeal score — wraps the utility total for older call sites. */
export function offerAppeal(
  player: GmPlayer,
  team: GmTeam,
  salaryM: number,
  years: number,
  players: GmPlayer[],
  rules: CBARules,
  league?: GmLeagueState
): number {
  if (league) {
    return evaluateOfferUtility(league, player, team, salaryM, years).total;
  }
  const ask = askingSalary(player, rules);
  const askY = askingYears(player, rules);
  const ovr = overallOf(player);
  const needs = rosterNeeds(team, players);
  let score =
    (salaryM / Math.max(0.5, ask)) * 42 +
    (years / askY) * 14 +
    (player.position === needs[0] ? 18 : player.position === needs[1] ? 8 : 0);
  if (player.rightsTeamId === team.id) score += ovr >= 80 ? 22 : 14;
  return score;
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
  const reserved = new Set(
    (state.faMarket?.reservations ?? [])
      .filter((row) => row.teamId !== team.id)
      .map((row) => row.playerId)
  );
  const pool = state.players
    .filter((player) => player.teamId == null)
    .filter((player) => !reserved.has(player.id))
    .filter(
      (player) =>
        !state.faMarket?.agreements.some(
          (row) => row.playerId === player.id && row.teamId !== team.id
        )
    );
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
  const stars = rest.filter((player) => overallOf(player) >= 82);
  const board =
    team.ownerGoal === "contend" ? [...own, ...stars, ...rest] : [...own, ...rest];
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
  let next = state;
  const market0 = ensureFaMarket(next);
  if (
    market0.stage !== "moratorium" &&
    market0.stage !== "open" &&
    market0.stage !== "fill"
  ) {
    return state;
  }
  const rng = createRng((market0.seed ?? next.season * 7919) + market0.day * 97);
  let pending = [...market0.pending];
  const taken = new Set(
    [...market0.agreements, ...pending]
      .filter((row) => row.kind !== "rejected" && row.kind !== "withdrawn")
      .map((row) => `${row.teamId}:${row.playerId}`)
  );

  for (const team of next.teams) {
    if (team.id === next.userTeamId) continue;
    const aggression =
      team.ownerGoal === "contend" ? 1.05 : team.ownerGoal === "tank" ? 0.72 : 0.9;
    for (const player of teamTargets(next, team, rules)) {
      if (rng() > (overallOf(player) >= 84 ? 0.92 : overallOf(player) >= 78 ? 0.72 : 0.5))
        continue;
      const key = `${team.id}:${player.id}`;
      if (taken.has(key)) continue;
      const market = ensureFaMarket(next);
      if (player.rightsKind === "restricted" && player.qoStatus === "tendered") {
        if (player.rightsTeamId === team.id) {
          const bid = bestLegalBid(next, team, player, rules, aggression);
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
            utility: evaluateOfferUtility(next, player, team, bid.salaryM, bid.years),
          });
          taken.add(key);
          continue;
        }
        if (overallOf(player) >= 76 && rng() > 0.55) {
          const bid = bestLegalBid(next, team, player, rules, aggression);
          if (!bid) continue;
          const sheeted = submitOfferSheet(
            { ...next, faMarket: { ...market, pending } },
            player.id,
            team.id,
            bid.salaryM,
            bid.years
          );
          if (sheeted.ok) {
            next = sheeted.state;
            pending = [...(next.faMarket?.pending ?? [])];
            taken.add(key);
          }
        }
        continue;
      }
      const bid = bestLegalBid(next, team, player, rules, aggression);
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
        utility: evaluateOfferUtility(next, player, team, bid.salaryM, bid.years),
      });
      taken.add(key);
    }
  }

  return {
    ...next,
    faMarket: { ...ensureFaMarket(next), pending },
  };
}

function dealWhy(
  player: GmPlayer,
  winner: {
    team: { abbr: string; id: string; ownerGoal: string };
    offer: { salaryM: number; years: number };
    appeal: number;
  },
  ranked: Array<{ team: { abbr: string }; offer: { salaryM: number }; appeal: number }>,
  ask: number,
  rules: CBARules
): string {
  const second = ranked[1];
  const nearAsk = winner.offer.salaryM + 0.05 >= ask * 0.97;
  const bird = player.rightsTeamId === winner.team.id;
  if (bird && nearAsk) return "Home Bird money near the ask.";
  if (nearAsk && !second) return "Only serious offer at the asking price.";
  if (second && winner.appeal - second.appeal >= 8) {
    return `Cleared ${second.team.abbr}'s $${second.offer.salaryM.toFixed(1)}M pitch.`;
  }
  if (winner.team.ownerGoal === "contend" && overallOf(player) >= 80) {
    return "Contender fit beat a quieter market.";
  }
  if (winner.offer.years >= askingYears(player, rules) + 1) {
    return "Years on the deal tipped it.";
  }
  return ranked.length > 1
    ? `Beat ${ranked.length - 1} other offer${ranked.length > 2 ? "s" : ""}.`
    : "Best available money.";
}

function resolvePlayers(
  state: GmLeagueState,
  rules: CBARules,
  mode: "agree" | "sign"
): { state: GmLeagueState; lines: string[] } {
  const market = ensureFaMarket(state);
  const lines: string[] = [];
  let next = state;
  const byPlayer = new Map<string, GmFaOffer[]>();
  for (const offer of market.pending) {
    if (
      offer.kind === "rejected" ||
      offer.kind === "withdrawn" ||
      offer.kind === "expired" ||
      offer.kind === "invalidated" ||
      offer.kind === "offer_sheet" ||
      offer.kind === "awaiting_match"
    ) {
      continue;
    }
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

  // Stable order: sort player ids so resolution does not follow array order.
  const playerIds = [...byPlayer.keys()].sort();
  for (const playerId of playerIds) {
    const offers = byPlayer.get(playerId)!;
    const player = next.players.find((row) => row.id === playerId);
    if (!player || player.teamId != null) continue;
    if (player.rightsKind === "restricted" && mode === "sign") {
      // RFA ordinary signings only with the rights holder; sheets use fa-rfa.
      const onlyIncumbent = offers.every((row) => row.teamId === player.rightsTeamId);
      if (!onlyIncumbent && !offers.some((row) => row.teamId === player.rightsTeamId)) {
        continue;
      }
    }
    const ranked = offers
      .map((offer) => {
        const team = next.teams.find((row) => row.id === offer.teamId);
        if (!team) return null;
        const utility =
          offer.utility ??
          evaluateOfferUtility(next, player, team, offer.salaryM, offer.years);
        return { offer, team, appeal: utility.total, utility };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort(
        (a, b) =>
          b.appeal - a.appeal || a.team.id.localeCompare(b.team.id)
      );
    const winner = ranked[0];
    if (!winner) continue;
    const ovr = overallOf(player);
    const ask = askingSalary(player, rules);
    if (mode === "agree") {
      if (ovr >= 86 && winner.offer.salaryM + 0.05 < ask * 0.95) continue;
      if (ovr >= 84 && winner.offer.salaryM + 0.05 < ask * 0.9) continue;
      if (ovr >= 80 && ranked.length < 2 && winner.offer.salaryM < ask * 0.92) continue;
      if (ovr >= 76 && ranked.length < 2 && winner.offer.salaryM < ask * 0.88) continue;
      const birdHome =
        player.rightsTeamId === winner.team.id &&
        winner.offer.salaryM + 0.05 >= ask * 0.9;
      if (!birdHome && ovr >= 78 && ranked.length < 2) continue;

      const reservation = {
        id: uid("res"),
        teamId: winner.team.id,
        playerId,
        salaryM: winner.offer.salaryM,
        via: winner.offer.via ?? ("room" as GmSignVia),
        offerId: winner.offer.id,
        kind: "agreement" as const,
      };
      const agreements = [
        ...((next.faMarket ?? market).agreements.filter((row) => row.playerId !== playerId)),
        {
          ...winner.offer,
          kind: "agreement" as const,
          utility: winner.utility,
          responseNote: agentFeedback(
            player,
            winner.utility,
            ranked[1]?.utility ?? null,
            winner.offer.salaryM,
            ask
          ),
        },
      ];
      const pending = (next.faMarket ?? market).pending.filter(
        (row) => row.playerId !== playerId
      );
      next = {
        ...next,
        faMarket: {
          ...(next.faMarket ?? market),
          agreements,
          pending,
          reservations: [
            ...((next.faMarket ?? market).reservations ?? []).filter(
              (row) => row.playerId !== playerId
            ),
            reservation,
          ],
        },
      };
      if (ovr >= 78) {
        const why = dealWhy(player, winner, ranked, ask, rules);
        lines.push(
          `${player.name} agrees with ${winner.team.abbr}: ${winner.offer.years} yrs, $${winner.offer.salaryM.toFixed(1)}M (moratorium). ${why}`
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
      const why = dealWhy(player, winner, ranked, ask, rules);
      lines.push(
        `${winner.team.city} ${winner.team.name} sign ${player.name}, ${winner.offer.years} years, $${winner.offer.salaryM.toFixed(1)}M. ${why}`
      );
    }
  }

  return { state: next, lines };
}

function fillMinimums(
  state: GmLeagueState,
  rules: CBARules
): { state: GmLeagueState; lines: string[] } {
  let next = state;
  const lines: string[] = [];
  const min = Math.max(rules.minSalaryM || 1, state.settings.salaryCapM * (2.087 / 140.588));
  const teamIds = [...state.teams.map((t) => t.id)].sort();
  for (const teamId of teamIds) {
    const team = next.teams.find((t) => t.id === teamId)!;
    let guard = 0;
    const needs = rosterNeeds(team, next.players);
    while (rosterCount(team.id, next.players) < next.settings.minRoster && guard < 8) {
      guard += 1;
      const pool = next.players
        .filter((player) => player.teamId == null)
        .sort((a, b) => {
          const na = a.position === needs[0] ? 12 : a.position === needs[1] ? 5 : 0;
          const nb = b.position === needs[0] ? 12 : b.position === needs[1] ? 5 : 0;
          return overallOf(b) + nb - (overallOf(a) + na) || a.id.localeCompare(b.id);
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

export type AdvanceFaResult = {
  state: GmLeagueState;
  blocked?: { reason: string; kind: string };
};

/**
 * Advance one tick. Pre-market stages move when blocking decisions are clear.
 * Opening a screen never calls this — only the Advance control does.
 */
export function advanceFaDay(state: GmLeagueState): GmLeagueState {
  return advanceFaDayDetailed(state).state;
}

export function advanceFaDayDetailed(state: GmLeagueState): AdvanceFaResult {
  if (state.phase !== "free_agency") return { state };
  let market = ensureFaMarket(state);
  let next: GmLeagueState = { ...state, faMarket: market };
  const auto = autoFa(next);

  // ——— Options ———
  if (market.stage === "options") {
    next = resolveAutomatedOptions(next);
    const blocking = userTeamOptionsBlocking(next);
    if (blocking.length && !auto) {
      return {
        state: {
          ...next,
          faMarket: {
            ...ensureFaMarket(next),
            decisions: [
              ...blocking.map((row) => ({
                id: uid("fadec"),
                kind: "team_option" as const,
                playerId: row.player.id,
                teamId: row.teamId,
                headline: `Team option on ${row.player.name}`,
                detail: `Exercise or decline the $${row.salaryM.toFixed(1)}M option before advancing.`,
              })),
              ...(ensureFaMarket(next).decisions ?? []),
            ].slice(0, 40),
          },
        },
        blocked: {
          kind: "team_option",
          reason: `Resolve ${blocking.length} team option${blocking.length === 1 ? "" : "s"} before advancing.`,
        },
      };
    }
    if (blocking.length && auto) {
      next = resolveUserTeamOptionsWithPolicy(next);
    }
    // If anything still pending (player options on user? already resolved), move on.
    if (pendingOptions(next).length === 0) {
      market = { ...ensureFaMarket(next), stage: "qualifying_offers", dayRecap: [] };
      next = { ...next, faMarket: market };
    }
    return { state: next };
  }

  // ——— Qualifying offers ———
  if (market.stage === "qualifying_offers") {
    next = resolveCpuQualifyingOffers(next);
    const blocking = userQoBlocking(next);
    if (blocking.length && !auto) {
      return {
        state: next,
        blocked: {
          kind: "qualifying_offer",
          reason: `Tender or decline ${blocking.length} qualifying offer${blocking.length === 1 ? "" : "s"} before advancing.`,
        },
      };
    }
    if (blocking.length && auto) {
      for (const row of blocking) {
        const keep = overallOf(row.player) >= 74;
        const result = keep
          ? tenderQualifyingOffer(next, row.player.id, row.rightsTeamId)
          : declineQualifyingOffer(next, row.player.id, row.rightsTeamId);
        if (result.ok) next = result.state;
      }
    }
    if (userQoBlocking(next).length === 0) {
      market = { ...ensureFaMarket(next), stage: "rights" };
      next = { ...next, faMarket: market };
    }
    return { state: next };
  }

  // ——— Rights review (one tick to acknowledge; then moratorium) ———
  if (market.stage === "rights") {
    market = {
      ...ensureFaMarket(next),
      stage: "moratorium",
      day: 0,
      recap: [
        "Rights review closed. The moratorium is open — pitch now, deals lock when signing opens.",
        ...(ensureFaMarket(next).recap ?? []),
      ].slice(0, 40),
    };
    next = {
      ...next,
      faMarket: market,
      news: [
        news(
          next,
          "The moratorium is open",
          "Pitch deals now. Commitments reserve room. Signings finalize when the window opens."
        ),
        ...next.news,
      ].slice(0, 50),
    };
    return { state: next };
  }

  // ——— RFA sheets blocking user ———
  const rfaBlock = userRfaSheetsBlocking(next);
  if (rfaBlock.length && !auto) {
    return {
      state: next,
      blocked: {
        kind: "rfa_match",
        reason: `Match or decline ${rfaBlock.length} offer sheet${rfaBlock.length === 1 ? "" : "s"} before advancing.`,
      },
    };
  }

  const rules = getCbaRules(next.season);
  next = resolveCpuOfferSheetMatches(next);
  next = placeCpuOffers(next, rules);
  market = ensureFaMarket(next);
  const stage = market.stage;
  const lines: string[] = [];

  if (stage === "moratorium") {
    const resolved = resolvePlayers(next, rules, "agree");
    next = resolved.state;
    lines.push(...resolved.lines);
  } else if (stage === "open") {
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
  const config = market.config ?? defaultFaConfig();
  const { stage: nextStage, done } = stageAfterDay(day, config);
  next = resolveExpiredOfferSheets({
    ...next,
    faMarket: { ...ensureFaMarket(next), day },
  });
  const scarce = scarcityLine(next);
  if (scarce) lines.push(scarce);
  const recap = [...lines.slice(0, 10), ...(next.faMarket?.recap ?? [])].slice(0, 40);
  const headline =
    nextStage === "open" && stage === "moratorium"
      ? "The moratorium ends. Deals can sign."
      : nextStage === "fill" && stage === "open"
        ? "The big board is thin. Clubs fill with mins."
        : done
          ? "Free agency is quiet. Training camp is next."
          : `Free agency day ${day}`;

  return {
    state: {
      ...next,
      faMarket: {
        ...ensureFaMarket(next),
        stage: nextStage,
        day,
        agreements: next.faMarket?.agreements ?? [],
        pending: next.faMarket?.pending ?? [],
        recap,
        dayRecap: lines.slice(0, 12),
        done,
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
    },
  };
}

export function runFaPeriod(state: GmLeagueState, days = 40): GmLeagueState {
  let next: GmLeagueState = {
    ...state,
    faMarket: ensureFaMarket(state),
  };
  for (let i = 0; i < days; i++) {
    if (next.faMarket?.done) break;
    const result = advanceFaDayDetailed(next);
    next = result.state;
    if (result.blocked && !autoFa(next)) {
      if (result.blocked.kind === "team_option") {
        next = resolveUserTeamOptionsWithPolicy(next);
        continue;
      }
      break;
    }
  }
  // If still stuck in pre-market, push through with automation.
  let guard = 0;
  while (
    next.faMarket &&
    !next.faMarket.done &&
    (next.faMarket.stage === "options" ||
      next.faMarket.stage === "qualifying_offers" ||
      next.faMarket.stage === "rights") &&
    guard < 10
  ) {
    guard += 1;
    next = {
      ...next,
      automation: {
        autoDraft: next.automation?.autoDraft ?? false,
        autoFreeAgency: true,
        autoScout: next.automation?.autoScout,
      },
    };
    next = advanceFaDayDetailed(next).state;
  }
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
  const market = ensureFaMarket(state);
  if (
    market.stage === "options" ||
    market.stage === "qualifying_offers" ||
    market.stage === "rights"
  ) {
    return {
      ok: false,
      reason: `Finish the ${market.stage.replaceAll("_", " ")} desk before pitching free agents.`,
    };
  }
  const player = state.players.find((row) => row.id === playerId);
  if (!player || player.teamId != null) {
    return { ok: false, reason: "That player is not on the market." };
  }
  if (player.rightsKind === "restricted" && player.rightsTeamId !== state.userTeamId) {
    return submitOfferSheet(state, playerId, state.userTeamId, salaryM, years);
  }
  const verdict = evaluateSigning(state, state.userTeamId, player, salaryM, years);
  if (!verdict.ok) return verdict;
  const team = state.teams.find((row) => row.id === state.userTeamId)!;
  const rules = getCbaRules(state.season);
  const utility = evaluateOfferUtility(state, player, team, salaryM, years);
  const offer: GmFaOffer = {
    id: uid("fa"),
    playerId,
    teamId: state.userTeamId,
    salaryM,
    years,
    day: market.day,
    kind: "interest",
    via: verdict.via,
    utility,
  };

  if (market.stage === "moratorium") {
    const rivals = market.pending.filter((row) => row.playerId === playerId);
    const bestRival = rivals.reduce((best, row) => {
      const club = state.teams.find((t) => t.id === row.teamId);
      if (!club) return best;
      return Math.max(
        best,
        evaluateOfferUtility(state, player, club, row.salaryM, row.years).total
      );
    }, 0);
    const ovr = overallOf(player);
    const ask = askingSalary(player, rules);
    if (ovr >= 84 && utility.total + 4 < bestRival) {
      return {
        ok: false,
        reason: agentFeedback(
          player,
          utility,
          { total: bestRival, money: 0, winning: 0, role: 0, continuity: 0, fit: 0, noise: 0 },
          salaryM,
          ask
        ),
      };
    }
    if (ovr >= 84 && salaryM + 0.05 < ask * 0.9 && rivals.length) {
      return {
        ok: false,
        reason: `${player.name} wants closer to $${ask.toFixed(1)}M.`,
      };
    }
    // Near-ask or Bird home: commit now. Otherwise leave as pending interest.
    const commit =
      (player.rightsTeamId === state.userTeamId && salaryM + 0.05 >= ask * 0.9) ||
      salaryM + 0.05 >= ask * 0.97 ||
      (ovr < 80 && salaryM + 0.05 >= ask * 0.9);
    if (commit) {
      const agreements = [
        ...market.agreements.filter((row) => row.playerId !== playerId),
        {
          ...offer,
          kind: "agreement" as const,
          responseNote: "You have a commitment. The contract will finalize when the moratorium ends.",
        },
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
            reservations: [
              ...(market.reservations ?? []).filter((row) => row.playerId !== playerId),
              {
                id: uid("res"),
                teamId: state.userTeamId,
                playerId,
                salaryM,
                via: verdict.via,
                offerId: offer.id,
                kind: "agreement",
              },
            ],
          },
        },
      };
    }
    return {
      ok: true,
      note: agentFeedback(player, utility, null, salaryM, ask),
      state: {
        ...state,
        faMarket: {
          ...market,
          pending: [
            ...market.pending.filter(
              (row) => !(row.playerId === playerId && row.teamId === state.userTeamId)
            ),
            { ...offer, kind: "pending", responseNote: "Considering; waiting for the market." },
          ],
        },
      },
    };
  }

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
  if (market.stage === "options") return "Contract options";
  if (market.stage === "qualifying_offers") return "Qualifying offers";
  if (market.stage === "rights") return "Rights review";
  if (market.stage === "moratorium") return `Moratorium · day ${market.day + 1}`;
  if (market.stage === "open") return `Open signing · day ${market.day + 1}`;
  return `Roster fill · day ${market.day + 1}`;
}

export function toggleFaWatchlist(
  state: GmLeagueState,
  playerId: string
): GmLeagueState {
  const market = ensureFaMarket(state);
  const set = new Set(market.watchlist ?? []);
  if (set.has(playerId)) set.delete(playerId);
  else set.add(playerId);
  return {
    ...state,
    faMarket: { ...market, watchlist: [...set] },
  };
}

export function renounceRightsPreview(
  state: GmLeagueState,
  playerId: string
): { ok: true; holdM: number; roomAfterM: number } | { ok: false; reason: string } {
  const player = state.players.find((row) => row.id === playerId);
  if (!player || player.rightsTeamId !== state.userTeamId) {
    return { ok: false, reason: "You do not hold rights on that player." };
  }
  const hold = player.lastSalaryM ?? 0;
  const team = state.teams.find((t) => t.id === state.userTeamId);
  if (!team) return { ok: false, reason: "Team missing." };
  const before = teamPayrollM(team.id, state.players, team.deadMoney ?? []);
  const after = before - hold;
  return {
    ok: true,
    holdM: hold,
    roomAfterM: state.settings.salaryCapM - after,
  };
}
