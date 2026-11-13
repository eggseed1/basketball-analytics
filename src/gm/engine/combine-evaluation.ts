import type { GmPlayer } from "@/gm/types";

/** Athletic upside is an observable skill foundation, not a secret
 * superstar flag or a scripted OVR ceiling. Combine reveals it; it doesn't
 * manufacture athleticism. All bonuses stay conditional on training and reps.
 */
export function athleticTools(player: GmPlayer) {
  const a = player.sheet?.attributes;
  const speed = a?.speed ?? 60, vertical = a?.vertical ?? 60, agility = a?.agility ?? 60;
  const score = Math.round(speed * .36 + vertical * .42 + agility * .22);
  // Rare physical gifts unlock training/badge pathways, but a player must
  // also have the basketball skill required to put those tools to work.
  const leaping = vertical >= 84 &&
    ((a?.drivingDunk ?? 0) >= 67 || (a?.standingDunk ?? 0) >= 75);
  const chaser = speed >= 84 && vertical >= 82 && (a?.block ?? 0) >= 62;
  const burst = speed >= 89 && agility >= 84 && (a?.speedWithBall ?? 0) >= 74;
  const label = vertical >= 94 && speed >= 93 ? "Generational athletic freak" :
    vertical >= 85 && speed >= 89 ? "Elite athletic freak" :
    vertical >= 94 ? "Rare 45-inch leaper" :
    vertical >= 84 ? "Elite vertical leaper" :
    speed >= 95 ? "Exceptional track speed" :
    speed >= 89 ? "Elite sprint athlete" :
    score >= 84 ? "Explosive athlete" : score >= 76 ? "Above-average athlete" :
    score >= 65 ? "Solid athlete" : "Limited athletic tools";
  return {score, label, leaping, chaser, burst};
}
