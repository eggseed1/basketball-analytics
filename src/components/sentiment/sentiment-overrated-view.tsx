import Link from "next/link";
import type { CSSProperties } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { FAN_COLOR, MEDIA_COLOR } from "@/components/sentiment/sentiment-insights-panels";
import { formatSentimentDate, sentimentPct } from "@/components/sentiment/sentiment-source";
import { StorylinePlayerRow } from "@/components/sentiment/sentiment-storylines";
import type {
  SentimentRatingTalk,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
import { toneVsProduction, type ToneGapRow, type ToneGapSide } from "@/sentiment/tone-vs-production";
import { type, textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const PRODUCTION_COLOR = "rgb(16 185 129)";

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Tone percentile and production percentile on one 0–100 track. */
function GapTrack({ row, toneColor, index }: { row: ToneGapRow; toneColor: string; index: number }) {
  const lo = Math.min(row.tonePct, row.productionPct);
  const hi = Math.max(row.tonePct, row.productionPct);
  const motion = { "--i": index, "--mark-from": "50%" } as CSSProperties;
  return (
    <div className="relative h-3" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
      <div
        data-motion-bar="x"
        className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-foreground/25"
        style={{ ...motion, left: `${lo}%`, width: `${hi - lo}%` }}
      />
      <span
        data-motion-mark
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
        style={{ ...motion, left: `${row.productionPct}%`, backgroundColor: PRODUCTION_COLOR }}
      />
      <span
        data-motion-mark
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
        style={{ ...motion, left: `${row.tonePct}%`, backgroundColor: toneColor }}
      />
    </div>
  );
}

function GapList({
  title,
  rows,
  toneColor,
  unit,
  empty,
}: {
  title: string;
  rows: ToneGapRow[];
  toneColor: string;
  unit: string;
  empty: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h4 className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {title}
      </h4>
      {rows.length ? (
        <ul className="-mx-2 flex flex-col">
          {rows.map((row, index) => (
            <li key={row.playerId}>
              <Link
                href={`/players/${encodeURIComponent(row.playerId)}?view=sentiment`}
                data-hover-item
                className="flex flex-col gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-foreground/[0.04]"
                data-tip={`Tone ${sentimentPct(row.score)} from ${row.mentionVolume} ${unit}, ${ordinal(row.tonePct)} percentile`}
                data-tip-sub={`DRBL/100 ${row.drbl100.toFixed(2)}, ${ordinal(row.productionPct)} percentile`}
              >
                <span className="flex min-w-0 items-baseline justify-between gap-2">
                  <span className={cn(type.bodySm, "inline-flex min-w-0 items-center gap-1.5 font-semibold")}>
                    {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="xs" /> : null}
                    <span className="truncate">{row.displayName}</span>
                  </span>
                  <span className={cn(type.caption, "shrink-0 tabular-nums text-muted-foreground")}>
                    Tone {ordinal(row.tonePct)} · DRBL {ordinal(row.productionPct)}
                  </span>
                </span>
                <GapTrack row={row} toneColor={toneColor} index={index} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(type.caption, "text-muted-foreground")}>{empty}</p>
      )}
    </div>
  );
}

function GapSideCard({
  label,
  side,
  toneColor,
  unit,
  index,
}: {
  label: string;
  side: ToneGapSide | null;
  toneColor: string;
  unit: string;
  index: number;
}) {
  return (
    <article
      data-motion-item
      style={{ "--i": index } as CSSProperties}
      className="flex min-w-0 flex-col gap-3 rounded-[11px] bg-foreground/[0.035] p-4 ring-1 ring-inset ring-foreground/[0.06]"
    >
      <header className="flex flex-col gap-0.5">
        <h3 className={cn(type.bodySm, "font-bold")}>{label}</h3>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {side
            ? `${side.qualified} players with ${side.minVolume}+ ${unit} this week and ${side.season} DRBL/100.`
            : `Fewer than 20 players have enough ${unit} and a DRBL/100 yet, so this side is left blank.`}
        </p>
      </header>
      {side ? (
        <>
          <GapList
            title="Talked up"
            rows={side.talkedUp}
            toneColor={toneColor}
            unit={unit}
            empty="No player's tone runs 25+ points ahead of their production."
          />
          <GapList
            title="Overlooked"
            rows={side.overlooked}
            toneColor={toneColor}
            unit={unit}
            empty="No player's tone trails their production by 25+ points."
          />
        </>
      ) : null}
    </article>
  );
}

function RatingColumn({
  title,
  side,
  windowDays,
  index,
}: {
  title: string;
  side: SentimentRatingTalk["overrated"];
  windowDays: number;
  index: number;
}) {
  return (
    <article
      data-motion-item
      style={{ "--i": index } as CSSProperties}
      className="flex min-w-0 flex-col gap-2 rounded-[11px] bg-foreground/[0.035] p-4 ring-1 ring-inset ring-foreground/[0.06]"
    >
      <header className="flex flex-col gap-0.5">
        <h3 className={cn(type.bodySm, "font-bold")}>{title}</h3>
        <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {side.fanCount.toLocaleString()} fan {side.fanCount === 1 ? "post" : "posts"} and{" "}
          {side.mediaCount.toLocaleString()} {side.mediaCount === 1 ? "headline" : "headlines"} in the
          last {windowDays} days.
        </p>
      </header>
      {side.players.length ? (
        <ul className="-my-1 flex flex-col divide-y divide-border/50">
          {side.players.map((player) => (
            <StorylinePlayerRow key={player.playerId} player={player} showTone={false} />
          ))}
        </ul>
      ) : (
        <p className={cn(type.caption, "text-muted-foreground")}>No named players yet.</p>
      )}
    </article>
  );
}

export function SentimentOverratedView({
  players,
  ratingTalk,
}: {
  players: TrackedPlayerSentimentRow[];
  ratingTalk?: SentimentRatingTalk;
}) {
  const fan = toneVsProduction(players, "fan", { minVolume: 10 });
  const media = toneVsProduction(players, "media", { minVolume: 5 });

  return (
    <div className="flex flex-col gap-5">
      <section className="sports-card flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className={type.heading}>Tone vs production</h2>
          <p className={cn(type.bodySm, "max-w-3xl text-muted-foreground")}>
            Each player&apos;s tone this week is ranked against other qualified players, then set
            next to where their DRBL/100 ranked last season. &ldquo;Talked up&rdquo; means the tone
            ranks well above the production; &ldquo;overlooked&rdquo; means well below. It shows
            where talk and the box score disagree. It is not a ruling on who is overrated.
          </p>
          <p
            className={cn(type.caption, "flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground")}
          >
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: FAN_COLOR }} />
              Fan tone percentile
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: MEDIA_COLOR }} />
              Media tone percentile
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: PRODUCTION_COLOR }}
              />
              DRBL/100 percentile
            </span>
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <GapSideCard label="Fans" side={fan} toneColor={FAN_COLOR} unit="fan posts" index={0} />
          <GapSideCard label="Media" side={media} toneColor={MEDIA_COLOR} unit="headlines" index={1} />
        </div>
      </section>

      {ratingTalk ? (
        <section className="sports-card flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className={type.heading}>Called overrated or underrated</h2>
            <p className={cn(type.bodySm, "max-w-3xl text-muted-foreground")}>
              Posts and headlines that use words like overrated, overhyped, underrated or slept on
              and name a player. Headlines are checked back to the start of collection. Most fan
              posts are only tagged from {formatSentimentDate(ratingTalk.fanTaggedSince, true)} on, so the
              fan side starts small. A mention is not an endorsement; some of these argue the
              opposite.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <RatingColumn
              title="Called overrated"
              side={ratingTalk.overrated}
              windowDays={ratingTalk.windowDays}
              index={0}
            />
            <RatingColumn
              title="Called underrated"
              side={ratingTalk.underrated}
              windowDays={ratingTalk.windowDays}
              index={1}
            />
          </div>
        </section>
      ) : null}

      <p className={cn(type.caption, "text-muted-foreground")}>
        See{" "}
        <Link href="/sentiment?view=players" className={textLinkClassName}>
          every player
        </Link>{" "}
        for the full tone vs production scatter.
      </p>
    </div>
  );
}
