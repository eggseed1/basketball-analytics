import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import {
  formatSentimentDate,
  ratingLabel,
  sentimentPct,
} from "@/components/sentiment/sentiment-source";
import { MoreInfo } from "@/components/ui/more-info";
import type { LeagueSentimentSnapshot, SentimentSourceSummary } from "@/sentiment/curated-types";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type, textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function toneClass(score: number): string {
  if (score >= 0.2) return "border-positive/35 bg-positive/10 text-positive";
  if (score <= -0.2) return "border-negative/35 bg-negative/10 text-negative";
  return "border-border/70 bg-secondary/60 text-muted-foreground";
}

export function SentimentHeadlinesList({
  headlines,
  sources,
}: {
  headlines: NonNullable<LeagueSentimentSnapshot["latestHeadlines"]>;
  sources: SentimentSourceSummary | null;
}) {
  const info = sources?.headlines;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className={cn(type.bodySm, "font-bold")}>Latest headlines</h2>
        <p className={cn(type.caption, "max-w-3xl text-muted-foreground")}>
          The newest headlines behind the media lanes, with each one&apos;s tone score. Expect
          some misreads.
        </p>
        <MoreInfo>
          <p>
            {info?.toneModel
              ? "When a headline names one player, the label is a language model's rating of its tone toward that player. Other headlines show a word-list score from the headline and the first lines of the summary, where 50% is neutral."
              : "Tone is scored from the headline and the first lines of the summary using a word list tuned for basketball (so \"waived\" reads negative and \"extension\" positive). Checked against 127 labeled headlines, it matched the label about half the time."}
            {info?.itemCount
              ? ` ${info.itemCount.toLocaleString()} headlines stored since ${formatSentimentDate(info.firstDate, true)}.`
              : ""}
          </p>
        </MoreInfo>
      </div>
      {headlines.length ? (
        <ul className="sports-card divide-y divide-border/60">
          {headlines.map((row) => (
            <li
              key={row.url}
              className="group flex flex-col gap-1.5 px-4 py-3 hover:bg-foreground/[0.035] sm:flex-row sm:items-start sm:gap-3"
            >
              <span
                className={cn(
                  "inline-flex w-16 shrink-0 cursor-help justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-[scale,box-shadow] duration-200 group-hover:scale-105 group-hover:shadow-sm",
                  toneClass(row.rating ?? row.score)
                )}
                data-tip={row.rating !== undefined ? "Language model rating" : "Word-list tone"}
                data-tip-sub={
                  row.rating !== undefined
                    ? `This headline's tone toward ${row.players[0]?.name ?? "the player"}`
                    : "Headline and summary, 50% is neutral"
                }
              >
                {row.rating !== undefined ? ratingLabel(row.rating) : sentimentPct(row.score)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(type.bodySm, "font-semibold", textLinkClassName)}
                >
                  {row.title}
                </a>
                <div className={cn(type.caption, "flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground")}>
                  <span>
                    {row.outlet} · {formatSentimentDate(row.publishedAt)}
                  </span>
                  {row.teamIds.map((teamId) => (
                    <Link
                      key={teamId}
                      href={`/teams/${encodeURIComponent(teamId)}?tab=sentiment`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <TeamLogo teamKey={teamId} size="xs" />
                      {resolveTeamBrand(teamId)?.abbr ?? teamId}
                    </Link>
                  ))}
                  {row.players.map((player) => (
                    <Link
                      key={player.id}
                      href={`/players/${encodeURIComponent(player.id)}?view=sentiment`}
                      className="hover:text-foreground hover:underline"
                    >
                      {player.name}
                    </Link>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(type.caption, "text-muted-foreground")}>No headlines ingested yet.</p>
      )}
    </section>
  );
}
