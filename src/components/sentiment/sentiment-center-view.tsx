import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { SentimentPerformanceScatterLazy as SentimentPerformanceScatter } from "@/components/charts/recharts-lazy";
import { LeagueMoodCharts } from "@/components/sentiment/league-mood-charts";
import { SentimentHeadlinesList } from "@/components/sentiment/sentiment-headlines-list";
import { SentimentOverratedView } from "@/components/sentiment/sentiment-overrated-view";
import {
  SentimentDivergenceBoard,
  SentimentTopicHeat,
} from "@/components/sentiment/sentiment-insights-panels";
import {
  LaneOriginTag,
  sentimentPct,
  SentimentSourcesStrip,
} from "@/components/sentiment/sentiment-source";
import { SentimentStorylines } from "@/components/sentiment/sentiment-storylines";
import { SentimentTeamsBoard } from "@/components/sentiment/sentiment-teams-board";
import { TrackedPlayersBoard } from "@/components/sentiment/tracked-players-board";
import { computeSentimentMovers } from "@/sentiment/movers";
import type {
  LeagueSentimentFeed,
  SentimentMoverRow,
  TeamSentimentProfile,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
import { type, textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export type SentimentView = "league" | "overrated" | "players" | "teams" | "headlines";

function moverPts(delta: number) {
  const pts = Math.round(Math.abs(delta) * 50);
  return delta > 0 ? `+${pts}` : `−${pts}`;
}

function MoverColumn({
  title,
  tone,
  rows,
  fanLabel,
}: {
  title: string;
  tone: "up" | "down";
  rows: SentimentMoverRow[];
  fanLabel: (score: string) => string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {title}
      </h3>
      <ul className="-mx-2 flex flex-col">
        {rows.map((row) => (
          <li key={row.playerId}>
            <Link
              href={`/players/${encodeURIComponent(row.playerId)}?view=sentiment`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-foreground/[0.04]"
            >
              <PlayerHeadshot
                playerId={row.playerId}
                name={row.displayName}
                teamKey={row.teamKey}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className={cn(type.bodySm, "block truncate font-semibold")}>
                  {row.displayName}
                </span>
                <span className={cn(type.caption, "flex items-center gap-1 text-muted-foreground")}>
                  {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="xs" /> : null}
                  {fanLabel(sentimentPct(row.fanScore))}
                </span>
              </span>
              <span
                className={cn(
                  type.bodySm,
                  "shrink-0 font-bold tabular-nums",
                  tone === "up" ? "text-delta-up" : "text-delta-down"
                )}
              >
                {moverPts(row.delta)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Week-over-week fan tone, under the disagreement board. */
async function SentimentWeekMovers({
  players,
  className,
}: {
  players: TrackedPlayerSentimentRow[];
  className?: string;
}) {
  const t = await getTranslations("Sentiment");
  const { risers, fallers } = computeSentimentMovers(
    players
      .filter((row) => row.fan && row.series?.fan && row.series.fan.length >= 2)
      .map((row) => ({
        playerIds: [row.playerId],
        displayName: row.displayName,
        teamKey: row.teamKey,
        window: row.window,
        fan: row.fan,
        series: row.series,
      })),
    { limit: 3, lookbackDays: 7 }
  );
  if (risers.length + fallers.length < 2) return null;
  const sample = risers[0] ?? fallers[0];

  return (
    <section className={cn("sports-card flex flex-col gap-3 p-4 sm:p-5", className)}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={type.heading}>Fan mood this week</h2>
          {sample ? (
            <LaneOriginTag lane={{ origin: sample.origin, asOf: sample.asOf, mentionVolume: 0 }} />
          ) : null}
        </div>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {t("fanMoodWeekBlurb")}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {risers.length ? (
          <MoverColumn
            title={t("warmer")}
            tone="up"
            rows={risers}
            fanLabel={(score) => t("fanLabel", { score })}
          />
        ) : null}
        {fallers.length ? (
          <MoverColumn
            title={t("cooler")}
            tone="down"
            rows={fallers}
            fanLabel={(score) => t("fanLabel", { score })}
          />
        ) : null}
      </div>
    </section>
  );
}

async function HeadlineToneLeaders({ players }: { players: TrackedPlayerSentimentRow[] }) {
  const t = await getTranslations("Sentiment");
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
          <h2 className={type.heading}>{t("headlineTone")}</h2>
          <LaneOriginTag lane={{ origin: "headlines", asOf, mentionVolume: 0 }} />
        </div>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {t("headlineToneBlurb")}
        </p>
      </div>
      {column(t("warmest"), warm)}
      {column(t("coolest"), cool)}
    </section>
  );
}

export async function SentimentCenterView({
  feed,
  players,
  teams,
  view,
  highlightTopic,
}: {
  feed: LeagueSentimentFeed;
  players: TrackedPlayerSentimentRow[];
  teams: TeamSentimentProfile[];
  view: SentimentView;
  highlightTopic?: string;
}) {
  const t = await getTranslations("Sentiment");
  const { league } = feed;

  const title =
    view === "players"
      ? t("titlePlayers")
      : view === "teams"
        ? t("titleTeams")
        : view === "headlines"
          ? t("titleHeadlines")
          : view === "overrated"
            ? t("titleOverrated")
            : t("titleLeague");
  const subtitle =
    view === "overrated" ? t("subtitleOverrated") : t("subtitleDefault");

  return (
    <div key={view} data-motion-stack className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className={cn(type.bodySm, "max-w-2xl text-muted-foreground")}>
          {subtitle}
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
      ) : view === "overrated" ? (
        <SentimentOverratedView players={players} ratingTalk={league.ratingTalk} />
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

          <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,21rem)]">
            <div className="flex min-w-0 flex-col gap-5">
              <SentimentDivergenceBoard
                rows={feed.divergences}
                players={players}
                snapshotDate={feed.snapshotDate}
              />
              <SentimentWeekMovers players={players} className="lg:flex-1" />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <HeadlineToneLeaders players={players} />
              <SentimentTopicHeat
                rows={feed.topicHeat}
                highlightTopic={highlightTopic}
                origin={feed.topicHeatOrigin}
                className="lg:flex-1"
              />
            </div>
          </div>

          <SentimentStorylines
            storylines={league.storylines ?? []}
            windowDays={league.storylineWindowDays ?? 7}
          />

          <p className={cn(type.caption, "text-muted-foreground")}>
            {t("moreDetail")}{" "}
            <Link href="/sentiment?view=overrated" className={textLinkClassName}>
              {t("linkOverrated")}
            </Link>
            ,{" "}
            <Link href="/sentiment?view=players" className={textLinkClassName}>
              {t("linkPlayers")}
            </Link>
            ,{" "}
            <Link href="/sentiment?view=teams" className={textLinkClassName}>
              {t("linkTeams")}
            </Link>
            , and{" "}
            <Link href="/sentiment?view=headlines" className={textLinkClassName}>
              {t("linkHeadlines")}
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
