import { TeammateChainGame } from "@/components/arcade/teammate-chain-game";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = {
  title: "Teammate Chain",
  description: "Connect two NBA stars through the fewest shared teammates.",
};

export default function TeammateChainPage() {
  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        eyebrow="Arcade"
        title="Teammate Chain"
        subtitle="Get from one star to the other through players who were teammates. Fewer links is better."
      />
      <TeammateChainGame />
    </main>
  );
}
