import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import {
  LEARN_CATEGORIES,
  getLearnConcept,
  learnHrefFor,
  listLearnConcepts,
} from "@/content/learn/registry";
import { relatedLearnLinks } from "@/content/learn/resolve";

export function learnEyebrow(conceptId: string): string {
  const category = getLearnConcept(conceptId)?.category;
  return LEARN_CATEGORIES.find((c) => c.id === category)?.label ?? "Learn";
}

export function LearnPageFooter({
  conceptId,
  relatedIds,
  seeInAction,
}: {
  conceptId: string;
  relatedIds?: string[];
  seeInAction?: Array<{ label: string; href: string }>;
}) {
  const concept = getLearnConcept(conceptId);
  const categoryLabel = learnEyebrow(conceptId);
  const selfHref = concept ? learnHrefFor(concept.id) : null;

  const seen = new Set<string>(selfHref ? [selfHref] : []);
  const sameCategory: Array<{ href: string; label: string }> = [];
  for (const c of listLearnConcepts()) {
    if (!concept || c.category !== concept.category) continue;
    const href = learnHrefFor(c.id);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    sameCategory.push({ href, label: c.shortName });
  }

  const related = relatedLearnLinks(relatedIds ?? concept?.relatedIds ?? []).filter(
    (r) => r.href !== selfHref
  );
  const onSite = seeInAction ?? concept?.seeInAction ?? [];

  if (!related.length && !onSite.length && !sameCategory.length) return null;

  return (
    <footer className="mb-8 flex flex-col gap-5 border-t border-border pt-6">
      {related.length ? (
        <FooterGroup title="Related concepts">
          {related.map((r) => (
            <Chip key={r.href} href={r.href} label={r.label} />
          ))}
        </FooterGroup>
      ) : null}
      {onSite.length ? (
        <FooterGroup title="See it in DRBL">
          {onSite.map((a) => (
            <Chip key={a.href} href={a.href} label={`${a.label} →`} />
          ))}
        </FooterGroup>
      ) : null}
      {sameCategory.length ? (
        <FooterGroup title={`More in ${categoryLabel}`}>
          {sameCategory.map((s) => (
            <Chip key={s.href} href={s.href} label={s.label} />
          ))}
        </FooterGroup>
      ) : null}
    </footer>
  );
}

function FooterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Chip({ href, label }: { href: string; label: string }) {
  return (
    <AppLink
      href={href}
      className="rounded-full bg-secondary px-3 py-1.5 text-[14px] font-semibold hover:bg-secondary/70"
    >
      {label}
    </AppLink>
  );
}
