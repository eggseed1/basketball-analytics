import type { GmPlayer } from "@/gm/types";

/** Athletic upside is an observable skill foundation, not a secret
 * superstar flag or a scripted OVR ceiling. Combine reveals it; it doesn't
 * manufacture athleticism. All bonuses stay conditional on training and reps.
 */
export function athleticTools(player: GmPlayer) {
  const a = player.sheet?.attributes;
  const speed = a?.speed ?? 60, vertical = a?.vertical ?? 60, agility = a?.agility ?? 60;
  const score = Math.round(speed * .36 + vertical * .42 + agility * .22);
  const leaping = vertical >= 87 && score >= 85;
  const chaser = speed >= 86 && vertical >= 84 && (a?.block ?? 0) >= 62;
  const burst = speed >= 89 && agility >= 86 && (a?.speedWithBall ?? 0) >= 75;
  const label = score >= 89 && vertical >= 88 ? "Elite athletic outlier" :
    score >= 84 ? "Explosive athlete" : score >= 76 ? "Above-average athlete" :
    score >= 65 ? "Solid athlete" : "Limited athletic tools";
  return {score, label, leaping, chaser, burst};
}
