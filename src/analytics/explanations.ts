/**
 * Metric pedagogy - derived from the canonical Learn registry + guides.
 * Keep UI short; full copy lives on /learn/[slug].
 */

import { getLearnConcept, listLearnConcepts } from "@/content/learn/registry";
import { learnHrefFor } from "@/content/learn/resolve";
import { getStatGuide } from "@/content/stats/guides";

export type MetricExplanation = {
  id: string;
  label: string;
  /** One-line plain English (tooltip). */
  plain: string;
  learnHref: string | null;
};

export function explainMetric(id: string): MetricExplanation | null {
  const concept = getLearnConcept(id);
  if (!concept) return null;

  // Prefer guide blurb when the Learn page is a STAT_GUIDE.
  const guide = concept.learnSlug ? getStatGuide(concept.learnSlug) : undefined;
  const plain = guide?.blurb ?? concept.tooltip;

  return {
    id: concept.id,
    label: concept.shortName,
    plain,
    learnHref: concept.learnSlug
      ? learnHrefFor(concept.id, concept.learnSlug)
      : null,
  };
}

export function listExplainedMetrics(): MetricExplanation[] {
  return listLearnConcepts()
    .filter((c) => c.showTooltip || c.learnSlug)
    .map((c) => explainMetric(c.id)!)
    .filter(Boolean);
}

/** Concepts that should offer MetricHelp in UI. */
export function listTooltipConcepts() {
  return listLearnConcepts().filter((c) => c.showTooltip);
}
