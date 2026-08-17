/**
 * Resolve Learn pedagogy from guides + topics for a single slug.
 */

import { getStatGuide, listStatGuides, type StatGuide } from "@/content/stats/guides";
import {
  getLearnTopic,
  listLearnTopics,
  type LearnTopic,
} from "@/content/learn/topics";
import { getLearnConcept } from "@/content/learn/registry";

export type ResolvedLearnPage =
  | { kind: "guide"; guide: StatGuide }
  | { kind: "topic"; topic: LearnTopic };

export function resolveLearnPage(slug: string): ResolvedLearnPage | null {
  const guide = getStatGuide(slug);
  if (guide) return { kind: "guide", guide };
  const topic = getLearnTopic(slug);
  if (topic) return { kind: "topic", topic };
  return null;
}

export function listAllLearnSlugs(): string[] {
  const slugs = new Set<string>();
  for (const g of listStatGuides()) slugs.add(g.slug);
  for (const t of listLearnTopics()) slugs.add(t.slug);
  return [...slugs];
}

export function relatedLearnLinks(ids: string[]): Array<{
  label: string;
  href: string;
}> {
  const out: Array<{ label: string; href: string }> = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const concept = getLearnConcept(id);
    if (!concept?.learnSlug) continue;
    const href = `/learn/${concept.learnSlug}`;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ label: concept.shortName, href });
  }
  return out;
}
