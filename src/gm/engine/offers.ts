/**
 * Incoming trade offers. A team calls during the season, the sim stops,
 * and the user can change the package before answering.
 */

import type { GmIncomingOffer, GmLeagueState, GmTradeAsset } from "@/gm/types";
import { boardValue, evaluateTrade } from "@/gm/engine/trades";
import { uid } from "@/gm/engine/rng";
import {
  formatStars,
  pickStars,
  playerStars,
  projectedSlot,
  tradeStance,
} from "@/gm/engine/value";

export function offerDay(day: number, shopping: boolean): boolean {
  if (day < 10) return false;
  if (day % 14 === 0) return true;
  return shopping && day % 7 === 0;
}

function assetLabel(league: GmLeagueState, asset: GmTradeAsset): string {
  if (asset.type === "player") {
    const player = league.players.find((entry) => entry.id === asset.id);
    if (!player) return "a player";
    return `${player.name} (${formatStars(playerStars(player))} stars)`;
  }
  if (asset.type === "pick") {
    const pick = league.teams.flatMap((team) => team.draftPicks).find((entry) => entry.id === asset.id);
    if (!pick) return "a pick";
    const round = pick.round === 1 ? "1st" : "2nd";
    const slot = projectedSlot(league, pick);
    return `${pick.season} ${round} (about pick ${slot}, ${formatStars(pickStars(league, pick))} stars)`;
  }
  return `$${(asset.cashM ?? 0).toFixed(1)}M`;
}

function packageLabel(league: GmLeagueState, assets: GmTradeAsset[]): string {
  if (!assets.length) return "nothing";
  return assets.map((asset) => assetLabel(league, asset)).join(" and ");
}

function cpuCushion(league: GmLeagueState, teamId: string): number {
  const stance = tradeStance(league, teamId);
  return stance === "stay" ? 4 : 10;
}

/** Both sides stay within a star of each other, and the deal is legal. */
export function offerIsFair(
  league: GmLeagueState,
  cpuId: string,
  userId: string,
  cpuAssets: GmTradeAsset[],
  userAssets: GmTradeAsset[]
): { ok: boolean; reason?: string } {
  if (!cpuAssets.length || !userAssets.length) {
    return { ok: false, reason: "Both sides need a piece." };
  }
  const verdict = evaluateTrade(league, cpuId, userId, cpuAssets, userAssets);
  if (!verdict.ok && !verdict.reason?.includes("not enough value")) {
    return { ok: false, reason: verdict.reason };
  }
  const sent = boardValue(league, cpuId, cpuAssets);
  const received = boardValue(league, cpuId, userAssets);
  if (sent - received > cpuCushion(league, cpuId)) {
    const abbr = league.teams.find((team) => team.id === cpuId)?.abbr ?? "They";
    return { ok: false, reason: `${abbr} will not give up that much.` };
  }
  return { ok: true };
}

