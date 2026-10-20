import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { LinkCue } from "@/components/ui/link-cue";
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

export async function LearnPageFooter({
  conceptId,
  relatedIds,
  seeInAction,
}: {
  conceptId: string;
  relatedIds?: string[];
  seeInAction?: Array<{ label: string; href: string }>;
}) {
  const t = await getTranslations("LearnPages");
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
        <FooterGroup title={t("relatedConcepts")}>
          {related.map((r) => (
            <Chip key={r.href} href={r.href} label={r.label} />
          ))}
        </FooterGroup>
      ) : null}
      {onSite.length ? (
        <FooterGroup title={t("seeInDrbl")}>
          {onSite.map((a) => (
            <Chip key={a.href} href={a.href} label={a.label} cue />
          ))}
        </FooterGroup>
      ) : null}
      {sameCategory.length ? (
        <FooterGroup title={t("moreInCategory", { category: categoryLabel })}>
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

function Chip({ href, label, cue = false }: { href: string; label: string; cue?: boolean }) {
  return (
    <AppLink
      href={href}
      className="inline-flex items-center gap-0.5 rounded-[4px] border border-border/25 bg-foreground/[0.035] px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
    >
      {label}
      {cue ? <LinkCue /> : null}
    </AppLink>
  );
}
