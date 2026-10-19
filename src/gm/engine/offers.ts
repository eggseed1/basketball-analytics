/**
 * Incoming trade offers. A team calls during the season, the sim stops,
 * and the user can change the package before answering.
 *
 * Offers are built from roster holes and surplus, not star-for-star swaps.
 */

import type { GmIncomingOffer, GmLeagueState, GmPlayer, GmTradeAsset } from "@/gm/types";
import { boardValue, evaluateTrade } from "@/gm/engine/trades";
import { uid } from "@/gm/engine/rng";
import {
  formatStars,
  pickStars,
  playerStars,
  projectedSlot,
  tradeStance,
} from "@/gm/engine/value";
import { overallOf } from "@/gm/engine/lineup";
import {
  dealImprovesFit,
  fitDelta,
  movablePlayers,
  needRank,
  rosterProfile,
  targetsForBuyer,
  wantScore,
} from "@/gm/engine/roster-fit";

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

function playersOf(league: GmLeagueState, assets: GmTradeAsset[]): GmPlayer[] {
  return assets
    .filter((asset) => asset.type === "player")
    .map((asset) => league.players.find((player) => player.id === asset.id))
    .filter((player): player is GmPlayer => Boolean(player));
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

function fitOk(
  league: GmLeagueState,
  cpuId: string,
  userId: string,
  cpuAssets: GmTradeAsset[],
  userAssets: GmTradeAsset[]
): boolean {
  const cpuPlayers = playersOf(league, cpuAssets);
  const userPlayers = playersOf(league, userAssets);
  const cpuGetsPicks = userAssets.some((asset) => asset.type === "pick" || asset.type === "cash");
  const userGetsPicks = cpuAssets.some((asset) => asset.type === "pick" || asset.type === "cash");

  // cpu sends cpuAssets, receives userAssets
  if (!dealImprovesFit(league, cpuId, userId, cpuPlayers, userPlayers)) {
    // Sellers can take picks/cash even if the player fit looks flat.
    const cpuStance = tradeStance(league, cpuId);
    const userStance = tradeStance(league, userId);
    const cpuDelta = fitDelta(league, cpuId, userPlayers, cpuPlayers);
    const userDelta = fitDelta(league, userId, cpuPlayers, userPlayers);
    if (cpuStance === "sell" && cpuGetsPicks && cpuDelta >= -28) {
      /* CPU seller dumps for futures */
    } else if (userStance === "sell" && userGetsPicks && userDelta >= -28) {
      /* user dumps for futures */
    } else if (cpuStance === "buy" && cpuDelta >= 8 && userDelta >= -20) {
      /* buyer fills a hole; seller takes the package */
    } else if (userStance === "buy" && userDelta >= 8 && cpuDelta >= -20) {
      /* user fills a hole */
    } else {
      return false;
    }
  }
  return true;
}

type Candidate = {
  cpuId: string;
  cpuAssets: GmTradeAsset[];
  userAssets: GmTradeAsset[];
  score: number;
};

function candidates(league: GmLeagueState): GmIncomingOffer | null {
  const userId = league.userTeamId;
  const userTeam = league.teams.find((team) => team.id === userId);
  if (!userTeam) return null;

  const userProfile = rosterProfile(league, userId);
  const userStance = userProfile.stance;
  const userPicks = (userTeam.draftPicks ?? [])
    .filter((pick) => pick.season >= league.season)
    .sort((a, b) => pickStars(league, b) - pickStars(league, a));

  const hits: Candidate[] = [];

  const keep = (
    cpuId: string,
    cpuAssets: GmTradeAsset[],
    userAssets: GmTradeAsset[],
    motive: number
  ) => {
    if (!fitOk(league, cpuId, userId, cpuAssets, userAssets)) return;
    const verdict = offerIsFair(league, cpuId, userId, cpuAssets, userAssets);
    if (!verdict.ok) return;
    const scored = evaluateTrade(league, cpuId, userId, cpuAssets, userAssets);
    if (!scored.ok && !scored.reason?.includes("not enough value")) return;
    const cpuDelta = fitDelta(
      league,
      cpuId,
      playersOf(league, userAssets),
      playersOf(league, cpuAssets)
    );
    const userDelta = fitDelta(
      league,
      userId,
      playersOf(league, cpuAssets),
      playersOf(league, userAssets)
    );
    const gap = Math.abs(scored.fromValue - scored.toValue);
    hits.push({
      cpuId,
      cpuAssets,
      userAssets,
      score: motive + cpuDelta + userDelta - gap * 0.35,
    });
  };

  for (const team of league.teams) {
    if (team.id === userId || team.id.startsWith("as-")) continue;
    const stance = tradeStance(league, team.id);
    if (stance === "stay" && userStance === "stay") continue;

    const cpuProfile = rosterProfile(league, team.id);
    const cpuPicks = team.draftPicks
      .filter((pick) => pick.season >= league.season)
      .sort((a, b) => pickStars(league, b) - pickStars(league, a));

    // --- Buyer CPU: take a player who fills their hole; pay with surplus + pick ---
    if (stance === "buy") {
      const targets = targetsForBuyer(league, team.id, userId).filter(
        (player) => needRank(cpuProfile, player.position) <= 2
      );
      const filler = movablePlayers(league, team.id, { max: 8 }).filter((player) => {
        const hole = needRank(cpuProfile, player.position);
        return hole >= 2 || overallOf(player) < 78;
      });

      for (const wanted of targets.slice(0, 4)) {
        // Prefer pick packages over lateral player swaps.
        for (const pick of cpuPicks.slice(0, 3)) {
          if (playerStars(wanted) - pickStars(league, pick) > 2.2) continue;
          if (pickStars(league, pick) - playerStars(wanted) > 1.8) continue;
          keep(
            team.id,
            [{ type: "pick", id: pick.id }],
            [{ type: "player", id: wanted.id }],
            28 + wantScore(cpuProfile, wanted)
          );
        }
        for (const piece of filler.slice(0, 5)) {
          if (piece.position === wanted.position && Math.abs(overallOf(piece) - overallOf(wanted)) <= 2) {
            continue;
          }
          const gap = playerStars(wanted) - playerStars(piece);
          if (gap < 0.25 || gap > 2) continue;
          const sweetener = cpuPicks.find((pick) => pickStars(league, pick) <= 2.5);
          if (sweetener && gap >= 0.75) {
            keep(
              team.id,
              [
                { type: "player", id: piece.id },
                { type: "pick", id: sweetener.id },
              ],
              [{ type: "player", id: wanted.id }],
              22 + wantScore(cpuProfile, wanted)
            );
          } else if (gap <= 1.1) {
            keep(
              team.id,
              [{ type: "player", id: piece.id }],
              [{ type: "player", id: wanted.id }],
              8 + wantScore(cpuProfile, wanted) - 10
            );
          }
        }
      }
    }

    // --- Seller CPU: dump a vet / expiring for the user's young piece or pick ---
    if (stance === "sell") {
      const shop = targetsForBuyer(league, userId, team.id).filter(
        (player) =>
          player.age >= 27 ||
          (player.contract?.yearsRemaining ?? 99) <= 1 ||
          overallOf(player) >= 80
      );
      const young = movablePlayers(league, userId, { max: 8 }).filter(
        (player) => player.age <= 24 || needRank(userProfile, player.position) >= 2
      );

      for (const vet of shop.slice(0, 4)) {
        for (const pick of userPicks.slice(0, 4)) {
          if (Math.abs(playerStars(vet) - pickStars(league, pick)) > 1.8) continue;
          keep(
            team.id,
            [{ type: "player", id: vet.id }],
            [{ type: "pick", id: pick.id }],
            24 + (userStance === "buy" ? wantScore(userProfile, vet) : 10)
          );
        }
        for (const kid of young.slice(0, 4)) {
          if (kid.position === vet.position && Math.abs(overallOf(kid) - overallOf(vet)) <= 2) {
            continue;
          }
          if (playerStars(kid) > playerStars(vet) + 0.75) continue;
          keep(
            team.id,
            [{ type: "player", id: vet.id }],
            [{ type: "player", id: kid.id }],
            16 + wantScore(userProfile, vet)
          );
          const sweetener = userPicks.find((pick) => pick.round === 2 || pickStars(league, pick) <= 2);
          if (sweetener && playerStars(vet) >= playerStars(kid) + 0.5) {
            keep(
              team.id,
              [{ type: "player", id: vet.id }],
              [
                { type: "player", id: kid.id },
                { type: "pick", id: sweetener.id },
              ],
              20 + wantScore(userProfile, vet)
            );
          }
        }
      }
    }

    // --- User is buying: CPU sells a need-filler for surplus + pick ---
    if (userStance === "buy" && stance !== "buy") {
      const targets = targetsForBuyer(league, userId, team.id).filter(
        (player) => needRank(userProfile, player.position) <= 2
      );
      const pay = movablePlayers(league, userId, { max: 8 }).filter((player) => {
        const hole = needRank(userProfile, player.position);
        return hole >= 2;
      });
      for (const target of targets.slice(0, 3)) {
        for (const pick of userPicks.slice(0, 3)) {
          if (Math.abs(playerStars(target) - pickStars(league, pick)) > 1.8) continue;
          keep(
            team.id,
            [{ type: "player", id: target.id }],
            [{ type: "pick", id: pick.id }],
            26 + wantScore(userProfile, target)
          );
        }
        for (const piece of pay.slice(0, 4)) {
          if (piece.position === target.position) continue;
          const gap = playerStars(target) - playerStars(piece);
          if (gap < 0.25 || gap > 2) continue;
          const sweetener = userPicks.find((pick) => pickStars(league, pick) <= 2.5);
          if (sweetener) {
            keep(
              team.id,
              [{ type: "player", id: target.id }],
              [
                { type: "player", id: piece.id },
                { type: "pick", id: sweetener.id },
              ],
              24 + wantScore(userProfile, target)
            );
          }
        }
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const chosen = hits[0];
  if (!chosen) return null;

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
        tone: "trade" as const,
      },
      ...league.news,
    ].slice(0, 50),
  };
}
