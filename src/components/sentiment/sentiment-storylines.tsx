import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { FAN_COLOR, MEDIA_COLOR } from "@/components/sentiment/sentiment-insights-panels";
import { formatSentimentDate, sentimentPct } from "@/components/sentiment/sentiment-source";
import type { SentimentStoryline, SentimentStorylinePlayer } from "@/sentiment/curated-types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function topicLabel(topic: string): string {
  const words = topic.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function ShareChange({ now, prior }: { now: number; prior: number | null }) {
  if (prior == null) return null;
  const pts = Math.round((now - prior) * 100);
  return (
    <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
      {pts === 0 ? "Flat" : pts > 0 ? `Up ${pts} pts` : `Down ${-pts} pts`} vs the week before
    </span>
  );
}

/** Each day's share of fan posts (up) and headlines (down) on one scale. */
function DailyShareStrip({ topic, daily }: { topic: string; daily: SentimentStoryline["daily"] }) {
  if (daily.length < 2) return null;
  const max = Math.max(0.01, ...daily.flatMap((day) => [day.fan ?? 0, day.media ?? 0]));
  const height = (share: number | null) => (share == null ? 0 : Math.max(2, (share / max) * 100));
  return (
    <figure className="flex flex-col gap-1">
      <div
        className="flex h-16 items-stretch gap-[3px]"
        role="img"
        aria-label={`Daily share of fan posts and headlines about ${topicLabel(topic).toLowerCase()}`}
      >
        {daily.map((day) => (
          <div
            key={day.date}
            className="flex min-w-0 flex-1 flex-col"
            title={`${formatSentimentDate(day.date)}: ${
              day.fan == null ? "too few fan posts" : `${pct(day.fan)} of fan posts`
            }, ${day.media == null ? "too few headlines" : `${pct(day.media)} of headlines`}`}
          >
            <div className="flex flex-1 items-end border-b border-border/70">
              <div
                className="w-full rounded-t-[2px]"
                style={{ height: `${height(day.fan)}%`, backgroundColor: FAN_COLOR }}
              />
            </div>
            <div className="flex flex-1 items-start">
              <div
                className="w-full rounded-b-[2px]"
                style={{ height: `${height(day.media)}%`, backgroundColor: MEDIA_COLOR }}
              />
            </div>
          </div>
        ))}
      </div>
      <figcaption
        className={cn(type.micro, "flex justify-between gap-2 tabular-nums text-muted-foreground")}
      >
        <span>{formatSentimentDate(daily[0].date)}</span>
        <span className="inline-flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: FAN_COLOR }} />
            Fans
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: MEDIA_COLOR }} />
            Headlines
          </span>
        </span>
        <span>{formatSentimentDate(daily.at(-1)!.date)}</span>
      </figcaption>
    </figure>
  );
}

function ToneCell({ label, score, color }: { label: string; score?: number; color: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={cn(type.micro, "font-semibold uppercase tracking-wide")} style={{ color }}>
        {label}
      </span>
      <span className={cn(type.bodySm, "font-bold tabular-nums")}>
        {score == null ? "—" : sentimentPct(score)}
      </span>
    </div>
  );
}

/** A player in a storyline or rating list, with the latest headline when there is one. */
export function StorylinePlayerRow({
  player,
  showTone = true,
}: {
  player: SentimentStorylinePlayer;
  showTone?: boolean;
}) {
  const counts = [
    player.fanCount ? plural(player.fanCount, "fan post", "fan posts") : null,
    player.mediaCount ? plural(player.mediaCount, "headline", "headlines") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex min-w-0 gap-2.5 py-2">
      <PlayerHeadshot
        playerId={player.playerId}
        name={player.displayName}
        teamKey={player.teamKey}
        size="sm"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/players/${encodeURIComponent(player.playerId)}?view=sentiment`}
          className={cn(type.bodySm, "inline-flex min-w-0 items-center gap-1.5 self-start font-semibold hover:underline")}
        >
          {player.teamKey ? <TeamLogo teamKey={player.teamKey} size="xs" /> : null}
          <span className="truncate">{player.displayName}</span>
        </Link>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
          <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>{counts}</span>
          {showTone && (player.fanScore != null || player.mediaScore != null) ? (
            <span className={cn(type.caption, "shrink-0 tabular-nums text-muted-foreground")}>
              {player.fanScore != null ? (
                <span title="Fan tone in these posts">
                  Fan <span className="font-semibold text-foreground">{sentimentPct(player.fanScore)}</span>
                </span>
              ) : null}
              {player.fanScore != null && player.mediaScore != null ? " · " : null}
              {player.mediaScore != null ? (
                <span title="Headline tone in these headlines">
                  Media <span className="font-semibold text-foreground">{sentimentPct(player.mediaScore)}</span>
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {player.headline ? (
          <a
            href={player.headline.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(type.caption, "line-clamp-2 text-foreground/85 hover:underline")}
          >
            {player.headline.title}
            <span className="text-muted-foreground">
              {" "}
              · {player.headline.outlet}, {formatSentimentDate(player.headline.publishedAt)}
            </span>
          </a>
        ) : null}
      </div>
    </li>
  );
}

function StorylineCard({ storyline }: { storyline: SentimentStoryline }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-[11px] bg-foreground/[0.035] p-4 ring-1 ring-inset ring-foreground/[0.06]">
      <header className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 className={cn(type.bodySm, "font-bold")}>
            <Link
              href={`/sentiment?view=players&topic=${encodeURIComponent(storyline.topic)}`}
              className="hover:underline"
            >
              {topicLabel(storyline.topic)}
            </Link>
          </h3>
          <ShareChange now={storyline.mediaShare} prior={storyline.priorMediaShare} />
        </div>
        <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {plural(storyline.fanCount, "fan post", "fan posts")} and{" "}
          {plural(storyline.mediaCount, "headline", "headlines")} ({pct(storyline.mediaShare)} of all
          headlines), about {plural(storyline.playerCount, "player", "players")}.
        </p>
      </header>

      <DailyShareStrip topic={storyline.topic} daily={storyline.daily} />

      <div className="grid grid-cols-2 gap-3 border-y border-border/60 py-2">
        <ToneCell label="Fan tone" score={storyline.fanScore} color={FAN_COLOR} />
        <ToneCell label="Media tone" score={storyline.mediaScore} color={MEDIA_COLOR} />
      </div>

      {storyline.players.length ? (
        <ul className="-my-2 flex flex-col divide-y divide-border/50">
          {storyline.players.map((player) => (
            <StorylinePlayerRow key={player.playerId} player={player} />
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function SentimentStorylines({
  storylines,
  windowDays,
}: {
  storylines: SentimentStoryline[];
  windowDays: number;
}) {
  if (!storylines.length) return null;
  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className={type.heading}>Storylines</h2>
        <p className={cn(type.bodySm, "max-w-3xl text-muted-foreground")}>
          The topics fans and outlets talked about most in the last {windowDays} days, found by
          keyword tags on posts and headlines. Bars show each day&apos;s share of fan posts (up) and
          headlines (down) on that topic, left blank on days with too few to count. Tone is the
          average for posts and headlines on the topic, and players are ranked by how often they come
          up in it.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {storylines.map((storyline) => (
          <StorylineCard key={storyline.topic} storyline={storyline} />
        ))}
      </div>
    </section>
  );
}
