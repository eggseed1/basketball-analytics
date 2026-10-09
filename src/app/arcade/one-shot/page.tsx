import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PageHeader } from "@/components/layout/page-header";
import { OneShotGame } from "@/components/one-shot/one-shot-game";

export const metadata = {
  title: "ONE SHOT",
  description: "Be born anywhere in the world and try to reach the NBA. A basketball life sim with fictional players and real league structures.",
};

export default function OneShotPage() {
  return (
    <main data-motion-page className="flex flex-col gap-5 py-6 sm:py-8">
      <MotionReveal />
      <div className="site-shell">
        <PageHeader
          eyebrow="Arcade"
          title="ONE SHOT"
          subtitle="One life, from birth to the NBA or somewhere short of it. Set the focus, take the offers, play the games."
        />
      </div>
      <OneShotGame />
    </main>
  );
}
