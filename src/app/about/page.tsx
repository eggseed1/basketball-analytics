import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { SuggestionBox } from "@/components/about/suggestion-box";
import { PageHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("Legal");
  return {
    alternates: { canonical: "/about" },
    title: t("aboutMetaTitle"),
    description: t("aboutMetaDescription"),
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex max-w-2xl flex-col gap-2">
      <h2 className={type.heading}>{title}</h2>
      <div className={cn(type.bodySm, "flex flex-col gap-2 text-muted-foreground")}>{children}</div>
    </section>
  );
}

const linkClass = "underline underline-offset-2 hover:text-foreground";

export default async function AboutPage() {
  const t = await getTranslations("Legal");
  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader title={t("aboutTitle")} subtitle={t("aboutSubtitle")} />

      <Section title={t("aboutWhyTitle")}>
        <p>{t("aboutWhyP1")}</p>
        <p>{t("aboutWhyP2")}</p>
      </Section>

      <Section title={t("aboutLooksTitle")}>
        <p>
          {t("aboutLooksP1Before")}
          <Link href="/learn/drbl" className={linkClass}>
            {t("linkDrbl")}
          </Link>
          {t("aboutLooksP1Mid")}
          <Link href="/learn" className={linkClass}>
            {t("linkLearn")}
          </Link>
          {t("aboutLooksP1After")}
        </p>
        <p>
          {t("aboutLooksP2Before")}
          <Link href="/arcade" className={linkClass}>
            {t("linkArcade")}
          </Link>
          {t("aboutLooksP2Mid")}
          <Link href="/gm" className={linkClass}>
            {t("linkFranchise")}
          </Link>
          {t("aboutLooksP2After")}
        </p>
      </Section>

      <Section title={t("aboutSuggestionsTitle")}>
        <p>{t("aboutSuggestionsP1")}</p>
        <SuggestionBox />
      </Section>

      <Section title={t("aboutStatsTitle")}>
        <p>
          {t("aboutStatsP1Before")}
          <Link href="/learn/drbl" className={linkClass}>
            {t("linkDrbl")}
          </Link>
          {t("aboutStatsP1Mid")}
          <Link href="/learn/drbl/war1" className={linkClass}>
            {t("linkWar1")}
          </Link>
          {t("aboutStatsP1After")}
        </p>
        <p>
          {t("aboutStatsP2Before")}
          <Link href="/sources" className={linkClass}>
            {t("linkSources")}
          </Link>
          {t("aboutStatsP2After")}
        </p>
      </Section>
    </main>
  );
}
