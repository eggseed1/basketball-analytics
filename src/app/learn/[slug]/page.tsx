import Link from "next/link";
import { notFound } from "next/navigation";

import { StatGuideView } from "@/components/learn/stat-guide-view";
import { getStatGuide, listStatGuides } from "@/content/stats/guides";

export function generateStaticParams() {
  return listStatGuides().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getStatGuide(slug);
  if (!guide) return { title: "Stat" };
  return {
    title: guide.shortName,
    description: guide.blurb,
  };
}

export default async function LearnStatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getStatGuide(slug);
  if (!guide) notFound();

  const others = listStatGuides().filter((g) => g.id !== guide.id).slice(0, 6);

  return (
    <main className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <div className="site-prose flex w-full flex-col gap-8 lg:mx-0 lg:max-w-4xl">
        <Link
          href="/learn"
          className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          All stats
        </Link>
        <StatGuideView guide={guide} />
        <section className="mb-8 flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            More stats
          </h2>
          <div className="flex flex-wrap gap-2">
            {others.map((g) => (
              <Link
                key={g.id}
                href={`/learn/${g.slug}`}
                className="rounded-full bg-secondary px-3 py-1.5 text-[13px] font-semibold"
              >
                {g.shortName}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
