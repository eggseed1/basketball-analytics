import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { LaneOriginTag } from "@/components/sentiment/sentiment-source";
import type {
  SentimentDivergenceRow,
  SentimentLaneOrigin,
  SentimentTopicHeatRow,
} from "@/sentiment/curated-types";
import { textLinkClassName, type } from "@/lib/design-system";
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
  const max = rows[0]?.weight ?? 1;
  const active = highlightTopic?.trim().toLowerCase();
  const fromHeadlines = origin === "headlines";

  return (
    <section className="flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className={cn(type.bodySm, "font-bold")}>Topic heat</h2>
          <LaneOriginTag lane={{ origin, mentionVolume: 0 }} />
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {fromHeadlines
            ? "Share of topic tags across NBA headlines from the last 7 days, tagged by keyword. It covers what outlets wrote about, not all discussion."
            : "Mention-weighted topics across the curated fan and media lanes. This is not a census of all discussion."}{" "}
          Click a topic to filter the players table.
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
    </section>
  );
}

export function SentimentDivergenceBoard({
  rows,
}: {
  rows: SentimentDivergenceRow[];
}) {
  if (!rows.length) return null;
  const allCurated = rows.every((row) => row.origin !== "measured");

  return (
    <section className="flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className={cn(type.bodySm, "font-bold")}>Fan vs media gaps</h2>
          {allCurated ? <LaneOriginTag lane={{ origin: "curated", mentionVolume: 0 }} /> : null}
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Largest disagreements between fan and media lanes. The two lanes are
          never blended into one score. A gap is only shown when both lanes come
          from the same kind of source, so a curated fan value is never compared
          with a measured headline score.
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
