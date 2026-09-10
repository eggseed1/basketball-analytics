import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import type {
  SentimentDivergenceRow,
  SentimentTopicHeatRow,
} from "@/sentiment/curated-types";
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function scorePct(score: number) {
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

function gapLabel(gap: number) {
  const pts = Math.round(Math.abs(gap) * 100);
  return gap >= 0 ? `Fans +${pts}` : `Fans −${pts}`;
}

export function SentimentTopicHeat({
  rows,
  highlightTopic,
}: {
  rows: SentimentTopicHeatRow[];
  highlightTopic?: string;
}) {
  if (!rows.length) return null;
  const max = rows[0]?.weight ?? 1;
  const active = highlightTopic?.trim().toLowerCase();

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className={cn(type.bodySm, "font-bold")}>Topic heat</h2>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Mention-weighted topics across tracked fan and media lanes — not a
          census of all discussion. Click a topic to filter the roster board.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const isActive =
            active != null &&
            active.length > 0 &&
            row.topic.toLowerCase().includes(active);
          return (
          <li key={row.topic} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/sentiment?topic=${encodeURIComponent(row.topic)}`}
                className={cn(
                  type.bodySm,
                  "font-semibold capitalize hover:underline",
                  isActive && "text-primary"
                )}
              >
                {row.topic.replace(/_/g, " ")}
              </Link>
              <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                {Math.round(row.weight * 100)}% · {row.playerCount} players
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
          href="/sentiment"
          className={cn(type.caption, "font-semibold underline")}
        >
          Clear topic filter
        </Link>
      ) : null}
    </section>
  );
}

export function SentimentDivergenceBoard({
  rows,
}: {
  rows: SentimentDivergenceRow[];
}) {
  if (!rows.length) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className={cn(type.bodySm, "font-bold")}>Fan vs media gaps</h2>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Largest disagreements between fan and media lanes. Lanes stay
          separate — never blended into one unexplained score.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.playerId}>
            <Link
              href={`/players/${encodeURIComponent(row.playerId)}`}
              className={cn(
                "flex items-center gap-2 rounded-md border border-border/60 frost-surface-soft px-3 py-2 frost-surface-hover",
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
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {row.teamKey ? (
                    <TeamLogo teamKey={row.teamKey} size="xs" />
                  ) : null}
                  <span className={cn(type.caption, "text-muted-foreground")}>
                    Fan {scorePct(row.fanScore)} · Media{" "}
                    {scorePct(row.mediaScore)}
                  </span>
                </div>
              </div>
              <span
                className={cn(
                  type.caption,
                  "shrink-0 font-semibold tabular-nums",
                  row.gap >= 0 ? "text-delta-up" : "text-delta-down"
                )}
              >
                {gapLabel(row.gap)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
