/**
 * Players with no NBA line were priced off an empty box, so a first pick
 * landed near the bottom of the scale. The draft slot in the baked bio is
 * the scouting report we have. College box scores are not in this save.
 *
 * Potential for active players is not "current Darko + usage". A cold prior
 * on a 20-year-old first-rounder used to clamp potential to 0 and stamp Bust.
 * Age and draft capital set a floor; production can still push the dial up.
 *
 * Kids who already have an NBA sample can still land absurdly low when DARKO
 * is cold (Hugo Gonzalez 65, Risacher 66). Draft capital also floors current
 * strength so a first-rounder on the roster does not read like scrap heap.
 */

import { buildSheet, sheetHint } from "@/gm/engine/attributes";
import { overallToImpact } from "@/gm/engine/true-strength";
import { clamp } from "@/gm/engine/rng";
import { getBundledPlayerBio } from "@/data/runtime/player-bio-snapshot";
import { parsePlayerDraftInfo } from "@/lib/player-draft";
import type { GmPlayer, GmRatings } from "@/gm/types";

function draftText(player: GmPlayer): string | undefined {
  if (player.draftLabel) return player.draftLabel;
  const bio = getBundledPlayerBio(player.nbaPlayerId ?? player.id, [
    player.id,
    player.nbaPlayerId,
  ]);
  return bio?.draftInfo || undefined;
}

