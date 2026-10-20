/**
 * Incoming trade offers. A team calls during the season, the sim stops,
 * and the user can change the package before answering.
 *
 * Prefer juicy mutual-need swaps: each side sends surplus at a position the
 * other club actually needs. Call volume follows a real calendar.
 */

import type {
  GmDeclinedOffer,
  GmDraftPick,
  GmIncomingOffer,
  GmLeagueState,
  GmPlayer,
  GmPosition,
  GmTradeAsset,
} from "@/gm/types";
import { evaluateTrade } from "@/gm/engine/trades";
import { uid } from "@/gm/engine/rng";
import { tradeDeadlineDay } from "@/gm/engine/schedule";
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
  surplusRank,
  targetsForBuyer,
  wantScore,
  type RosterProfile,
} from "@/gm/engine/roster-fit";

/** Quiet stretch after any answer before another club can call. */
const OFFER_GAP_DAYS = 7;
/** Same caller stays away after a hard pass. */
const TEAM_COOLDOWN_DAYS = 14;
/** Exact package stays dead after a decline. */
const PACKAGE_COOLDOWN_DAYS = 45;

/**
 * How hot the trade market is from tip-off (0) to the deadline (1).
 * Mirrors the real NBA: almost nothing in October, then a ramp into February.
 */
export function tradeMarketHeat(day: number, deadlineDay: number): number {
  if (day < 12 || deadlineDay <= 0 || day >= deadlineDay) return 0;
  const p = day / deadlineDay;
  if (p < 0.15) return 0.03;
  if (p < 0.32) return 0.08;
  if (p < 0.5) return 0.18;
  if (p < 0.68) return 0.32;
  if (p < 0.85) return 0.55;
  return 0.85;
}

/** Daily chance an offer is considered. Pass `roll` (0–1) to make tests deterministic. */
export function offerDay(
  day: number,
  shopping: boolean,
  deadlineDay = 110,
  roll?: number
): boolean {
  const heat = tradeMarketHeat(day, deadlineDay);
  if (heat <= 0) return false;
  // A few calls across the year, denser near the deadline — not every other night.
  const chance = Math.min(0.2, heat * (shopping ? 0.16 : 0.09));
  const t =
    roll ??
    (((((day * 2654435761) >>> 0) ^ ((deadlineDay * 1597334677) >>> 0)) >>> 0) %
      10000) /
      10000;
  return t < chance;
}

function assetKey(asset: GmTradeAsset): string {
  if (asset.type === "cash") return `cash:${asset.cashM ?? 0}`;
  return `${asset.type}:${asset.id}`;
}

/** Stable id for a proposed package so declines can block repeats. */
export function offerFingerprint(
  fromTeamId: string,
  fromAssets: GmTradeAsset[],
  toAssets: GmTradeAsset[]
): string {
  const from = [...fromAssets].map(assetKey).sort().join(",");
  const to = [...toAssets].map(assetKey).sort().join(",");
  return `${fromTeamId}|${from}|${to}`;
}

function pruneDeclines(list: GmDeclinedOffer[] | undefined, day: number): GmDeclinedOffer[] {
  return (list ?? []).filter((entry) => day - entry.day < PACKAGE_COOLDOWN_DAYS);
}

function isBlockedOffer(
  league: GmLeagueState,
  fromTeamId: string,
  fromAssets: GmTradeAsset[],
  toAssets: GmTradeAsset[]
): boolean {
  const day = league.day;
  const declines = pruneDeclines(league.declinedOffers, day);
  const key = offerFingerprint(fromTeamId, fromAssets, toAssets);
  if (declines.some((entry) => entry.key === key)) return true;
  // Same club just got waved off — give them two weeks.
  if (
    declines.some(
      (entry) =>
        entry.fromTeamId === fromTeamId && day - entry.day < TEAM_COOLDOWN_DAYS
    )
  ) {
    return true;
  }
  return false;
}

