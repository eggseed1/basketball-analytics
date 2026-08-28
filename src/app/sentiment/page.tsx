import { SentimentCenterView } from "@/components/sentiment/sentiment-center-view";
import { getLeagueSentimentBoard } from "@/data/queries/league-sentiment";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Sentiment",
  description:
    "League-wide fan and media sentiment — narrative collections including overrated player discourse.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function SentimentPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const narrative = one(sp, "narrative");
  const topic = one(sp, "topic");
  const { feed, players } = await getLeagueSentimentBoard();

  if (!feed) {
    return (
      <main className="site-shell py-8">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Sentiment snapshot unavailable.
        </p>
      </main>
    );
  }

  return (
    <main className="site-shell py-6 sm:py-8">
      <SentimentCenterView
        feed={feed}
        players={players}
        highlightNarrative={narrative}
        highlightTopic={topic}
      />
    </main>
  );
}