function hasNbaSample(player: GmPlayer): boolean {
  const line = player.nbaSeason;
  return Boolean(line && line.gp >= 15 && line.min >= 150);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Overall a just-drafted player should open at, from the pick he was. */
export function rookieOverall(round: number, pick: number): number {
  // Late firsts open ~72, lottery mid-70s, top 3 ~82–84. Old curve left
  // pick-28 kids at 68–69, which reads like a two-way on the roster card.
  if (round <= 1) {
    return clamp(Math.round(84 - Math.log2(Math.max(1, pick)) * 2.35), 72, 84);
  }
  const spot = pick > 30 ? pick : 30 + pick;
  return clamp(Math.round(68 - (spot - 31) * 0.12), 63, 70);
}

/**
 * Pull a cold NBA sample up toward draft capital without minting a finished star.
 * Lottery gets a stronger pull; late firsts get a hardish floor near the open OVR.
 */
export function draftCapitalImpactFloor(args: {
  impact: number;
  age: number;
  round: number;
  pick: number;
}): number {
  const floorImpact = overallToImpact(rookieOverall(args.round, args.pick));
  if (!(args.impact < floorImpact - 0.05)) return args.impact;

  const pick = Math.max(1, args.pick);
  const draftWeight =
    pick <= 5 ? 0.72 : pick <= 14 ? 0.62 : args.round <= 1 ? 0.55 : 0.45;
  const ageMul = args.age <= 19 ? 1 : args.age <= 21 ? 0.92 : 0.78;
  const w = clamp(draftWeight * ageMul, 0.35, 0.78);
  const blended = args.impact * (1 - w) + floorImpact * w;

  // Cap the one-shot lift so a true bust season cannot jump to the open OVR.
  const liftCap =
    pick <= 5 ? 3.6 : pick <= 14 ? 2.9 : args.round <= 1 ? 2.4 : 1.6;
  const capped = Math.min(floorImpact, args.impact + liftCap);
  return round2(Math.max(args.impact, Math.min(floorImpact, Math.max(blended, capped * 0.85 + blended * 0.15))));
}

export function rookiePotential(pick: number): number {
  return clamp(Math.round((9.4 - (pick - 1) * 0.07) * 10) / 10, 4.2, 9.6);
}

function usageFraction(usagePct: number | undefined): number {
  if (usagePct == null || !Number.isFinite(usagePct) || usagePct <= 0) return 0.18;
  return usagePct > 1 ? usagePct / 100 : usagePct;
}

/**
 * Upside on the 0–10 dial used by sheet ceilings / growth.
 * League-average impact sits near 4. Young players keep draft room even when
 * the current Darko prior is underwater.
 */
export function estimateActivePotential(args: {
  impact: number;
  age: number;
  usagePct?: number;
  draftPick?: number | null;
}): number {
  const impact = Number.isFinite(args.impact) ? args.impact : -1;
  const age = args.age > 0 ? args.age : 26;
  const usg = usageFraction(args.usagePct);
  const fromImpact = clamp(4 + impact * 1.2, 0.5, 10);
  const usgTilt = (usg - 0.16) * 5;

  let ageTilt = 0;
  if (age <= 19) ageTilt = 2.6;
  else if (age <= 21) ageTilt = 2.1;
  else if (age <= 23) ageTilt = 1.15;
  else if (age <= 26) ageTilt = 0.35;
  else if (age >= 34) ageTilt = -2.4;
  else if (age >= 31) ageTilt = -1.5;
  else if (age >= 29) ageTilt = -0.7;

  let draftFloor = 0;
  const pick = args.draftPick;
  if (pick != null && pick > 0 && age <= 23) {
    const raw = rookiePotential(pick);
    draftFloor = Math.round(raw * (age <= 21 ? 0.92 : 0.8) * 10) / 10;
  }

  const blended = Math.max(fromImpact + ageTilt + usgTilt, draftFloor);
  return Math.round(clamp(blended, 0, 10) * 10) / 10;
}

function minutesFor(pick: number | null): number {
  if (pick == null) return 12;
  if (pick <= 3) return 32;
  if (pick <= 10) return 28;
  if (pick <= 20) return 24;
  if (pick <= 30) return 20;
  if (pick <= 45) return 16;
  return 12;
}

function ratingsFor(overall: number, potential: number, current: GmRatings): GmRatings {
  // Same spine as live OVR: OVR ≈ 72 + 3.45×impact.
  const impact = overallToImpact(overall);
  return {
    ...current,
    impact,
    offense: Math.round(impact * 0.7 * 100) / 100,
    defense: Math.round(impact * 0.3 * 100) / 100,
    shooting: clamp(Math.round(48 + overall * 0.32), 45, 86),
    finishing: clamp(Math.round(overall - 4), 45, 90),
    playmaking: clamp(Math.round(overall - 8), 40, 88),
    rebounding: clamp(Math.round(overall - 10), 40, 88),
    durability: Math.max(current.durability, 74),
    potential,
  };
}

function raiseLatentToImpact(current: GmRatings, nextImpact: number): GmRatings {
  const delta = nextImpact - current.impact;
  if (Math.abs(delta) < 0.02) {
    return { ...current, impact: round2(nextImpact) };
  }
  const offenseShare = delta > 0 ? 0.62 : 0.45;
  return {
    ...current,
    impact: round2(nextImpact),
    offense: round2(clamp(current.offense + delta * offenseShare, -8, 14)),
    defense: round2(clamp(current.defense + delta * (1 - offenseShare), -6, 10)),
  };
}

/**
 * Raise a real rookie who has no NBA sample. Veterans and designed
 * prospects are left on the sheet they already have.
 *
 * Kids who already have an NBA line keep production as the prior, but draft
 * capital floors both potential and current strength so a cold Darko season
 * cannot stamp a first-rounder as scrap-heap overall.
 *
 * Draft-open overlays are age-gated. Without that, a 30-year-old with 0 GP
 * (Ben Simmons) or a 25-year-old on a 4-game line (Wiseman) inherited their
 * original #1/#2 pick overall and sat in the low 80s.
 */
export function applyRookieRatings(player: GmPlayer): GmPlayer {
  if (player.simProfile || player.seasonLine?.gp || player.priorLine?.gp) return player;
  const real = Boolean(player.nbaPlayerId) || /^\d+$/.test(player.id);
  if (!real) return player;

  const parsed = parsePlayerDraftInfo(draftText(player));
  // Age is the gate. A 22-year-old first-rounder still carries draft capital
  // even if the pick year is two seasons back.
  const drafted =
    parsed &&
    !parsed.undrafted &&
    parsed.pick != null &&
    parsed.round != null;
  const young = player.age > 0 && player.age <= 22;
  const pick = drafted ? parsed!.pick! : null;
  const round = drafted ? parsed!.round! : null;

  if (hasNbaSample(player)) {
    if (!drafted || !young || pick == null || round == null) return player;
    const potFloor = estimateActivePotential({
      impact: player.ratings.impact,
      age: player.age,
      draftPick: pick,
    });
    const nextImpact = draftCapitalImpactFloor({
      impact: player.ratings.impact,
      age: player.age,
      round,
      pick,
    });
    const needPot = player.ratings.potential < potFloor - 0.15;
    const needImpact = nextImpact > player.ratings.impact + 0.05;
    if (!needPot && !needImpact) return player;

    let ratings = { ...player.ratings };
    if (needPot) ratings = { ...ratings, potential: potFloor };
    if (needImpact) ratings = raiseLatentToImpact(ratings, nextImpact);
    const next: GmPlayer = {
      ...player,
      draftLabel: player.draftLabel || draftText(player),
      ratings,
    };
    next.sheet = buildSheet(next, sheetHint(next));
    return next;
  }

  // No / thin NBA sample. Veterans keep seed ratings — do not re-open them
  // at their original draft slot (Simmons / Wiseman bug).
  if (!young) return player;

  const overall = drafted && round != null && pick != null ? rookieOverall(round, pick) : 58;
  const potential = drafted && pick != null ? rookiePotential(pick) : 4.2;
  const currentOverall = player.sheet?.overall ?? 0;
  if (currentOverall >= overall - 1 && player.ratings.potential >= potential - 0.4) {
    return player;
  }

  // Soften lottery opens when a thin on-court sample already looks cold.
  // #1 pick with 2 GP of replacement DARKO should not sit at a finished 84.
  let openOverall = overall;
  const line = player.nbaSeason;
  if (
    drafted &&
    round != null &&
    pick != null &&
    line &&
    line.gp > 0 &&
    line.gp < 15 &&
    player.ratings.impact < 0.5
  ) {
    const soft = clamp(
      Math.round(overall - (0.5 - player.ratings.impact) * 2.2),
      Math.min(overall, 74),
      overall
    );
    openOverall = Math.min(
      overall,
      Math.max(soft, rookieOverall(round, Math.min(pick + 8, 30)))
    );
  }

  const ratings = ratingsFor(openOverall, potential, player.ratings);
  const next: GmPlayer = {
    ...player,
    draftLabel: player.draftLabel || (drafted ? draftText(player) : undefined),
    ratings,
    minutesPreference: Math.max(player.minutesPreference || 0, minutesFor(pick)),
    scouted: {
      impact: ratings.impact,
      offense: ratings.offense,
      defense: ratings.defense,
      uncertainty: drafted && (pick ?? 60) <= 14 ? 0.35 : 0.55,
    },
  };
  if (!next.college) {
    const bio = getBundledPlayerBio(player.nbaPlayerId ?? player.id, [player.id, player.nbaPlayerId]);
    if (bio?.college) next.college = bio.college;
  }
  next.sheet = buildSheet(next, sheetHint(next));
  return next;
}

