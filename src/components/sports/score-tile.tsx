"use client";

import { memo, useState, type ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TransitionLink } from "@/components/continuity/query-nav";
import { GameCountdown } from "@/components/sports/game-countdown";
import {
  broadcastHint,
  formatTipClock,
  resolveSideBrand,
  sideShortName,
} from "@/components/sports/game-score-card";
import { LiveIndicator } from "@/components/sports/live-indicator";
import type { GameSummary } from "@/data/types";
import { type } from "@/lib/design-system";
import { parseTipOffMs } from "@/lib/game-countdown";
import { buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import {
  isFinalStatus,
  isLiveLikeStatus,
  isPreTipStatus,
  periodClockLabel,
  shouldDisplayScores,
  statusHeadline,
} from "@/lib/game-status";
import { gameSideBrandKey } from "@/lib/game-team-identity";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

export function gameTypeBadge(game: Pick<GameSummary, "gameType" | "cupChampionship">): string | null {
  if (game.cupChampionship) return "NBA Cup final";
  switch (game.gameType) {
    case "preseason":
      return "Preseason";
    case "playoff":
      return "Playoffs";
    case "play-in":
      return "Play-In";
    default:
      return null;
  }
}

/** "Final", "Final · OT", "Final · 2OT" from period count or ESPN detail. */
export function finalLabel(game: Pick<GameSummary, "period" | "statusDetail">): string {
  const period = game.period ?? 0;
  if (period > 4) return period === 5 ? "Final · OT" : `Final · ${period - 4}OT`;
  const ot = /\/(\d?OT)\b/i.exec(game.statusDetail ?? "")?.[1];
  return ot ? `Final · ${ot.toUpperCase()}` : "Final";
}

function StatusLine({ game }: { game: GameSummary }) {
  if (isLiveLikeStatus(game.status)) {
    const clock = periodClockLabel({
      status: game.status,
      period: game.period,
      displayClock: game.displayClock,
      statusDetail: game.statusDetail,
    });
    return (
      <span className="inline-flex items-center gap-2">
        <LiveIndicator />
        {clock ? <span className="font-semibold tabular-nums">{clock}</span> : null}
      </span>
    );
  }
  if (isFinalStatus(game.status)) {
    return <span className="font-semibold">{finalLabel(game)}</span>;
  }
  if (isPreTipStatus(game.status) && game.status !== "delayed") {
    return <PreTipStatus tipOffAt={game.tipOffAt} />;
  }
  return <span className="font-semibold">{statusHeadline(game.status)}</span>;
}

function PreTipStatus({ tipOffAt }: { tipOffAt?: string | null }) {
  const [now] = useState(() => Date.now());
  const tipMs = parseTipOffMs(tipOffAt);
  const soon = tipMs != null && tipMs > now && tipMs - now <= DAY_MS;
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="font-semibold tabular-nums">
        {formatTipClock(tipOffAt) ?? "Time TBD"}
      </span>
      {soon ? (
        <GameCountdown
          tipOffAt={tipOffAt}
          variant="line"
          className="text-muted-foreground"
        />
      ) : null}
    </span>
  );
}

function TeamRow({
  game,
  side,
  score,
  emphasis,
  winner,
}: {
  game: GameSummary;
  side: "away" | "home";
  score: number | null;
  emphasis: "strong" | "muted" | "plain";
  winner: boolean;
}) {
  const brand = resolveSideBrand(game, side, "era");
  const rawRecord = (side === "away" ? game.awayRecord : game.homeRecord)?.trim();
  // Preseason records read 0-0 for everyone.
  const record = rawRecord && rawRecord !== "0-0" ? rawRecord : null;
  return (
    <div className="contents">
      <HistoricalTeamMark brand={brand} size="sm" />
      <div className="flex min-w-0 items-baseline gap-2">
        <span
          className={cn(
            type.body,
            "truncate font-semibold",
            emphasis === "muted" && "text-muted-foreground"
          )}
        >
          {sideShortName(brand)}
        </span>
        {record ? (
          <span className={cn(type.caption, "shrink-0 tabular-nums text-muted-foreground")}>
            {record}
          </span>
        ) : null}
      </div>
      <span className="flex items-center justify-end gap-1.5">
        {score != null ? (
          <span
            className={cn(
              "text-[22px] leading-none tabular-nums tracking-tight",
              emphasis === "strong" ? "font-bold" : "font-semibold",
              emphasis === "muted" && "text-muted-foreground"
            )}
          >
            {score}
          </span>
        ) : null}
        <span
          aria-hidden
          className={cn(
            "size-0 border-y-[5px] border-r-[6px] border-y-transparent border-r-foreground",
            !winner && "invisible"
          )}
        />
      </span>
    </div>
  );
}

/**
 * Compact scoreboard tile: status line, two team rows, scores on the right.
 * Finals mute the loser; live games bold the leader.
 */
export const ScoreTile = memo(function ScoreTile({
  game,
  className,
  footer,
}: {
  game: GameSummary;
  className?: string;
  footer?: ReactNode;
}) {
  const matchup = buildGameMatchupTheme(
    gameSideBrandKey(game, "away"),
    gameSideBrandKey(game, "home")
  );
  const showScores = shouldDisplayScores({
    status: game.status,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
  });
  const final = isFinalStatus(game.status);
  const live = isLiveLikeStatus(game.status);
  const awayAhead = showScores && game.awayScore > game.homeScore;
  const homeAhead = showScores && game.homeScore > game.awayScore;
  const emphasisFor = (ahead: boolean, behind: boolean) =>
    ahead ? "strong" : behind && final ? "muted" : "plain";
  const badge = gameTypeBadge(game);
  const watch = isPreTipStatus(game.status) ? broadcastHint(game) : null;
  const awayBrand = resolveSideBrand(game, "away", "era");
  const homeBrand = resolveSideBrand(game, "home", "era");

  return (
    <GlassSurface
      as="article"
      effect="css"
      accentColor={matchup.awayWash}
      accentColorB={matchup.homeWash}
      className={cn(
        "group relative flex flex-col gap-3 p-3.5 transition-[transform,filter] duration-150 hover:-translate-y-px hover:brightness-[0.99] dark:hover:brightness-110",
        live && "ring-1 ring-red-600/30",
        className
      )}
    >
      <TransitionLink
        href={`/games/${game.id}`}
        className="absolute inset-0 z-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${awayBrand.abbreviation} at ${homeBrand.abbreviation}`}
      />
      <div className="pointer-events-none relative z-[1] flex flex-col gap-3">
        <div className={cn(type.caption, "flex items-center justify-between gap-2")}>
          <StatusLine game={game} />
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {watch ? <span className="truncate">{watch}</span> : null}
            {badge ? (
              <span className="glass-pill shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold">
                {badge}
              </span>
            ) : null}
          </span>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2">
          <TeamRow
            game={game}
            side="away"
            score={showScores ? game.awayScore : null}
            emphasis={emphasisFor(awayAhead, homeAhead)}
            winner={final && awayAhead}
          />
          <TeamRow
            game={game}
            side="home"
            score={showScores ? game.homeScore : null}
            emphasis={emphasisFor(homeAhead, awayAhead)}
            winner={final && homeAhead}
          />
        </div>
        {footer}
      </div>
    </GlassSurface>
  );
});
