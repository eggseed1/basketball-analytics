/**
 * KnowledgeDate / InformationCutoff gating helpers.
 */

import type { InformationCutoff, KnowledgeDate } from "@/gm/myleague/types";
import { knowledgeGte } from "@/gm/myleague/phase";

/** True if a fact with this cutoff may be shown at `now`. */
export function isFactAvailable(
  cutoff: InformationCutoff,
  now: KnowledgeDate
): boolean {
  if (!knowledgeGte(now, cutoff.availableFrom)) return false;
  if (cutoff.availableUntil && knowledgeGte(now, cutoff.availableUntil)) {
    return false;
  }
  return true;
}

export function filterByKnowledgeDate<T extends { cutoff: InformationCutoff }>(
  items: T[],
  now: KnowledgeDate
): T[] {
  return items.filter((item) => isFactAvailable(item.cutoff, now));
}
