import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { LaneOriginTag } from "@/components/sentiment/sentiment-source";
import { getSentimentMoversBoard } from "@/data/queries/home-sentiment";
import { SectionLink } from "@/components/ui/section-link";
import type { SentimentMoverRow } from "@/sentiment/curated-types";
import { formatBpm } from "@/sentiment/season-form";
import { formatOrdinal, type ToneGapRow, type ToneGapSide } from "@/sentiment/tone-vs-production";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function scorePct(score: number) {
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

function deltaLabel(delta: number) {
  const pts = Math.round(Math.abs(delta) * 50);
  return delta > 0 ? `+${pts}` : `−${pts}`;
}

function MoverList({
  tone,
  rows,
}: {
  tone: "up" | "down";
  rows: SentimentMoverRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className={cn(type.caption, "text-muted-foreground")}>
        No rotation player has moved this far in this direction yet.
      </p>
    );
  }

  const toneClass =
    tone === "up" ? "text-delta-up" : "text-delta-down";

  return (
    <ul className="flex min-w-0 flex-col divide-y divide-border/40">
        {rows.map((row) => (
          <li key={row.playerId}>
            <Link
              href={`/players/${encodeURIComponent(row.playerId)}`}
              data-motion="row"
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/70"
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
                <div className="flex min-w-0 items-center gap-1">
                  {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="xs" /> : null}
                  <span className={cn(type.caption, "truncate text-muted-foreground")}>
                    Fan {scorePct(row.fanScore)} · {row.mentionVolume} posts
                    {row.form ? ` · BPM ${formatBpm(row.form.bpm)}` : ""}
                  </span>
                </div>
              </div>
              <span
                className={cn(
                  type.bodySm,
                  "shrink-0 font-bold tabular-nums",
                  toneClass
                )}
              >
                {deltaLabel(row.delta)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
  );
}

function GapList({ title, rows, metricLabel }: { title: string; rows: ToneGapRow[]; metricLabel: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h4 className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {title}
      </h4>
      {rows.length ? (
        <ul className="flex min-w-0 flex-col divide-y divide-border/40">
          {rows.map((row) => (
            <li key={row.playerId}>
              <Link
                href={`/players/${encodeURIComponent(row.playerId)}?view=sentiment`}
                data-motion="row"
                className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/70"
              >
                <span className={cn(type.bodySm, "inline-flex min-w-0 items-center gap-1.5 font-semibold")}>
                  {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="xs" /> : null}
                  <span className="truncate">{row.displayName}</span>
                </span>
                <span className={cn(type.caption, "shrink-0 tabular-nums text-muted-foreground")}>
                  Mood {formatOrdinal(row.tonePct)} · {metricLabel} {formatOrdinal(row.productionPct)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(type.caption, "text-muted-foreground")}>No one is 25+ points apart.</p>
      )}
    </div>
  );
}

/** Fan mood ranked against this season's production, where the two disagree most. */
function FormGapBlock({ side }: { side: ToneGapSide }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className={cn(type.bodySm, "font-bold")}>Mood vs this season</h3>
          <p className={cn(type.caption, "text-muted-foreground")}>
            Percentile among {side.qualified} players with {side.minVolume}+ fan posts this week and a real{" "}
            {side.season} {side.metricLabel}.
          </p>
        </div>
        <SectionLink href="/sentiment?view=overrated">All gaps</SectionLink>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <GapList title="Talked up" rows={side.talkedUp} metricLabel={side.metricLabel} />
        <GapList title="Overlooked" rows={side.overlooked} metricLabel={side.metricLabel} />
      </div>
    </div>
  );
}

/** Home desk — fan sentiment risers & fallers, set against this season's production. */
export async function SentimentMoversPanel() {
  const board = await getSentimentMoversBoard(4, 7);
  if (!board) return null;

  const sample = board.risers[0] ?? board.fallers[0];
  const hasMovers = board.risers.length + board.fallers.length > 0;

  return (
    <section className="sports-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className={type.heading}>Sentiment movers</h2>
            {sample ? (
              <LaneOriginTag lane={{ origin: sample.origin, asOf: sample.asOf, mentionVolume: 0 }} />
            ) : null}
          </div>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {board.season} · rotation players · fan mood against the week before, in points
          </p>
        </div>
        <SectionLink href="/sentiment">League board</SectionLink>
      </div>

      {hasMovers ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <MoverList tone="up" rows={board.risers} />
          <MoverList tone="down" rows={board.fallers} />
        </div>
      ) : null}

      {board.formGap ? <FormGapBlock side={board.formGap} /> : null}

      <p className={cn(type.caption, "text-muted-foreground")}>{board.disclaimer}</p>
    </section>
  );
}
