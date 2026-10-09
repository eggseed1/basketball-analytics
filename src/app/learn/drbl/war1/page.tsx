import { MotionReveal } from "@/components/continuity/motion-reveal";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { LearnPageFooter, learnEyebrow } from "@/components/learn/learn-page-footer";
import { StatGuideView } from "@/components/learn/stat-guide-view";
import { AppLink } from "@/components/ui/app-link";
import { getStatGuide } from "@/content/stats/guides";

export const metadata: Metadata = {
  title: "WAR1",
  description:
    "The season value a player accumulated, as a wins-style total above DRBL’s R1 baseline. This is not classic WAR.",
};

export default function LearnWar1Page() {
  const guide = getStatGuide("war1");
  if (!guide) notFound();

  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <div data-motion-stack className="site-prose flex w-full flex-col gap-8 lg:mx-0 lg:max-w-4xl">
        <AppLink
          href="/learn/drbl"
          className="text-[14px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          ← What is DRBL?
        </AppLink>

        <StatGuideView guide={guide} eyebrow={learnEyebrow(guide.id)} />

        <LearnPageFooter conceptId={guide.id} />
      </div>
    </main>
  );
}
