import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { LaneOriginTag } from "@/components/sentiment/sentiment-source";
import { getSentimentMoversBoard } from "@/data/queries/home-sentiment";
import { SectionLink } from "@/components/ui/section-link";
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
  rows: Array<{
    playerId: string;
    displayName: string;
    teamKey?: string;
    fanScore: number;
    delta: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <p className={cn(type.caption, "text-muted-foreground")}>
        No movers in this direction yet.
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
                <div className="flex items-center gap-1">
                  {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="xs" /> : null}
                  <span className={cn(type.caption, "text-muted-foreground")}>
                    Fan {scorePct(row.fanScore)}
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

/** Home desk — fan sentiment risers & fallers from curated snapshot. */
export async function SentimentMoversPanel() {
  const board = await getSentimentMoversBoard(4, 7);
  if (!board) return null;
  const sample = board.risers[0] ?? board.fallers[0];

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
            {board.season} · fan mood · change over {board.window}, in percentage points
          </p>
        </div>
        <SectionLink href="/sentiment">League board</SectionLink>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MoverList tone="up" rows={board.risers} />
        <MoverList tone="down" rows={board.fallers} />
      </div>

      <p className={cn(type.caption, "text-muted-foreground")}>{board.disclaimer}</p>
    </section>
  );
}
