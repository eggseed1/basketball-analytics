import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import { formatSentimentDate, sentimentPct } from "@/components/sentiment/sentiment-source";
import type { LeagueSentimentSnapshot, SentimentSourceSummary } from "@/sentiment/curated-types";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type, textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function toneClass(score: number): string {
  if (score >= 0.2) return "border-emerald-600/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (score <= -0.2) return "border-rose-600/35 bg-rose-500/10 text-rose-700 dark:text-rose-300";
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
          The newest NBA headlines behind the media lanes, with the tone score each one got. Tone
          is scored from the headline and the first lines of the summary using a word list tuned
          for basketball (so &quot;waived&quot; reads negative and &quot;extension&quot; positive).
          It hasn&apos;t been checked against hand labels yet, so expect misreads.
          {info?.itemCount
            ? ` ${info.itemCount.toLocaleString()} headlines stored since ${formatSentimentDate(info.firstDate, true)}.`
            : ""}
        </p>
      </div>
      {headlines.length ? (
        <ul className="sports-card divide-y divide-border/60">
          {headlines.map((row) => (
            <li key={row.url} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
              <span
                className={cn(
                  "inline-flex w-14 shrink-0 justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  toneClass(row.score)
                )}
                title="Headline tone, 50% is neutral"
              >
                {sentimentPct(row.score)}
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
                      href={`/teams/${encodeURIComponent(teamId)}?tab=organization`}
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