/** Record a pass so that package (and caller) cools off. */
export function recordDeclinedOffer(
  league: GmLeagueState,
  offer: GmIncomingOffer
): GmLeagueState {
  const key = offerFingerprint(offer.fromTeamId, offer.fromAssets, offer.toAssets);
  const declinedOffers = [
    { key, fromTeamId: offer.fromTeamId, day: league.day },
    ...pruneDeclines(league.declinedOffers, league.day).filter((entry) => entry.key !== key),
  ].slice(0, 40);
  return {
    ...league,
    incomingOffer: undefined,
    declinedOffers,
    lastOfferResolvedDay: league.day,
  };
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

function playersOf(league: GmLeagueState, assets: GmTradeAsset[]): GmPlayer[] {
  return assets
    .filter((asset) => asset.type === "player")
    .map((asset) => league.players.find((player) => player.id === asset.id))
    .filter((player): player is GmPlayer => Boolean(player));
}

/**
 * A live offer (or counter) both clubs would actually clear.
 * Uses the same evaluateTrade bar as Propose — both directions — so we never
 * surface a package the caller would reject if the user sent it back.
 */
export function offerIsFair(
  league: GmLeagueState,
  cpuId: string,
  userId: string,
  cpuAssets: GmTradeAsset[],
  userAssets: GmTradeAsset[]
): { ok: boolean; reason?: string; fromValue?: number; toValue?: number } {
  if (!cpuAssets.length || !userAssets.length) {
    return { ok: false, reason: "Both sides need a piece." };
  }
  // CPU → user: legal + the user gets enough on their board.
  const userView = evaluateTrade(league, cpuId, userId, cpuAssets, userAssets);
  if (!userView.ok) {
    return { ok: false, reason: userView.reason };
  }
  // User → CPU: legal + the caller gets enough on their board.
  // (Old code only checked "CPU does not overpay by cushion" and soft-ignored
  // user-side value fails, so the sim offered deals Propose would reject.)
  const cpuView = evaluateTrade(league, userId, cpuId, userAssets, cpuAssets);
  if (!cpuView.ok) {
    return {
      ok: false,
      reason: cpuView.reason ?? "They will not do that deal.",
    };
  }
  return {
    ok: true,
    fromValue: userView.fromValue,
    toValue: userView.toValue,
  };
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
  kind: "swap" | "buy" | "sell";
};

/** Stable shuffle so offer days do not always scan the same clubs first. */
function shuffledTeams(league: GmLeagueState) {
  const teams = league.teams.filter(
    (team) => team.id !== league.userTeamId && !team.id.startsWith("as-")
  );
  const out = [...teams];
  let seed = (league.day * 9973 + league.season * 131) >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Meaningful rotation piece — not a 12-minute end-of-bench body. */
function isJuicyPiece(player: GmPlayer): boolean {
  return overallOf(player) >= 75 || playerStars(player) >= 2.4;
}

/** Surplus the club can spare at a position the other side needs. */
function surplusForNeed(
  league: GmLeagueState,
  giverId: string,
  giverProfile: RosterProfile,
  needPositions: GmPosition[],
  opts?: { max?: number; minOverall?: number }
): GmPlayer[] {
  const needs = new Set(needPositions.slice(0, 3));
  const min = opts?.minOverall ?? 74;
  return movablePlayers(league, giverId, { max: 12, minOverall: min })
    .filter((player) => {
      if (!needs.has(player.position)) return false;
      if (!isJuicyPiece(player)) return false;
      // Prefer depth/surplus over ripping the giver's own top need.
      const theirHole = needRank(giverProfile, player.position);
      const deep = surplusRank(giverProfile, player.position);
      if (theirHole <= 1 && deep > 1) return false;
      return deep <= 2 || theirHole >= 2;
    })
    .sort(
      (a, b) =>
        surplusRank(giverProfile, a.position) - surplusRank(giverProfile, b.position) ||
        overallOf(b) - overallOf(a)
    )
    .slice(0, opts?.max ?? 5);
}

function pickSweetener(
  picks: GmDraftPick[],
  league: GmLeagueState,
  maxStars: number
) {
  return picks.find((pick) => pickStars(league, pick) <= maxStars) ?? null;
}

function offerNote(
  league: GmLeagueState,
  cpuId: string,
  cpuAssets: GmTradeAsset[],
  userAssets: GmTradeAsset[],
  kind: Candidate["kind"]
): string {
  const city = league.teams.find((team) => team.id === cpuId)?.city ?? "A team";
  const cpuPlayers = playersOf(league, cpuAssets);
  const userPlayers = playersOf(league, userAssets);
  const cpuPos = cpuPlayers.map((player) => player.position).join("/");
  const userPos = userPlayers.map((player) => player.position).join("/");
  const packageBit = `${packageLabel(league, cpuAssets)} for ${packageLabel(league, userAssets)}`;
  if (kind === "swap" && cpuPos && userPos && cpuPos !== userPos) {
    return `${city} wants ${userPos} help and will send ${cpuPos} depth: ${packageBit}.`;
  }
  if (kind === "buy" && userPlayers[0]) {
    return `${city} is hunting ${userPlayers[0].position} help: ${packageBit}.`;
  }
  if (kind === "sell" && cpuPlayers[0]) {
    return `${city} is shopping ${cpuPlayers[0].position} and wants your ${userPos || "package"}: ${packageBit}.`;
  }
  return `${city} sends ${packageBit}.`;
}

function candidates(league: GmLeagueState): GmIncomingOffer | null {
  const userId = league.userTeamId;
  const userTeam = league.teams.find((team) => team.id === userId);
  if (!userTeam) return null;

  const userProfile = rosterProfile(league, userId);
  const userStance = userProfile.stance;
  const userNeeds = userProfile.needs.slice(0, 3);
  const userPicks = (userTeam.draftPicks ?? [])
    .filter((pick) => pick.season >= league.season)
    .sort((a, b) => pickStars(league, b) - pickStars(league, a));

  const box: { best: Candidate | null } = { best: null };
  let scanned = 0;
  const TEAM_BUDGET = 18;
  const GOOD_ENOUGH = 55;

  const keep = (
    cpuId: string,
    cpuAssets: GmTradeAsset[],
    userAssets: GmTradeAsset[],
    motive: number,
    kind: Candidate["kind"]
  ) => {
    if (isBlockedOffer(league, cpuId, cpuAssets, userAssets)) return;
    if (!fitOk(league, cpuId, userId, cpuAssets, userAssets)) return;
    const verdict = offerIsFair(league, cpuId, userId, cpuAssets, userAssets);
    if (!verdict.ok) return;
    const fromValue = verdict.fromValue ?? 0;
    const toValue = verdict.toValue ?? 0;
    const cpuIncoming = playersOf(league, userAssets);
    const userIncoming = playersOf(league, cpuAssets);
    const cpuDelta = fitDelta(league, cpuId, cpuIncoming, playersOf(league, cpuAssets));
    const userDelta = fitDelta(league, userId, userIncoming, playersOf(league, userAssets));
    // Both clubs should feel a real roster bump on juicy offers.
    if (kind === "swap" && (cpuDelta < 4 || userDelta < 4)) return;
    const gap = Math.abs(fromValue - toValue);
    const juice =
      (kind === "swap" ? 28 : kind === "buy" ? 10 : 6) +
      Math.min(24, Math.max(0, cpuDelta) + Math.max(0, userDelta)) * 0.35;
    const score = motive + cpuDelta + userDelta + juice - gap * 0.3;
    if (!box.best || score > box.best.score) {
      box.best = { cpuId, cpuAssets, userAssets, score, kind };
    }
  };

  for (const team of shuffledTeams(league)) {
    scanned += 1;
    const stance = tradeStance(league, team.id);
    const cpuProfile = rosterProfile(league, team.id);
    const cpuNeeds = cpuProfile.needs.slice(0, 3);
    const cpuPicks = team.draftPicks
      .filter((pick) => pick.season >= league.season)
      .sort((a, b) => pickStars(league, b) - pickStars(league, a));

    // --- Mutual need swap: each side fills the other's hole ---
    const cpuOffers = surplusForNeed(league, team.id, cpuProfile, userNeeds, {
      max: 5,
      minOverall: 74,
    });
    const userOffers = surplusForNeed(league, userId, userProfile, cpuNeeds, {
      max: 5,
      minOverall: 74,
    });

    for (const theirs of cpuOffers) {
      for (const ours of userOffers) {
        if (theirs.position === ours.position) continue;
        // Must actually plug a top need on the receiving side.
        if (needRank(userProfile, theirs.position) > 2) continue;
        if (needRank(cpuProfile, ours.position) > 2) continue;
        const starGap = playerStars(theirs) - playerStars(ours);
        if (Math.abs(starGap) > 2.2) continue;

        // Straight swap when close.
        if (Math.abs(starGap) <= 0.85) {
          keep(
            team.id,
            [{ type: "player", id: theirs.id }],
            [{ type: "player", id: ours.id }],
            40 + wantScore(userProfile, theirs) + wantScore(cpuProfile, ours),
            "swap"
          );
        }

        // CPU sweetens when asking for the better piece.
        if (starGap < -0.4) {
          const sweet = pickSweetener(cpuPicks, league, 2.6);
          if (sweet) {
            keep(
              team.id,
              [
                { type: "player", id: theirs.id },
                { type: "pick", id: sweet.id },
              ],
              [{ type: "player", id: ours.id }],
              36 + wantScore(userProfile, theirs) + wantScore(cpuProfile, ours),
              "swap"
            );
          }
        }

        // User sweetens (CPU asks for pick too) when offering the better piece.
        if (starGap > 0.45) {
          const sweet = pickSweetener(userPicks, league, 2.6);
          if (sweet) {
            keep(
              team.id,
              [{ type: "player", id: theirs.id }],
              [
                { type: "player", id: ours.id },
                { type: "pick", id: sweet.id },
              ],
              38 + wantScore(userProfile, theirs) + wantScore(cpuProfile, ours),
              "swap"
            );
          }
        }

        // 2-for-1: CPU sends need-filler + spare for one of ours.
        if (starGap < -0.2 && overallOf(ours) >= 78) {
          const extra = cpuOffers.find(
            (player) =>
              player.id !== theirs.id &&
              player.position !== ours.position &&
              surplusRank(cpuProfile, player.position) <= 2
          );
          if (extra) {
            keep(
              team.id,
              [
                { type: "player", id: theirs.id },
                { type: "player", id: extra.id },
              ],
              [{ type: "player", id: ours.id }],
              34 + wantScore(cpuProfile, ours),
              "swap"
            );
          }
        }
      }
    }

    // --- Buyer CPU: chase a need-filler with surplus + pick ---
    if (stance === "buy" || stance === "stay") {
      const targets = targetsForBuyer(league, team.id, userId)
        .filter(
          (player) =>
            needRank(cpuProfile, player.position) <= 2 && isJuicyPiece(player)
        )
        .slice(0, 4);
      const filler = surplusForNeed(league, team.id, cpuProfile, userNeeds, {
        max: 4,
        minOverall: 72,
      }).filter((player) => needRank(cpuProfile, player.position) >= 2);

      for (const wanted of targets) {
        for (const piece of filler.slice(0, 4)) {
          if (piece.position === wanted.position) continue;
          const gap = playerStars(wanted) - playerStars(piece);
          if (gap < 0.2 || gap > 2.1) continue;
          const sweetener = pickSweetener(cpuPicks, league, 2.7);
          if (sweetener && gap >= 0.55) {
            keep(
              team.id,
              [
                { type: "player", id: piece.id },
                { type: "pick", id: sweetener.id },
              ],
              [{ type: "player", id: wanted.id }],
              30 + wantScore(cpuProfile, wanted) + wantScore(userProfile, piece),
              "buy"
            );
          } else if (gap <= 1.0 && needRank(userProfile, piece.position) <= 2) {
            keep(
              team.id,
              [{ type: "player", id: piece.id }],
              [{ type: "player", id: wanted.id }],
              24 + wantScore(cpuProfile, wanted) + wantScore(userProfile, piece),
              "buy"
            );
          }
        }
        // Pick-only buys stay rare and only for real stars.
        if (overallOf(wanted) >= 82) {
          for (const pick of cpuPicks.slice(0, 1)) {
            if (Math.abs(playerStars(wanted) - pickStars(league, pick)) > 1.5) continue;
            keep(
              team.id,
              [{ type: "pick", id: pick.id }],
              [{ type: "player", id: wanted.id }],
              18 + wantScore(cpuProfile, wanted),
              "buy"
            );
          }
        }
      }
    }

    // --- Seller CPU: move a vet who fills the user's need ---
    if (stance === "sell") {
      const shop = targetsForBuyer(league, userId, team.id)
        .filter(
          (player) =>
            needRank(userProfile, player.position) <= 2 &&
            isJuicyPiece(player) &&
            (player.age >= 27 ||
              (player.contract?.yearsRemaining ?? 99) <= 1 ||
              overallOf(player) >= 80)
        )
        .slice(0, 3);
      const pay = surplusForNeed(league, userId, userProfile, cpuNeeds, {
        max: 4,
        minOverall: 72,
      });

      for (const vet of shop) {
        for (const kid of pay.slice(0, 3)) {
          if (kid.position === vet.position) continue;
          if (playerStars(kid) > playerStars(vet) + 0.9) continue;
          keep(
            team.id,
            [{ type: "player", id: vet.id }],
            [{ type: "player", id: kid.id }],
            28 + wantScore(userProfile, vet) + wantScore(cpuProfile, kid),
            "sell"
          );
          const sweetener = pickSweetener(userPicks, league, 2.2);
          if (sweetener && playerStars(vet) >= playerStars(kid) + 0.4) {
            keep(
              team.id,
              [{ type: "player", id: vet.id }],
              [
                { type: "player", id: kid.id },
                { type: "pick", id: sweetener.id },
              ],
              32 + wantScore(userProfile, vet),
              "sell"
            );
          }
        }
      }
    }

    // --- User buying: CPU sells need-filler for surplus that helps them ---
    if (userStance === "buy" && stance !== "buy") {
      const targets = targetsForBuyer(league, userId, team.id)
        .filter(
          (player) =>
            needRank(userProfile, player.position) <= 2 && isJuicyPiece(player)
        )
        .slice(0, 3);
      const pay = surplusForNeed(league, userId, userProfile, cpuNeeds, {
        max: 4,
        minOverall: 72,
      });
      for (const target of targets) {
        for (const piece of pay.slice(0, 3)) {
          if (piece.position === target.position) continue;
          const gap = playerStars(target) - playerStars(piece);
          if (gap < 0.2 || gap > 2.1) continue;
          const sweetener = pickSweetener(userPicks, league, 2.6);
          if (sweetener) {
            keep(
              team.id,
              [{ type: "player", id: target.id }],
              [
                { type: "player", id: piece.id },
                { type: "pick", id: sweetener.id },
              ],
              30 + wantScore(userProfile, target) + wantScore(cpuProfile, piece),
              "buy"
            );
          } else if (gap <= 1.0) {
            keep(
              team.id,
              [{ type: "player", id: target.id }],
              [{ type: "player", id: piece.id }],
              24 + wantScore(userProfile, target) + wantScore(cpuProfile, piece),
              "buy"
            );
          }
        }
      }
    }

    if (box.best && box.best.score >= GOOD_ENOUGH && box.best.kind === "swap") break;
    if (scanned >= TEAM_BUDGET && box.best) break;
  }

  const chosen = box.best;
  if (!chosen) return null;

  return {
    id: uid("offer"),
    fromTeamId: chosen.cpuId,
    toTeamId: userId,
    fromAssets: chosen.cpuAssets,
    toAssets: chosen.userAssets,
    day: league.day,
    note: offerNote(
      league,
      chosen.cpuId,
      chosen.cpuAssets,
      chosen.userAssets,
      chosen.kind
    ),
  };
}

export function considerIncomingOffer(league: GmLeagueState): GmLeagueState {
  if (league.phase !== "regular" || league.tradeDeadlinePassed || league.incomingOffer) return league;
  if (
    league.lastOfferResolvedDay != null &&
    league.day - league.lastOfferResolvedDay < OFFER_GAP_DAYS
  ) {
    return league;
  }
  const shopping = (league.teams.find((team) => team.id === league.userTeamId)?.tradeBlock ?? []).length > 0;
  // Toy / partial schedules can report a tiny deadline; keep a real-season floor.
  const deadline = league.schedule?.length
    ? Math.max(tradeDeadlineDay(league.schedule), 100)
    : 110;
  if (!offerDay(league.day, shopping, deadline)) return league;
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
