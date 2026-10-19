/**
 * Players with no NBA line were priced off an empty box, so a first pick
 * landed near the bottom of the scale. The draft slot in the baked bio is
 * the scouting report we have. College box scores are not in this save.
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

function rookiePotential(pick: number): number {
  return clamp(Math.round((9.4 - (pick - 1) * 0.07) * 10) / 10, 4.2, 9.6);
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
  const impact = Math.round(((overall - 76) / 2.35) * 100) / 100;
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
 */
export function applyRookieRatings(player: GmPlayer): GmPlayer {
  if (hasNbaSample(player)) return player;
  const real = Boolean(player.nbaPlayerId) || /^\d+$/.test(player.id);
  if (!real) return player;

  const parsed = parsePlayerDraftInfo(draftText(player));
  const drafted =
    parsed && !parsed.undrafted && parsed.pick != null && parsed.round != null && (parsed.year ?? 0) >= 2024;
  const young = player.age > 0 && player.age <= 22;
  if (!drafted && !young) return player;

  const pick = drafted ? parsed!.pick! : null;
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
