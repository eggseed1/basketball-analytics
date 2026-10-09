import { MotionReveal } from "@/components/continuity/motion-reveal";
import { Zero82Game } from "@/components/arcade/zero-82-game";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = {
  title: "0–82",
  description: "Draft the worst possible starting five, one random team at a time, or flip it and chase 82–0.",
};

export default function Zero82Page() {
  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        eyebrow="Arcade"
        title="0–82"
        subtitle="Spin a random team and season, take one of its players, and fill PG, SG, SF, PF and C. Lose every game if you can."
      />
      <Zero82Game />
    </main>
  );
}
