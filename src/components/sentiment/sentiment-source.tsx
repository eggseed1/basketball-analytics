import type {
  CuratedSentimentLane,
  SentimentLaneOrigin,
  SentimentSourceSummary,
} from "@/sentiment/curated-types";
import Link from "next/link";

import { MoreInfo } from "@/components/ui/more-info";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function sentimentPct(score: number): string {
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

const RATING_LABEL = { 1: "Positive", 0: "Neutral", [-1]: "Negative" } as const;

/** A model rating of one headline toward one player. */
export function ratingLabel(rating: -1 | 0 | 1): string {
  return RATING_LABEL[rating];
}

export function formatSentimentDate(iso?: string | null, withYear = false): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

const ORIGIN_LABEL: Record<SentimentLaneOrigin, string> = {
  curated: "Curated",
  headlines: "Headlines",
  reddit: "Reddit",
  fans: "Fans",
};

const ORIGIN_HINT: Record<SentimentLaneOrigin, string> = {
  curated: "Hand-written prototype value, not measured.",
  headlines: "Average tone of publisher headlines that name this subject.",
  reddit: "Average tone of post titles from approved subreddits.",
  fans: "Average tone of team fan blog headlines, Bluesky posts and comments on NBA YouTube channels (teams, team podcasts and league shows).",
};

export function laneOriginLabel(origin?: SentimentLaneOrigin): string {
  return origin ? ORIGIN_LABEL[origin] : "Curated";
}

/** What one counted item is called for a lane of this origin. */
export function laneUnit(origin?: SentimentLaneOrigin): string {
  if (origin === "headlines") return "headlines";
  if (origin === "reddit" || origin === "fans") return "posts";
  return "mentions";
}

export function LaneOriginTag({
  lane,
  className,
  inactive = false,
}: {
  lane?: Pick<CuratedSentimentLane, "origin" | "asOf" | "mentionVolume"> | null;
  className?: string;
  /** Source exists in the pipeline but has produced no data yet. */
  inactive?: boolean;
}) {
  if (!lane) return null;
  const origin = lane.origin ?? "curated";
  const measured = origin !== "curated";
  const title = `${ORIGIN_HINT[origin]}${lane.asOf ? ` Latest sample ${formatSentimentDate(lane.asOf, true)}.` : ""}`;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold leading-4",
        inactive
          ? "border-border bg-muted/40 text-muted-foreground"
          : measured
            ? "border-emerald-600/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-amber-600/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        className
      )}
    >
      {ORIGIN_LABEL[origin]}
      {lane.asOf ? <span className="font-normal opacity-80">· {formatSentimentDate(lane.asOf)}</span> : null}
    </span>
  );
}

