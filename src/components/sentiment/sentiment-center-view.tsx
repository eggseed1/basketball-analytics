import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { SentimentTrendChart } from "@/components/players/sentiment-trend-chart";
import { LeagueMoodCharts } from "@/components/sentiment/league-mood-charts";
import { TrackedPlayersBoard } from "@/components/sentiment/tracked-players-board";
import type {
  LeagueSentimentFeed,
  SentimentNarrativeCollection,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
import { type, textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function scoreLabel(score: number) {
  const pct = Math.round(((score + 1) / 2) * 100);
  return `${pct}%`;
}

function NarrativeCollectionCard({
  narrative,
  highlighted,
}: {
  narrative: SentimentNarrativeCollection;
  highlighted?: boolean;
}) {
  return (
    <article
      id={`narrative-${narrative.slug}`}
      className={cn(
        "sports-card flex flex-col gap-3 p-4",
        highlighted && "ring-2 ring-primary/35"
      )}
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={cn(type.bodySm, "font-bold")}>{narrative.label}</h3>
          <span className={cn(type.caption, "capitalize text-muted-foreground")}>
            {narrative.direction} ·{" "}
            {narrative.mentionVolume.toLocaleString()} mentions
          </span>
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {narrative.description}
        </p>
      </header>

      {narrative.series?.length ? (
        <SentimentTrendChart
          label="Narrative volume (indexed)"
          color="rgb(245 158 11)"
          points={narrative.series}
          height={120}
        />
      ) : null}

      <ul className="flex flex-col gap-2">
        {narrative.players.map((player) => (
          <li
            key={player.playerId}
            className="flex flex-col gap-2 rounded-md border border-border/60 bg-white/40 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <PlayerHeadshot
                playerId={player.playerId}
                name={player.displayName}
                teamKey={player.teamKey}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/players/${encodeURIComponent(player.playerId)}?view=sentiment`}
                  className={cn(type.bodySm, "font-semibold", textLinkClassName)}
                >
                  {player.displayName}
                </Link>
                {player.teamKey ? (
                  <div className="mt-0.5 flex items-center gap-1">
                    <TeamLogo teamKey={player.teamKey} size="xs" />
                    <span className={cn(type.caption, "text-muted-foreground")}>
                      {Math.round(player.narrativeShare * 100)}% of narrative
                    </span>
                  </div>
                ) : null}
              </div>
              <div className={cn(type.caption, "shrink-0 text-right tabular-nums")}>
                <p>Fan {scoreLabel(player.fanScore)}</p>
                <p className="text-muted-foreground">
                  Media {scoreLabel(player.mediaScore)}
                </p>
              </div>
            </div>
            <p className={cn(type.caption, "text-muted-foreground")}>
              {player.note}
            </p>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function SentimentCenterView({
  feed,
  players,
  highlightNarrative,
}: {
  feed: LeagueSentimentFeed;
  players: TrackedPlayerSentimentRow[];
  highlightNarrative?: string;
}) {
  const { league } = feed;
  const overrated =
    league.narratives.find((n) => n.slug === "overrated") ?? null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Sentiment · {feed.season}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          League sentiment board
        </h1>
        <p className={cn(type.bodySm, "max-w-2xl text-muted-foreground")}>
          Fan and media perception across the league — separate from performance
          metrics and Movement Center evidence. Narrative collections surface
          recurring labels like{" "}
          <span className="font-semibold text-foreground">overrated player</span>
          .
        </p>
        <p
          className={cn(
            type.caption,
            "rounded-md border border-dashed border-amber-600/30 bg-amber-500/5 px-3 py-2 text-muted-foreground"
          )}
        >
          {feed.disclaimer} Snapshot status: {feed.status}.
        </p>
      </header>

      <LeagueMoodCharts
        moodSeriesByWindow={feed.moodSeriesByWindow}
        defaultWindow={
          feed.league.window === "30d" || feed.league.window === "90d"
            ? feed.league.window
            : "7d"
        }
      />

      {overrated ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={cn(type.bodySm, "font-bold")}>Overrated player watch</h2>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Collected fan/media mentions framing stars as over-ranked
            </p>
          </div>
          <NarrativeCollectionCard
            narrative={overrated}
            highlighted={highlightNarrative === "overrated"}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className={cn(type.bodySm, "font-bold")}>Narrative collections</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {league.narratives
            .filter((n) => n.slug !== "overrated")
            .map((narrative) => (
              <NarrativeCollectionCard
                key={narrative.id}
                narrative={narrative}
                highlighted={highlightNarrative === narrative.slug}
              />
            ))}
        </div>
      </section>

      <TrackedPlayersBoard rows={players} season={feed.season} />
    </div>
  );
}
