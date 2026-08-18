import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { StatGuideView } from "@/components/learn/stat-guide-view";
import { AppLink } from "@/components/ui/app-link";
import { getStatGuide } from "@/content/stats/guides";
import { getLearnConcept } from "@/content/learn/registry";
import { relatedLearnLinks } from "@/content/learn/resolve";

export const metadata: Metadata = {
  title: "WAR1",
  description: "DRBL's realized season-value statistic",
};

export default function LearnWar1Page() {
  const guide = getStatGuide("war1");
  if (!guide) notFound();

  const concept = getLearnConcept(guide.id);
  const related = relatedLearnLinks(concept?.relatedIds ?? []);

  return (
    <main className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <div className="site-prose flex w-full flex-col gap-8 lg:mx-0 lg:max-w-4xl">
        <AppLink
          href="/learn/drbl"
          className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          ← DRBL overview
        </AppLink>

        <StatGuideView guide={guide} />

        {related.length > 0 ? (
          <section className="flex flex-col gap-2 border-t border-border pt-6">
            <h2 className="text-lg font-semibold">Related</h2>
            <ul className="flex flex-wrap gap-2">
              {related.map((r) => (
                <li key={r.href}>
                  <AppLink
                    href={r.href}
                    className="text-sm font-medium underline-offset-2 hover:underline"
                  >
                    {r.label}
                  </AppLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
