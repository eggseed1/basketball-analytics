import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { SentimentFanMediaGap } from "@/components/sentiment/sentiment-fan-media-gap";
import {
  formatSentimentDate,
  LaneOriginTag,
  sentimentPct,
} from "@/components/sentiment/sentiment-source";
import { getTeamSentimentBoard } from "@/data/queries/team-sentiment";
import type { CuratedSentimentLane } from "@/sentiment/curated-types";
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function LaneStat({ label, lane }: { label: string; lane?: CuratedSentimentLane }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className={cn(type.caption, "flex items-center gap-1.5 text-muted-foreground")}>
        {label}
        <LaneOriginTag lane={lane} />
      </dt>
      <dd className="text-lg font-semibold tabular-nums">
        {lane ? sentimentPct(lane.score) : "—"}
      </dd>
      {lane?.origin === "headlines" ? (
        <dd className={cn(type.caption, "text-muted-foreground")}>
          {lane.mentionVolume} headlines in the last 7 days
        </dd>
      ) : !lane ? (
        <dd className={cn(type.caption, "text-muted-foreground")}>Not enough coverage yet</dd>
      ) : null}
    </div>
  );
}

/**
 * Team Organization tab: franchise lanes plus roster players in the sentiment snapshot.
 */
export async function TeamSentimentIsland({ teamId }: { teamId: string }) {
  const board = getTeamSentimentBoard(teamId);
  if (!board) return null;
  const team = board.teamProfile;
  const sameKind =
    team?.fan && team?.media && (team.fan.origin === "curated") === (team.media.origin === "curated");

  return (
    <section
      id="sentiment"
      className="scroll-mt-16 flex flex-col gap-3 border-t border-border/70 pt-8"
      aria-label="Sentiment"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Sentiment</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Fan and media tone for the franchise and its tracked players, as of{" "}
            {formatSentimentDate(board.snapshotDate, true)}.
          </p>
        </div>
        <Link href="/sentiment?view=teams" className={cn(type.caption, "font-semibold underline")}>
          All teams →
        </Link>
      </div>

      <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        {team ? (
          <div className="flex flex-col gap-3 rounded-md border border-border/60 frost-surface-soft p-3">
            <div className="flex flex-wrap items-center gap-2">
              <TeamLogo teamKey={board.teamId} size="sm" />
              <p className={cn(type.bodySm, "font-semibold")}>Franchise</p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <LaneStat label="Fan lane" lane={team.fan} />
              <LaneStat label="Media lane" lane={team.media} />
            </dl>
            {sameKind ? (
              <SentimentFanMediaGap fanScore={team.fan!.score} mediaScore={team.media!.score} />
            ) : team.fan && team.media ? (
              <p className={cn(type.caption, "text-muted-foreground")}>
                No fan vs media gap. One lane is curated and the other is measured, so they
                aren&apos;t comparable.
              </p>
            ) : null}
            {team.headlines?.length ? (
              <ul className="flex flex-col gap-1">
                {team.headlines.map((headline) => (
                  <li key={headline.url} className={type.caption}>
                    <span className="mr-1.5 font-semibold tabular-nums text-muted-foreground">
                      {sentimentPct(headline.score)}
                    </span>
                    <a
                      href={headline.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {headline.title}
                    </a>
                    <span className="text-muted-foreground">
                      {" "}
                      · {headline.outlet}, {formatSentimentDate(headline.publishedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {board.players.length ? (
          <ul className="flex flex-col gap-2">
            {board.players.slice(0, 8).map((row) => (
              <li key={row.playerId}>
                <Link
                  href={`/players/${encodeURIComponent(row.playerId)}?view=sentiment`}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border/60 frost-surface-soft px-2 py-1.5 frost-surface-hover",
                    textLinkClassName
                  )}
                >
                  <PlayerHeadshot
                    playerId={row.playerId}
                    name={row.displayName}
                    teamKey={row.teamKey}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn(type.bodySm, "truncate font-semibold")}>{row.displayName}</p>
                    <p className={cn(type.caption, "flex flex-wrap items-center gap-1.5 text-muted-foreground")}>
                      Fan {row.fan ? sentimentPct(row.fan.score) : "—"}
                      <LaneOriginTag lane={row.fan ? { origin: row.fan.origin, mentionVolume: 0 } : null} />
                      · Media {row.media ? sentimentPct(row.media.score) : "—"}
                      <LaneOriginTag lane={row.media ? { origin: row.media.origin, mentionVolume: 0 } : null} />
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <p className={cn(type.caption, "text-muted-foreground")}>{board.disclaimer}</p>
      </div>
    </section>
  );
}
