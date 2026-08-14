import { AskDrblView } from "@/components/ask/ask-drbl-view";
import { getAskDrblAnswer } from "@/data/queries/ask-drbl";

export const metadata = {
  title: "ASK DRBL",
  description:
    "Natural-language basketball analytics — structured queries over trusted DRBL data.",
};

interface AskPageProps {
  searchParams: Promise<{ q?: string; playerId?: string }>;
}

export default async function AskPage({ searchParams }: AskPageProps) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const playerId = (sp.playerId ?? "").trim() || undefined;
  const result = q ? await getAskDrblAnswer(q, { playerId }) : null;

  return (
    <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <AskDrblView initialQuery={q} result={result} />
    </main>
  );
}
