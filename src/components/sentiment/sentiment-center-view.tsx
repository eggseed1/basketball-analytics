import { ChevronDown } from "lucide-react";
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
        "flex min-w-0 flex-col gap-3 rounded-[14px] bg-foreground/[0.035] p-4 ring-1 ring-inset ring-foreground/[0.06]",
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
            className="flex flex-col gap-2 rounded-lg bg-background/60 px-3 py-2"
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
                  className={cn(type.bodySm, "font-semibold hover:underline")}
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
    <div className="flex flex-col gap-1.5">
      <h3 className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {title}
      </h3>
      <ul className="-mx-2 flex flex-col">
        {rows.map((row) => (
          <li key={row.playerId}>
            <Link
              href={`/players/${encodeURIComponent(row.playerId)}?view=sentiment`}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-foreground/[0.04]"
            >
              <span className={cn(type.bodySm, "inline-flex min-w-0 items-center gap-1.5 font-semibold")}>
                {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="xs" /> : null}
                <span className="truncate">{row.displayName}</span>
              </span>
              <span className={cn(type.caption, "shrink-0 tabular-nums text-muted-foreground")}>
                <span className="font-semibold text-foreground">{sentimentPct(row.media!.score)}</span> ·{" "}
                {row.media!.mentionVolume}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={type.heading}>Headline tone</h2>
          <LaneOriginTag lane={{ origin: "headlines", asOf, mentionVolume: 0 }} />
        </div>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Warmest and coolest coverage in the last 7 days, among players with 3+ headlines.
          Score · headline count.
        </p>
      </div>
      {column("Warmest", warm)}
      {column("Coolest", cool)}
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
          Sentiment · {feed.season}
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
          How fans and media talk about players and teams. The two are shown side by side, never
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

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,21rem)]">
            <SentimentDivergenceBoard
              rows={feed.divergences}
              players={players}
              snapshotDate={feed.snapshotDate}
            />
            <div className="flex min-w-0 flex-col gap-5">
              <HeadlineToneLeaders players={players} />
              <SentimentTopicHeat
                rows={feed.topicHeat}
                highlightTopic={highlightTopic}
                origin={feed.topicHeatOrigin}
              />
            </div>
          </div>

          {league.narratives.length ? (
            <details
              className="group sports-card overflow-hidden"
              open={Boolean(highlightNarrative) || undefined}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className={type.heading}>Narratives</span>
                    <LaneOriginTag
                      lane={{ origin: "curated", asOf: curatedAsOf ?? undefined, mentionVolume: 0 }}
                    />
                  </span>
                  <span className={cn(type.bodySm, "text-muted-foreground")}>
                    {league.narratives.length} hand-picked storylines
                    {overrated ? ", including who fans call overrated" : ""}. Not measured
                    from this week&apos;s posts.
                  </span>
                </span>
                <ChevronDown
                  aria-hidden
                  className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="grid gap-3 border-t border-border/60 p-3 sm:p-4 lg:grid-cols-2">
                {[...(overrated ? [overrated] : []), ...league.narratives.filter((n) => n !== overrated)].map(
                  (narrative) => (
                    <NarrativeCollectionCard
                      key={narrative.id}
                      narrative={narrative}
                      highlighted={highlightNarrative === narrative.slug}
                      asOf={curatedAsOf}
                    />
                  )
                )}
              </div>
            </details>
          ) : null}

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
