import { notFound } from "next/navigation";

import { LearnTopicView } from "@/components/learn/learn-topic-view";
import { StatGuideView } from "@/components/learn/stat-guide-view";
import { AppLink } from "@/components/ui/app-link";
import {
  listAllLearnSlugs,
  relatedLearnLinks,
  resolveLearnPage,
} from "@/content/learn/resolve";
import { getLearnConcept } from "@/content/learn/registry";

export function generateStaticParams() {
  return listAllLearnSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = resolveLearnPage(slug);
  if (!page) return { title: "Learn" };
  if (page.kind === "guide") {
    return { title: page.guide.shortName, description: page.guide.blurb };
  }
  return {
    title: page.topic.shortName,
    description: page.topic.oneSentence,
  };
}

export default async function LearnStatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = resolveLearnPage(slug);
  if (!page) notFound();

  const concept = getLearnConcept(
    page.kind === "guide" ? page.guide.id : page.topic.id
  );
  const relatedFromConcept = relatedLearnLinks(concept?.relatedIds ?? []);
  const seeInAction =
    page.kind === "topic"
      ? page.topic.seeInAction
      : (concept?.seeInAction ?? []);

  const others = listAllLearnSlugs()
    .filter((s) => s !== slug)
    .slice(0, 8)
    .map((s) => {
      const resolved = resolveLearnPage(s);
      if (!resolved) return null;
      const label =
        resolved.kind === "guide"
          ? resolved.guide.shortName
          : resolved.topic.shortName;
      return { slug: s, label };
    })
    .filter(Boolean) as Array<{ slug: string; label: string }>;

  return (
    <main className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <div className="site-prose flex w-full flex-col gap-8 lg:mx-0 lg:max-w-4xl">
        <AppLink
          href="/learn"
          className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          All concepts
        </AppLink>

        {page.kind === "guide" ? (
          <StatGuideView guide={page.guide} />
        ) : (
          <LearnTopicView topic={page.topic} />
        )}

        {page.kind === "guide" && (relatedFromConcept.length || seeInAction.length) ? (
          <section className="flex flex-col gap-4">
            {relatedFromConcept.length ? (
              <div>
                <h2 className="mb-2 text-[15px] font-bold">Related concepts</h2>
                <div className="flex flex-wrap gap-2">
                  {relatedFromConcept.map((r) => (
                    <AppLink
                      key={r.href}
                      href={r.href}
                      className="rounded-full bg-secondary px-3 py-1.5 text-[13px] font-semibold"
                    >
                      {r.label}
                    </AppLink>
                  ))}
                </div>
              </div>
            ) : null}
            {seeInAction.length ? (
              <div>
                <h2 className="mb-2 text-[15px] font-bold">See it in DRBL</h2>
                <ul className="flex flex-col gap-1.5">
                  {seeInAction.map((a) => (
                    <li key={a.href}>
                      <AppLink
                        href={a.href}
                        className="text-[14px] font-semibold underline-offset-2 hover:underline"
                      >
                        {a.label} →
                      </AppLink>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mb-8 flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            More in Learn
          </h2>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <AppLink
                key={o.slug}
                href={`/learn/${o.slug}`}
                className="rounded-full bg-secondary px-3 py-1.5 text-[13px] font-semibold"
              >
                {o.label}
              </AppLink>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
