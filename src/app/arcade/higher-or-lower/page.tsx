import { HigherLowerGame } from "@/components/arcade/higher-lower-game";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = {
  title: "Higher or Lower",
  description: "Guess whether the next player's season stat is higher or lower and build a streak.",
};

export default function HigherOrLowerPage() {
  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        eyebrow="Arcade"
        title="Higher or Lower"
        subtitle="Spin for a stat. Then guess whether the next season beats the one before it. One miss ends the run."
        about="Seasons come from 1996-97 on, with at least 1,500 minutes played. DARKO covers most of those seasons; a season without a DARKO rating never comes up in a DARKO run."
      />
      <HigherLowerGame />
    </main>
  );
}
