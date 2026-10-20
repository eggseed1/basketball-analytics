import { getTranslations } from "next-intl/server";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import {
  SentimentCenterView,
  type SentimentView,
} from "@/components/sentiment/sentiment-center-view";
import { getLeagueSentimentBoard } from "@/data/queries/league-sentiment";
import { listTeamSentimentProfiles } from "@/sentiment/load-curated";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  alternates: { canonical: "/sentiment" },
  title: "NBA fan sentiment",
  description:
    "Fan and media tone for NBA players and teams, measured from publisher headlines and fan posts, with the storylines and headlines behind each score.",
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

function parseView(value: string | undefined): SentimentView {
  return value === "players" || value === "teams" || value === "headlines" || value === "overrated"
    ? value
    : "league";
}

export default async function SentimentPage({ searchParams }: PageProps) {
  const t = await getTranslations("Sentiment");
  const sp = await searchParams;
  const topic = one(sp, "topic");
  const view = topic
    ? "players"
    : one(sp, "narrative") === "overrated"
      ? "overrated"
      : parseView(one(sp, "view"));
  const { feed, players } = await getLeagueSentimentBoard();

  if (!feed) {
    return (
      <main data-motion-page className="site-shell py-8">
        <MotionReveal />
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {t("unavailable")}
        </p>
      </main>
    );
  }

  return (
    <main data-motion-page className="site-shell py-6 sm:py-8">
      <MotionReveal />
      <SentimentCenterView
        feed={feed}
        players={players}
        teams={listTeamSentimentProfiles()}
        view={view}
        highlightTopic={topic}
      />
    </main>
  );
}