function fanPartsText(fans: NonNullable<SentimentSourceSummary["fans"]>): string {
  const n = (platform: keyof typeof fans.platforms) => fans.platforms[platform] ?? 0;
  const parts = [
    n("fan_blog")
      ? `${n("fan_blog").toLocaleString()} headlines from ${fans.blogCount} team fan blogs`
      : null,
    n("bluesky") ? `${n("bluesky").toLocaleString()} Bluesky posts` : null,
    n("youtube") ? `${n("youtube").toLocaleString()} comments on NBA YouTube channels (teams, team podcasts and league shows)` : null,
    n("reddit") ? `${n("reddit").toLocaleString()} Reddit post titles` : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** One line per source: what it is, how much of it there is, and how fresh it is. */
export function SentimentSourcesStrip({
  sources,
  snapshotDate,
}: {
  sources: SentimentSourceSummary | null;
  snapshotDate: string | null;
}) {
  const headlines = sources?.headlines;
  const reddit = sources?.reddit;
  const fans = sources?.fans;
  const curated = sources?.curated;
  const fanCount = fans?.itemCount ?? reddit?.itemCount ?? 0;
  return (
    <div className={cn(type.caption, "flex flex-col gap-1.5 text-muted-foreground")}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-foreground">
          Data as of {formatSentimentDate(snapshotDate, true)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LaneOriginTag lane={{ origin: "headlines", asOf: headlines?.asOf ?? undefined, mentionVolume: 0 }} />
          {headlines?.itemCount ? `${headlines.itemCount.toLocaleString()} headlines` : "none yet"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LaneOriginTag
            lane={{ origin: fans ? "fans" : "reddit", asOf: (fans ?? reddit)?.asOf ?? undefined, mentionVolume: 0 }}
            inactive={!fanCount}
          />
          {fanCount ? `${fanCount.toLocaleString()} fan posts` : "none yet"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LaneOriginTag lane={{ origin: "curated", asOf: curated?.asOf ?? undefined, mentionVolume: 0 }} />
          prototype values, not measured
        </span>
      </p>
      <p>
        {fans?.toneModel
          ? "A language model rates the tone of headlines, fan posts and comments toward the players they name. Team scores and fan posts from before the model still use a word list, so read those as rough."
          : headlines?.toneModel
            ? "A language model rates each headline's tone toward the players it names. Fan comments and posts are scored with a word list, so read fan scores as rough."
            : "Tone comes from a word list, so read scores as rough."}
      </p>
      <MoreInfo summary="Sources and method">
      <ul className="flex flex-col gap-1">
        <li className="flex flex-wrap items-baseline gap-1.5">
          <LaneOriginTag lane={{ origin: "headlines", asOf: headlines?.asOf ?? undefined, mentionVolume: 0 }} />
          {headlines?.itemCount ? (
            <span>
              Media lanes. {headlines.itemCount.toLocaleString()} NBA headlines from{" "}
              {headlines.outlets.join(", ")}, {formatSentimentDate(headlines.firstDate)} to{" "}
              {formatSentimentDate(headlines.asOf)}. A player needs {headlines.floor} headlines in
              the last 7 days to get a score.{" "}
              {headlines.toneModel ? (
                <>
                  A language model (Llama 3.3 70B, run on Cloudflare) rates each headline as
                  positive, neutral or negative toward each player it names. Checked against 127
                  labeled headlines, it matched the label about 7 times in 10 and never rated one
                  the opposite way. Players named only in the summary, and team scores, still use
                  a word list. {Math.round((headlines.ratedShare ?? 0) * 100)}% of this
                  week&apos;s player mentions have a model rating.
                </>
              ) : (
                <>
                  Tone comes from a word list. Checked against 127 labeled headlines, it matched
                  the label about half the time, so read it as rough.
                </>
              )}
            </span>
          ) : (
            <span>No headlines ingested yet.</span>
          )}
        </li>
        <li className="flex flex-wrap items-baseline gap-1.5">
          {fans ? (
            <>
              <LaneOriginTag
                lane={{ origin: "fans", asOf: fans.asOf ?? undefined, mentionVolume: 0 }}
                inactive={!fans.itemCount}
              />
              {fans.itemCount ? (
                <span>
                  Fan lanes. {fans.itemCount.toLocaleString()} fan posts: {fanPartsText(fans)},{" "}
                  {formatSentimentDate(fans.firstDate)} to {formatSentimentDate(fans.asOf)}.
                  {fans.platforms.reddit ? "" : " Reddit isn't connected yet."} A player or team needs{" "}
                  {fans.floor} posts in the last 7 days to get a score. Comments under the same
                  video share weight, so 100 comments on one video count for less than 100 posts
                  spread across many places.{" "}
                  {fans.toneModel ? (
                    <>
                      Fan blog headlines get the same model rating as news headlines. Bluesky posts
                      and YouTube comments that name a player are rated by the same model when they
                      are collected, up to a nightly limit. Checked against 143 labeled fan posts, it
                      matched the label about 3 times in 4 and rated 2 the opposite way. The word
                      list matched about half and rated 18 the opposite way. Older posts, posts past
                      the nightly limit and team scores keep the word list.{" "}
                      {Math.round((fans.ratedShare ?? 0) * 100)}% of this week&apos;s player
                      mentions in posts and comments have a model rating.
                    </>
                  ) : headlines?.toneModel ? (
                    "Fan blog headlines get the same model rating as news headlines. Comments and posts are scored with a word list that matched hand labels about half the time, so read it as rough."
                  ) : (
                    "Tone comes from a word list that matched hand labels about half the time, so read it as rough."
                  )}
                </span>
              ) : (
                <span>No fan posts collected yet. Fan lanes below use curated values until they are.</span>
              )}
            </>
          ) : (
            <>
              <LaneOriginTag
                lane={{ origin: "reddit", asOf: reddit?.asOf ?? undefined, mentionVolume: 0 }}
                inactive={!reddit?.itemCount}
              />
              {reddit?.itemCount ? (
                <span>
                  Fan lanes. {reddit.itemCount.toLocaleString()} posts from approved subreddits. A
                  player needs {reddit.floor} posts in the last 7 days to get a score.
                </span>
              ) : (
                <span>Not connected yet. Fan lanes below use curated values until it is.</span>
              )}
            </>
          )}
        </li>
        <li className="flex flex-wrap items-baseline gap-1.5">
          <LaneOriginTag lane={{ origin: "curated", asOf: curated?.asOf ?? undefined, mentionVolume: 0 }} />
          <span>
            Hand-written prototype values dated {formatSentimentDate(curated?.asOf, true)}. They show
            how the board works and are not measurements.
          </span>
        </li>
      </ul>
      <p>
        Fan and media tone are kept separate from performance metrics and Movement Center
        evidence. The{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          privacy page
        </Link>{" "}
        lists what is kept from each source.
      </p>
      </MoreInfo>
    </div>
  );
}
