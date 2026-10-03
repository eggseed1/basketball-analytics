import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import {
  SentimentPerformanceScatterLazy as SentimentPerformanceScatter,
  SentimentTrendChartLazy as SentimentTrendChart,
} from "@/components/charts/recharts-lazy";
import { LeagueMoodCharts } from "@/components/sentiment/league-mood-charts";
import { SentimentHeadlinesList } from "@/components/sentiment/sentiment-headlines-list";
import {
  SentimentDivergenceBoard,
  SentimentTopicHeat,
} from "@/components/sentiment/sentiment-insights-panels";
import {
  formatSentimentDate,
  LaneOriginTag,
  sentimentPct,
  SentimentSourcesStrip,
} from "@/components/sentiment/sentiment-source";
import { SentimentTeamsBoard } from "@/components/sentiment/sentiment-teams-board";
import { TrackedPlayersBoard } from "@/components/sentiment/tracked-players-board";
import type {
  LeagueSentimentFeed,
  SentimentNarrativeCollection,
  TeamSentimentProfile,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
import { type, textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export type SentimentView = "league" | "players" | "teams" | "headlines";

function NarrativeCollectionCard({
  narrative,
  highlighted,
  asOf,
}: {
  narrative: SentimentNarrativeCollection;
  highlighted?: boolean;
  asOf?: string | null;
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
          <div className="flex items-center gap-2">
            <h3 className={cn(type.bodySm, "font-bold")}>{narrative.label}</h3>
            <LaneOriginTag lane={{ origin: "curated", asOf: asOf ?? undefined, mentionVolume: 0 }} />
          </div>
          <span className={cn(type.caption, "capitalize text-muted-foreground")}>
            {narrative.direction} · {narrative.mentionVolume.toLocaleString()} mentions
          </span>
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>{narrative.description}</p>
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
            className="flex flex-col gap-2 rounded-md border border-border/60 frost-surface px-3 py-2"
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
                  href={`/players/${encodeURIComponent(player.playerId)}`}
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
              <div
                className={cn(type.caption, "shrink-0 text-right tabular-nums")}
                title="The player's curated fan and media tone across all topics, not just this narrative"
              >
                <p>Fan {sentimentPct(player.fanScore)}</p>
                <p className="text-muted-foreground">Media {sentimentPct(player.mediaScore)}</p>
              </div>
            </div>
            <p className={cn(type.caption, "text-muted-foreground")}>{player.note}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

function HeadlineToneLeaders({ players }: { players: TrackedPlayerSentimentRow[] }) {
  const measured = players.filter((row) => row.media?.origin === "headlines");
  if (measured.length < 4) return null;
  const sorted = [...measured].sort((a, b) => b.media!.score - a.media!.score);
  const warm = sorted.slice(0, 5);
  const cool = sorted.slice(-5).reverse();
  const asOf = measured.map((row) => row.media!.asOf).filter(Boolean).sort().pop();
  const column = (title: string, rows: TrackedPlayerSentimentRow[]) => (
    <div className="flex flex-col gap-2">
      <h3 className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.playerId} className="flex items-center justify-between gap-2">
            <Link
              href={`/players/${encodeURIComponent(row.playerId)}?view=sentiment`}
              className={cn(type.bodySm, "inline-flex min-w-0 items-center gap-1.5 font-semibold", textLinkClassName)}
            >
              {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="xs" /> : null}
              <span className="truncate">{row.displayName}</span>
            </Link>
            <span className={cn(type.caption, "shrink-0 tabular-nums text-muted-foreground")}>
              {sentimentPct(row.media!.score)} · {row.media!.mentionVolume} headlines
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h2 className={cn(type.bodySm, "font-bold")}>Warmest and coolest in the headlines</h2>
          <LaneOriginTag lane={{ origin: "headlines", asOf, mentionVolume: 0 }} />
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Players with at least 3 headlines in the last 7 days. With this few headlines one story
          can swing a score, so open a player to see which headlines are behind it.
        </p>
      </div>
      <div className="sports-card grid gap-6 p-4 sm:grid-cols-2">
        {column("Warmest", warm)}
        {column("Coolest", cool)}
      </div>
    </section>
  );
}

export function SentimentCenterView({
  feed,
  players,
  teams,
  view,
  highlightNarrative,
  highlightTopic,
}: {
  feed: LeagueSentimentFeed;
  players: TrackedPlayerSentimentRow[];
  teams: TeamSentimentProfile[];
  view: SentimentView;
  highlightNarrative?: string;
  highlightTopic?: string;
}) {
  const { league } = feed;
  const overrated = league.narratives.find((n) => n.slug === "overrated") ?? null;
  const curatedAsOf = feed.sources?.curated.asOf ?? null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Sentiment · {feed.season} · as of {formatSentimentDate(feed.snapshotDate)}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {view === "players"
            ? "Player sentiment"
            : view === "teams"
              ? "Team sentiment"
              : view === "headlines"
                ? "Headlines"
                : "League sentiment board"}
        </h1>
        <p className={cn(type.bodySm, "max-w-2xl text-muted-foreground")}>
          How fans and media talk about players and teams, kept separate from performance metrics
          and Movement Center evidence. Fan and media tone are always shown side by side and never
          merged into one number.
        </p>
        <SentimentSourcesStrip sources={feed.sources} snapshotDate={feed.snapshotDate} />
      </header>

      {view === "players" ? (
        <>
          <SentimentPerformanceScatter rows={players} />
          <TrackedPlayersBoard rows={players} season={feed.season} topicFilter={highlightTopic} />
        </>
      ) : view === "teams" ? (
        <SentimentTeamsBoard teams={teams} />
      ) : view === "headlines" ? (
        <SentimentHeadlinesList headlines={league.latestHeadlines ?? []} sources={feed.sources} />
      ) : (
        <>
          <LeagueMoodCharts
            moodSeriesByWindow={feed.moodSeriesByWindow}
            moodLanes={feed.moodLanes}
            defaultWindow={
              feed.league.window === "30d" || feed.league.window === "90d"
                ? feed.league.window
                : "7d"
            }
          />

          <HeadlineToneLeaders players={players} />

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,22rem)]">
            <SentimentDivergenceBoard rows={feed.divergences} />
            <SentimentTopicHeat
              rows={feed.topicHeat}
              highlightTopic={highlightTopic}
              origin={feed.topicHeatOrigin}
            />
          </div>

          {overrated ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={cn(type.bodySm, "font-bold")}>Overrated player watch</h2>
                <p className={cn(type.caption, "text-muted-foreground")}>
                  Fan and media mentions calling stars over-ranked
                </p>
              </div>
              <NarrativeCollectionCard
                narrative={overrated}
                highlighted={highlightNarrative === "overrated"}
                asOf={curatedAsOf}
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
                    asOf={curatedAsOf}
                  />
                ))}
            </div>
          </section>

          <p className={cn(type.caption, "text-muted-foreground")}>
            More detail:{" "}
            <Link href="/sentiment?view=players" className={textLinkClassName}>
              every player
            </Link>
            ,{" "}
            <Link href="/sentiment?view=teams" className={textLinkClassName}>
              all 30 teams
            </Link>
            , and{" "}
            <Link href="/sentiment?view=headlines" className={textLinkClassName}>
              the latest headlines
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
