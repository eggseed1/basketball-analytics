import { getLocale, getTranslations } from "next-intl/server";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { LearnPageFooter } from "@/components/learn/learn-page-footer";
import { StatGuideView } from "@/components/learn/stat-guide-view";
import { AppLink } from "@/components/ui/app-link";
import { isNonEnglishLocale, loadLocalizedGuide } from "@/content/learn/load-localized";

export const metadata: Metadata = {
  alternates: { canonical: "/learn/drbl/war1" },
  title: "WAR1: DRBL wins above average",
  description:
    "WAR1 is DRBL season value: DRBL/100 times playing time, in wins above an average player. Part of DRBL NBA advanced stats. This is not classic WAR.",
};

export default async function LearnWar1Page() {
  const locale = await getLocale();
  const loaded = await loadLocalizedGuide(locale, "war1");
  if (!loaded) notFound();
  const guide = loaded.content;
  const t = await getTranslations("LearnPages");

  return (
    <main data-motion-page className="site-shell flex flex-col gap-4 pb-6 sm:gap-5 sm:pb-8">
      <MotionReveal />
      <div data-motion-stack className="site-prose flex w-full flex-col gap-4 lg:mx-0 lg:max-w-4xl sm:gap-5">
        <AppLink
          href="/learn/drbl"
          className="text-[14px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("backWhatIsDrbl")}
        </AppLink>

        {!loaded.localized && isNonEnglishLocale(locale) ? (
          <p className="text-[13px] text-muted-foreground">{t("bodyEnglishNote")}</p>
        ) : null}

        <StatGuideView guide={guide} />

        <LearnPageFooter conceptId={guide.id} />
      </div>
    </main>
  );
}
