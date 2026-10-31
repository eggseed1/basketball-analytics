/**
 * Players with no NBA line were priced off an empty box, so a first pick
 * landed near the bottom of the scale. The draft slot in the baked bio is
 * the scouting report we have. College box scores are not in this save.
 *
 * Potential for active players is not "current Darko + usage". A cold prior
 * on a 20-year-old first-rounder used to clamp potential to 0 and stamp Bust.
 * Age and draft capital set a floor; production can still push the dial up.
 */

import { buildSheet, sheetHint } from "@/gm/engine/attributes";
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

/** Overall a just-drafted player should open at, from the pick he was. */
export function rookieOverall(round: number, pick: number): number {
  if (round <= 1) return clamp(Math.round(80 - Math.log2(Math.max(1, pick)) * 2.2), 68, 82);
  const spot = pick > 30 ? pick : 30 + pick;
  return clamp(Math.round(66 - (spot - 31) * 0.14), 60, 67);
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
  // Invert overallFromAttributes spine: OVR ≈ 71 + 3.2×impact.
  const impact = Math.round(((overall - 71) / 3.2) * 100) / 100;
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

/**
 * Raise a real rookie who has no NBA sample. Veterans and designed
 * prospects are left on the sheet they already have.
 *
 * Kids who already have an NBA line keep their production ratings, but draft
 * capital still floors potential so a cold Darko prior cannot wipe upside.
 */
export function applyRookieRatings(player: GmPlayer): GmPlayer {
  if (player.simProfile || player.seasonLine?.gp || player.priorLine?.gp) return player;
  const real = Boolean(player.nbaPlayerId) || /^\d+$/.test(player.id);
  if (!real) return player;

  const parsed = parsePlayerDraftInfo(draftText(player));
  const drafted =
    parsed &&
    !parsed.undrafted &&
    parsed.pick != null &&
    parsed.round != null &&
    (parsed.year ?? 0) >= 2024;
  const young = player.age > 0 && player.age <= 22;
  const pick = drafted ? parsed!.pick! : null;

  if (hasNbaSample(player)) {
    if (!drafted || !young || pick == null) return player;
    const floor = estimateActivePotential({
      impact: player.ratings.impact,
      age: player.age,
      draftPick: pick,
    });
    if (player.ratings.potential >= floor - 0.15) return player;
    const ratings = { ...player.ratings, potential: floor };
    const next: GmPlayer = {
      ...player,
      draftLabel: player.draftLabel || draftText(player),
      ratings,
    };
    next.sheet = buildSheet(next, sheetHint(next));
    return next;
  }

  if (!drafted && !young) return player;

  const overall = drafted ? rookieOverall(parsed!.round!, pick!) : 58;
  const potential = drafted ? rookiePotential(pick!) : 4.2;
  const currentOverall = player.sheet?.overall ?? 0;
  if (currentOverall >= overall - 1 && player.ratings.potential >= potential - 0.4) return player;

  const ratings = ratingsFor(overall, potential, player.ratings);
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

