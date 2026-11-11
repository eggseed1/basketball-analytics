/** Player work mentality: a readable tendency, not a predetermined potential ceiling.
 * Hidden development DNA stays stable across the save and is not draft-slot based.
 */
import type { GmPlayer } from "@/gm/types";
import { developmentProfileOf } from "@/gm/engine/development-profile";

export type GmMentality = { label: string; tone: string; rank: number; description: string };

export function playerMentality(player: GmPlayer): GmMentality {
  const profile = developmentProfileOf(player);
  const apt = Object.values(profile.aptitudes).filter((value): value is number => typeof value === "number");
  const average = apt.length ? apt.reduce((a, b) => a + b, 0) / apt.length : 1;
  const score =
    profile.learning * 0.57 +
    profile.adaptability * 0.20 +
    average * 0.23 +
    (profile.learningSurge && profile.learningSurge > 1 ? 0.32 : 0);
  if (score >= 1.25) return {label:"Mamba",tone:"text-emerald-600 dark:text-emerald-400",rank:5,description:"Exceptional drive and learning habits"};
  if (score >= 1.10) return {label:"Relentless",tone:"text-teal-600 dark:text-teal-400",rank:4,description:"Strong work ethic and adaptability"};
  if (score >= 0.99) return {label:"Driven",tone:"text-sky-600 dark:text-sky-400",rank:3,description:"Above-average development habits"};
  if (score >= 0.88) return {label:"Steady",tone:"text-amber-600 dark:text-amber-400",rank:2,description:"Consistent, needs the right opportunity"};
  return {label:"Casual",tone:"text-rose-600 dark:text-rose-400",rank:1,description:"Needs structure and motivation"};
}