function candidates(league: GmLeagueState): GmIncomingOffer | null {
  const userId = league.userTeamId;
  const userTeam = league.teams.find((team) => team.id === userId);
  if (!userTeam) return null;
  const locked = new Set(userTeam.untouchables ?? []);
  const mine = league.players
    .filter((player) => player.teamId === userId && player.contract && !locked.has(player.id))
    .sort((a, b) => playerStars(b) - playerStars(a))
    .slice(0, 10);
  let best: { cpuId: string; cpuAssets: GmTradeAsset[]; userAssets: GmTradeAsset[]; gap: number } | null = null;

  const keep = (cpuId: string, cpuAssets: GmTradeAsset[], userAssets: GmTradeAsset[]) => {
    const verdict = offerIsFair(league, cpuId, userId, cpuAssets, userAssets);
    if (!verdict.ok) return;
    const scored = evaluateTrade(league, cpuId, userId, cpuAssets, userAssets);
    const gap = Math.abs(scored.fromValue - scored.toValue);
    if (!best || gap < best.gap) best = { cpuId, cpuAssets, userAssets, gap };
  };

  const userPicks = (userTeam.draftPicks ?? []).filter((pick) => pick.season >= league.season).slice(0, 4);
  for (const team of league.teams) {
    if (team.id === userId) continue;
    const stance = tradeStance(league, team.id);
    if (stance === "stay") continue;
    const theirs = league.players
      .filter(
        (player) =>
          player.teamId === team.id &&
          player.contract &&
          !(team.untouchables ?? []).includes(player.id)
      )
      .sort((a, b) => playerStars(b) - playerStars(a))
      .slice(0, 8);
    const picks = team.draftPicks.filter((pick) => pick.season >= league.season).slice(0, 4);
    for (const wanted of mine) {
      for (const offered of theirs) {
        if (Math.abs(playerStars(wanted) - playerStars(offered)) > 1) continue;
        if (stance === "sell" && offered.age <= 23) continue;
        if (stance === "buy" && playerStars(offered) > playerStars(wanted) + 0.5) continue;
        keep(team.id, [{ type: "player", id: offered.id }], [{ type: "player", id: wanted.id }]);
      }
      if (stance === "buy") {
        for (const pick of picks) {
          if (Math.abs(playerStars(wanted) - pickStars(league, pick)) > 1.5) continue;
          keep(team.id, [{ type: "pick", id: pick.id }], [{ type: "player", id: wanted.id }]);
        }
        for (const offered of theirs) {
          const gap = playerStars(wanted) - playerStars(offered);
          if (gap < 0.5 || gap > 1.5) continue;
          const sweetener = picks.find((pick) => pickStars(league, pick) <= 2.5);
          if (!sweetener) continue;
          keep(
            team.id,
            [
              { type: "player", id: offered.id },
              { type: "pick", id: sweetener.id },
            ],
            [{ type: "player", id: wanted.id }]
          );
        }
      }
    }
    if (stance === "sell") {
      const vets = theirs.filter((player) => player.age >= 29 || (player.age >= 27 && playerStars(player) >= 3));
      for (const vet of vets) {
        for (const pick of userPicks) {
          if (Math.abs(playerStars(vet) - pickStars(league, pick)) > 1.5) continue;
          keep(team.id, [{ type: "player", id: vet.id }], [{ type: "pick", id: pick.id }]);
        }
        for (const young of mine.filter((player) => player.age <= 24)) {
          if (playerStars(young) > playerStars(vet) + 0.5) continue;
          keep(team.id, [{ type: "player", id: vet.id }], [{ type: "player", id: young.id }]);
        }
      }
    }
  }

  if (!best) return null;
  const chosen = best;
  const team = league.teams.find((entry) => entry.id === chosen.cpuId);
  const note = `${team?.city ?? "A team"} sends ${packageLabel(league, chosen.cpuAssets)} for ${packageLabel(league, chosen.userAssets)}.`;
  return {
    id: uid("offer"),
    fromTeamId: chosen.cpuId,
    toTeamId: userId,
    fromAssets: chosen.cpuAssets,
    toAssets: chosen.userAssets,
    day: league.day,
    note,
  };
}

export function considerIncomingOffer(league: GmLeagueState): GmLeagueState {
  if (league.phase !== "regular" || league.tradeDeadlinePassed || league.incomingOffer) return league;
  const shopping = (league.teams.find((team) => team.id === league.userTeamId)?.tradeBlock ?? []).length > 0;
  if (!offerDay(league.day, shopping)) return league;
  const offer = candidates(league);
  if (!offer) return league;
  const caller = league.teams.find((team) => team.id === offer.fromTeamId);
  return {
    ...league,
    incomingOffer: offer,
    news: [
      {
        id: uid("news"),
        day: league.day,
        season: league.season,
        headline: `${caller?.city ?? "A team"} sent a trade offer`,
        body: `${offer.note} The sim waits until you answer.`,
        tone: "trade",
      },
      ...league.news,
    ].slice(0, 50),
  };
}
