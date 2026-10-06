import { ChevronDown } from "lucide-react";
import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { LaneOriginTag } from "@/components/sentiment/sentiment-source";
import { MoreInfo } from "@/components/ui/more-info";
import type {
  CuratedSentimentLane,
  SentimentDivergenceRow,
  SentimentLaneOrigin,
  SentimentTopicHeatRow,
  SentimentWordCloud,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function scorePct(score: number) {
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

function gapLabel(gap: number) {
  const pts = Math.round(Math.abs(gap) * 50);
  return gap >= 0 ? `Fans +${pts} pts` : `Fans −${pts} pts`;
}

export function SentimentTopicHeat({
  rows,
  highlightTopic,
  origin = "curated",
}: {
  rows: SentimentTopicHeatRow[];
  highlightTopic?: string;
  origin?: SentimentLaneOrigin;
}) {
  if (!rows.length) return null;
  const shown = rows.slice(0, 8);
  const max = shown[0]?.weight ?? 1;
  const active = highlightTopic?.trim().toLowerCase();
  const fromHeadlines = origin === "headlines";

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className={type.heading}>Topic heat</h2>
          <LaneOriginTag lane={{ origin, mentionVolume: 0 }} />
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {fromHeadlines
            ? "What outlets wrote about in the last 7 days."
            : "Curated fan and media topics, not a census of all discussion."}{" "}
          Pick a topic to filter players.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((row) => {
          const isActive =
            active != null &&
            active.length > 0 &&
            row.topic.toLowerCase().includes(active);
          return (
          <li key={row.topic} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/sentiment?view=players&topic=${encodeURIComponent(row.topic)}`}
                className={cn(
                  type.bodySm,
                  "font-semibold capitalize hover:underline",
                  isActive && "text-primary"
                )}
              >
                {row.topic.replace(/_/g, " ")}
              </Link>
              <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                {Math.round(row.weight * 100)}%
                {fromHeadlines ? ` · ${row.mentionVolume} headlines` : ""} · {row.playerCount} players
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary/80">
              <div
                className={cn(
                  "h-full rounded-full",
                  isActive ? "bg-primary/80" : "bg-amber-500/80"
                )}
                style={{ width: `${Math.max(8, (row.weight / max) * 100)}%` }}
              />
            </div>
          </li>
        );
        })}
      </ul>
      {active ? (
        <Link
          href="/sentiment?view=players"
          className={cn(type.caption, "font-semibold underline")}
        >
          Clear topic filter
        </Link>
      ) : null}
      {fromHeadlines ? (
        <MoreInfo>
          <p>Share of keyword topic tags across NBA headlines from the last 7 days, not all discussion.</p>
        </MoreInfo>
      ) : null}
    </section>
  );
}

export const FAN_COLOR = "rgb(59 130 246)";
export const MEDIA_COLOR = "rgb(168 85 247)";

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function laneSpan(lane: CuratedSentimentLane, unit: [string, string]): string {
  const n = lane.mentionVolume;
  const what = `${n.toLocaleString()} ${n === 1 ? unit[0] : unit[1]}`;
  const from = lane.windowStart;
  const to = lane.asOf;
  if (!from || !to) return what;
  return from === to ? `${what} on ${shortDate(to)}` : `${what}, ${shortDate(from)} to ${shortDate(to)}`;
}

/**
 * Headline words sized by how many headlines use them. Falls back to topic
 * tags when the side has no stored headlines (social posts keep no text).
 */
function TopicCloud({
  title,
  lane,
  cloud,
  cloudSource,
  color,
  unit,
}: {
  title: string;
  lane: CuratedSentimentLane | undefined;
  cloud: SentimentWordCloud | undefined;
  cloudSource: string;
  color: string;
  unit: [string, string];
}) {
  const entries: { key: string; label: string; weight: number; hint: string }[] = cloud
    ? cloud.words.map(([word, n]) => ({
        key: word,
        label: word,
        weight: n,
        hint: `In ${n} of ${cloud.headlines} ${cloudSource}`,
      }))
    : Object.entries(lane?.topicBreakdown ?? {})
        .filter(([, share]) => share > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([topic, share]) => ({
          key: topic,
          label: topic.replace(/_/g, " "),
          weight: share,
          hint: `${Math.round(share * 100)}% of tagged ${unit[1]}`,
        }));
  const top = entries[0]?.weight ?? 1;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className={cn(type.caption, "font-semibold uppercase tracking-wide")} style={{ color }}>
        {title}
      </p>
      {entries.length ? (
        <ul className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {entries.map((entry) => {
            const t = entry.weight / top;
            return (
              <li
                key={entry.key}
                className="font-semibold leading-tight tracking-tight"
                style={{ fontSize: `${12 + t * 14}px`, color, opacity: 0.45 + t * 0.55 }}
                title={entry.hint}
              >
                {entry.label}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={cn(type.caption, "text-muted-foreground")}>No topic tags in this window.</p>
      )}
      {lane ? (
        <p className={cn(type.micro, "text-muted-foreground")}>
          {laneSpan(lane, unit)}
          {cloud
            ? `. Words from ${cloud.headlines} ${cloudSource}.`
            : entries.length
              ? ". Topic tags, since none were headlines."
              : null}
        </p>
      ) : null}
    </div>
  );
}

/** Fan and media score on one 0-100% track, with the gap between them filled in. */
function GapTrack({ fan, media }: { fan: number; media: number }) {
  const f = ((fan + 1) / 2) * 100;
  const m = ((media + 1) / 2) * 100;
  return (
    <span aria-hidden className="relative block h-4 w-full max-sm:hidden">
      <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <span className="absolute top-1/2 h-px w-px -translate-y-1/2 bg-muted-foreground/50" style={{ left: "50%", height: 8 }} />
      <span
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/15"
        style={{ left: `${Math.min(f, m)}%`, width: `${Math.abs(f - m)}%` }}
      />
      <span
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--card)]"
        style={{ left: `${m}%`, background: MEDIA_COLOR }}
      />
      <span
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--card)]"
        style={{ left: `${f}%`, background: FAN_COLOR }}
      />
    </span>
  );
}

export function SentimentDivergenceBoard({
  rows,
  players,
  snapshotDate,
}: {
  rows: SentimentDivergenceRow[];
  players: TrackedPlayerSentimentRow[];
  snapshotDate: string | null;
}) {
  const measured = rows.filter((row) => row.origin === "measured");
  if (!measured.length) return null;
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const windowLabel = snapshotDate
    ? `${shortDate(addDays(snapshotDate, -6))} to ${shortDate(snapshotDate)}`
    : null;

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={type.heading}>Fan vs media gaps</h2>
          <span
            className={cn(
              type.caption,
              "rounded-full bg-secondary px-2 py-0.5 font-semibold tabular-nums text-foreground"
            )}
          >
            Last 7 days{windowLabel ? ` · ${windowLabel}` : ""}
          </span>
        </div>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Where fans and outlets disagree most this week. Open a player to see what each side
          talks about.
        </p>
      </div>

      <div className={cn(type.caption, "flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground")}>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: FAN_COLOR }} />
          Fans
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: MEDIA_COLOR }} />
          Media
        </span>
        <span className="max-sm:hidden">Track runs 0% to 100% positive, 50% in the middle</span>
      </div>

      <ul className="-mx-2 flex flex-col">
        {measured.map((row) => {
          const player = byId.get(row.playerId);
          return (
            <li key={row.playerId}>
              <details className="group rounded-xl open:bg-foreground/[0.03]">
                <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/[0.04] [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2">
                    <PlayerHeadshot
                      playerId={row.playerId}
                      name={row.displayName}
                      teamKey={row.teamKey}
                      size="sm"
                    />
                    <span className="min-w-0">
                      <span className={cn(type.bodySm, "block truncate font-semibold")}>
                        {row.displayName}
                      </span>
                      <span className={cn(type.caption, "flex items-center gap-1 tabular-nums text-muted-foreground")}>
                        {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="xs" /> : null}
                        <span style={{ color: FAN_COLOR }}>{scorePct(row.fanScore)}</span>
                        <span>vs</span>
                        <span style={{ color: MEDIA_COLOR }}>{scorePct(row.mediaScore)}</span>
                      </span>
                    </span>
                  </span>
                  <GapTrack fan={row.fanScore} media={row.mediaScore} />
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        type.caption,
                        "font-bold tabular-nums",
                        row.gap >= 0 ? "text-delta-up" : "text-delta-down"
                      )}
                    >
                      {gapLabel(row.gap)}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                    />
                  </span>
                </summary>
                <div className="flex flex-col gap-4 px-2 pt-2 pb-3 sm:pl-12">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TopicCloud
                      title="Fans talk about"
                      lane={player?.fan}
                      cloud={player?.words?.fan}
                      cloudSource="fan blog headlines"
                      color={FAN_COLOR}
                      unit={["fan post", "fan posts"]}
                    />
                    <TopicCloud
                      title="Media writes about"
                      lane={player?.media}
                      cloud={player?.words?.media}
                      cloudSource="headlines"
                      color={MEDIA_COLOR}
                      unit={["headline", "headlines"]}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={cn(type.micro, "text-muted-foreground")}>
                      Bigger words show up in more headlines. Fan words come from fan blog headlines
                      only, because social posts are scored but their text is not kept.
                    </p>
                    <Link
                      href={`/players/${encodeURIComponent(row.playerId)}?view=sentiment`}
                      className={cn(type.caption, "font-semibold underline-offset-4 hover:underline")}
                    >
                      Player sentiment →
                    </Link>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <MoreInfo>
        <p>
          The two lanes are never blended into one score. Both sides here cover the same 7 days,
          and a gap is only shown when both are measured. A side with only a few mentions can
          swing a lot, so check the counts when you open a player.
        </p>
      </MoreInfo>
    </section>
  );
}
