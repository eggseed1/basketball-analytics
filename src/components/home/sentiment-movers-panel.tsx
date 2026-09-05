import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { getSentimentMoversBoard } from "@/data/queries/home-sentiment";
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function scorePct(score: number) {
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

function deltaLabel(delta: number) {
  const pts = Math.round(Math.abs(delta) * 100);
  return delta > 0 ? `+${pts}` : `−${pts}`;
}

function MoverList({
  title,
  tone,
  rows,
}: {
  title: string;
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
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
          {title}
        </h3>
        <p className={cn(type.caption, "text-muted-foreground")}>
          No movers in this direction yet.
        </p>
      </div>
    );
  }

  const toneClass =
    tone === "up" ? "text-delta-up" : "text-delta-down";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {title}
      </h3>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
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
                <div className="flex items-center gap-1">
                  {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="xs" /> : null}
                  <span className={cn(type.caption, "text-muted-foreground")}>
                    Fan {scorePct(row.fanScore)}
                  </span>
                </div>
              </div>
              <span
                className={cn(
                  type.caption,
                  "shrink-0 font-semibold tabular-nums",
                  toneClass
                )}
              >
                {deltaLabel(row.delta)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Home desk — fan sentiment risers & fallers from curated snapshot. */
export async function SentimentMoversPanel() {
  const board = getSentimentMoversBoard(4, 7);
  if (!board) return null;

  return (
    <section className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className={type.heading}>Sentiment movers</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {board.season} · fan mood · {board.window} window
          </p>
        </div>
        <Link
          href="/sentiment"
          className={cn(type.bodySm, textLinkClassName, "text-muted-foreground")}
        >
          League board →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MoverList title="Risers" tone="up" rows={board.risers} />
        <MoverList title="Fallers" tone="down" rows={board.fallers} />
      </div>

      <p className={cn(type.caption, "text-muted-foreground")}>
        Prototype coverage · {board.disclaimer}
      </p>
    </section>
  );
}
