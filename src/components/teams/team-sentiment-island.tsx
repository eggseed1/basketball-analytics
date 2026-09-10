import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { SentimentFanMediaGap } from "@/components/sentiment/sentiment-fan-media-gap";
import { getTeamSentimentBoard } from "@/data/queries/team-sentiment";
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function scorePct(score: number) {
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

/**
 * Team Organization tab — roster players present in the curated sentiment snapshot.
 */
export async function TeamSentimentIsland({ teamId }: { teamId: string }) {
  const board = getTeamSentimentBoard(teamId);
  if (!board) return null;

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
            Tracked fan/media perception for roster players in the{" "}
            {board.season} prototype snapshot ({board.window}).
          </p>
        </div>
        <Link
          href="/sentiment"
          className={cn(type.caption, "font-semibold underline")}
        >
          League board →
        </Link>
      </div>

      <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        {board.teamProfile ? (
          <div className="flex flex-col gap-2 rounded-md border border-border/60 frost-surface-soft p-3">
            <div className="flex flex-wrap items-center gap-2">
              <TeamLogo teamKey={board.teamId} size="sm" />
              <p className={cn(type.bodySm, "font-semibold")}>
                Franchise discourse
              </p>
              <span className={cn(type.caption, "text-muted-foreground")}>
                {board.teamProfile.source === "team_observation"
                  ? "Observation-backed"
                  : "Roster rollup"}
              </span>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  Fan lane
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {scorePct(board.teamProfile.fan.score)}
                </dd>
              </div>
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  Media lane
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {scorePct(board.teamProfile.media.score)}
                </dd>
              </div>
            </dl>
            <SentimentFanMediaGap
              fanScore={board.teamProfile.fan.score}
              mediaScore={board.teamProfile.media.score}
            />
          </div>
        ) : null}

        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Avg fan
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {board.fanAverage != null ? scorePct(board.fanAverage) : "—"}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Avg media
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {board.mediaAverage != null ? scorePct(board.mediaAverage) : "—"}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Fan mentions
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {board.mentionVolume.toLocaleString()}
            </dd>
          </div>
        </dl>

        {board.fanAverage != null && board.mediaAverage != null ? (
          <p className={cn(type.caption, "text-muted-foreground")}>
            Squad gap (fan − media):{" "}
            <span className="font-semibold text-foreground">
              {Math.round((board.fanAverage - board.mediaAverage) * 100)} pts
            </span>
            . Individual lanes stay separate on player pages.
          </p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {board.players.slice(0, 8).map((row) => (
            <li key={row.playerId}>
              <Link
                href={`/players/${encodeURIComponent(row.playerId)}`}
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
                  <p className={cn(type.bodySm, "truncate font-semibold")}>
                    {row.displayName}
                  </p>
                  <p className={cn(type.caption, "text-muted-foreground")}>
                    Fan{" "}
                    {row.fan != null ? scorePct(row.fan.score) : "—"} · Media{" "}
                    {row.media != null ? scorePct(row.media.score) : "—"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <p className={cn(type.caption, "text-muted-foreground")}>
          {board.disclaimer}
        </p>
      </div>
    </section>
  );
}
