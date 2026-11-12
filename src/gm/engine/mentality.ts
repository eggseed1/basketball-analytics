/** Public player mentality: work habits and how a player responds to development.
 * No label is a fixed OVR ceiling. Long-term mentor influence is saved separately.
 */
import type { GmPlayer } from "@/gm/types";
import { developmentProfileOf } from "@/gm/engine/development-profile";

export type MentalityRank = 1 | 2 | 3 | 4 | 5;
export type GmMentality = { label: string; tone: string; rank: MentalityRank; description: string };

const MENTALITIES: Record<MentalityRank, GmMentality> = {
  1: { label: "Casual", tone: "text-rose-600 dark:text-rose-400", rank: 1, description: "Needs structure and motivation" },
  2: { label: "Steady", tone: "text-amber-600 dark:text-amber-400", rank: 2, description: "Consistent, needs the right opportunity" },
  3: { label: "Driven", tone: "text-sky-600 dark:text-sky-400", rank: 3, description: "Above-average development habits" },
  4: { label: "Relentless", tone: "text-teal-600 dark:text-teal-400", rank: 4, description: "Strong work ethic and adaptability" },
  5: { label: "Mamba", tone: "text-emerald-600 dark:text-emerald-400", rank: 5, description: "Exceptional drive and learning habits" },
};

export function playerMentality(player: GmPlayer): GmMentality {
  const profile = developmentProfileOf(player);
  const apt = Object.values(profile.aptitudes).filter((value): value is number => typeof value === "number");
  const average = apt.length ? apt.reduce((a, b) => a + b, 0) / apt.length : 1;
  const score =
    profile.learning * 0.57 +
    profile.adaptability * 0.20 +
    average * 0.23 +
    (profile.learningSurge && profile.learningSurge > 1 ? 0.32 : 0);
  const innate: MentalityRank = score >= 1.25 ? 5 : score >= 1.10 ? 4 :
    score >= 0.99 ? 3 : score >= 0.88 ? 2 : 1;
  // Saved mentorship can permanently improve work habits. A player may still
  // develop their own mentality further, but never loses an earned one on trade.
  const learned = player.mentalityMentor?.rank;
  const rank = learned && learned > innate ? learned : innate;
  const mentality = MENTALITIES[rank];
  return learned && learned > innate
    ? { ...mentality, description: `Learned from ${player.mentalityMentor!.mentorName} after ${player.mentalityMentor!.sharedGames} games together. Continued work and playing time still matter.` }
    : mentality;
}
