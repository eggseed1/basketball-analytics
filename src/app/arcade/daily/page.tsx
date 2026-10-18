import { MotionReveal } from "@/components/continuity/motion-reveal";
import { DailyGame } from "@/components/arcade/daily-game";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = {
  alternates: { canonical: "/arcade/daily" },
  title: "Daily Higher or Lower",
  description: "Ten higher-or-lower calls on real player seasons. Everyone gets the same ten each day.",
};

export default function DailyPage() {
  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title="Daily Higher or Lower"
        subtitle="Ten calls on one stat. Everyone gets the same ten, and a new set arrives at midnight Eastern."
        about="Seasons come from 1996-97 through 2025-26, with at least 1,500 minutes played. A miss doesn't end the run; you play all ten and share your score."
      />
      <DailyGame />
    </main>
  );
}
