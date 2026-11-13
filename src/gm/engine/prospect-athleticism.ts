import type { GmAttributes, GmPlayer } from "@/gm/types";
import { overallFromAttributes } from "@/gm/engine/attributes";
import { clamp, createRng, randInt } from "@/gm/engine/rng";

/**
 * Real combine field calibrations: roughly 7% of tested prospects record a
 * 40"+ maximum running vertical. Elite 3/4-court sprints are a separate,
 * imperfectly correlated physical trait, not a draft-position reward.
 *
 * This is a persistent athletic identity: it is assigned before testing, is
 * independent of the existing draft/scouting RNG, and never boosts raw OVR.
 * It must never rewrite a measured player's attributes or a non-draft pro.
 */
function idSeed(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++)
    h = Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export function calibrateProspectAthleticism(player: GmPlayer): GmPlayer {
  if (player.draftModel !== 2 || !player.sheet ||
      player.athleticProfileVersion === 1 || player.scoutProfile?.combine)
    return player;

  const rng = createRng(idSeed("nba-combine-athletics-v1:" + player.id));
  const { attributes: old } = player.sheet;
  const big = player.position === "C" || player.position === "PF";
  const guard = player.position === "PG" || player.position === "SG";

  // Individual draws leave room for an athletic freak on a low-ranked board,
  // without forcing one pre-scripted superstar in every draft.
  const bounce = rng();
  const vertical = bounce < 0.015 ? randInt(rng, 94, 99)
    : bounce < 0.080 ? randInt(rng, 85, 91)
    : bounce < 0.285 ? randInt(rng, 76, 83)
    : bounce < 0.80 ? randInt(rng, big ? 63 : 68, big ? 75 : 77)
    : randInt(rng, big ? 53 : 57, big ? 66 : 69);

  const paceRoll = rng();
  let speed = paceRoll < 0.012 ? randInt(rng, 96, 99)
    : paceRoll < 0.085 ? randInt(rng, 89, 95)
    : paceRoll < 0.27 ? randInt(rng, 80, 88)
    : paceRoll < 0.83 ? randInt(rng, big ? 59 : guard ? 73 : 68, big ? 72 : guard ? 82 : 78)
    : randInt(rng, big ? 48 : 61, big ? 62 : 70);

  // Some extraordinary leapers are also exceptionally fast; most are not.
  if (vertical >= 94 && rng() < 0.45) speed = Math.max(speed, randInt(rng, 93, 99));
  const agility = clamp(speed + randInt(rng, -8, 8) - (big ? 2 : 0), 48, 99);

  // Physical gifts have useful *on-court* correlates, but never automatically
  // confer handle, shooting touch, rim timing, or superstar potential.
  const next: GmAttributes = {
    ...old,
    speed,
    vertical,
    agility,
    speedWithBall: guard || player.position === "SF"
      ? Math.max(old.speedWithBall, speed >= 85 ? speed - randInt(rng, 5, 14) : old.speedWithBall)
      : old.speedWithBall,
    drivingDunk: Math.max(old.drivingDunk,
      vertical >= 84 ? vertical - randInt(rng, 9, 18) : old.drivingDunk),
    standingDunk: big && vertical >= 84
      ? Math.max(old.standingDunk, vertical - randInt(rng, 10, 18))
      : old.standingDunk,
  };

  // Keep exactly the same entry OVR and all basketball talent/mentality,
  // even when a late-round athlete has elite speed and 44-inch bounce.
  const ovr = player.sheet.overall;
  const base = overallFromAttributes(player.position, next, {
    impact: player.ratings.impact,
    offense: player.ratings.offense,
    defense: player.ratings.defense,
  });
  return {
    ...player,
    athleticProfileVersion: 1,
    sheet: { ...player.sheet, attributes: next, overallOffset: ovr - base },
  };
}
