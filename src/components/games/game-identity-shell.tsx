"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { GameLineupsPanel } from "@/components/games/game-lineups";
import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { GameCountdown } from "@/components/sports/game-countdown";
import {
  broadcastHint,
  formatTipClock,
  resolveSideBrand,
  sideShortName,
} from "@/components/sports/game-score-card";
import { LiveIndicator } from "@/components/sports/live-indicator";
import { finalLabel, gameTypeBadge } from "@/components/sports/score-tile";
import { useLiveGameRefresh } from "@/components/sports/use-live-scoreboard-refresh";
import { TeamIdentity } from "@/components/teams/team-identity";
import type { Game, GameSummary } from "@/data/types";
import { type } from "@/lib/design-system";
import { parseTipOffMs } from "@/lib/game-countdown";
import {
  isFinalStatus,
  isLiveLikeStatus,
  isPreTipStatus,
  periodClockLabel,
  shouldDisplayScores,
  statusHeadline,
} from "@/lib/game-status";
import { gameSideBrandKey } from "@/lib/game-team-identity";
import { needsLivePolling } from "@/lib/live-refresh-policy";
import { validateGamePresentation } from "@/lib/game-presentation";
import type { HistoricalBrandPresentation } from "@/lib/historical-team-brand";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

function toSummary(game: Game): GameSummary {
  return {
    ...game,
    totalPoints: game.homeScore + game.awayScore,
    margin: game.homeScore - game.awayScore,
    absMargin: Math.abs(game.homeScore - game.awayScore),
  };
}

function formatGameDate(game: Pick<Game, "gameDate" | "tipOffAt">): string | null {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(game.gameDate ?? "")) {
    return new Date(`${game.gameDate}T12:00:00Z`).toLocaleDateString("en-US", {
      ...opts,
      timeZone: "UTC",
    });
  }
  const tipMs = parseTipOffMs(game.tipOffAt);
  if (tipMs == null) return null;
  return new Date(tipMs).toLocaleDateString("en-US", {
    ...opts,
    timeZone: "America/New_York",
  });
}

export function periodLabel(index: number, total: number): string {
  if (index < 4) return `Q${index + 1}`;
  return total === 5 ? "OT" : `OT${index - 3}`;
}

function HeroTeam({
  game,
  side,
  brandPresentation,
  muted,
}: {
  game: GameSummary;
  side: "away" | "home";
  brandPresentation: HistoricalBrandPresentation;
  muted: boolean;
}) {
  const brand = resolveSideBrand(game, side, brandPresentation);
  const teamKey = brand.canonicalTeamId || gameSideBrandKey(game, side);
  const end = side === "home";
  const rawRecord = (side === "away" ? game.awayRecord : game.homeRecord)?.trim();
  const record = rawRecord && rawRecord !== "0-0" ? rawRecord : null;
  const city = brand.city?.trim() || null;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3.5",
        end ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"
      )}
    >
      <TeamIdentity
        teamKey={teamKey}
        label={brand.abbreviation}
        season={game.season}
        className="shrink-0"
        nameClassName="flex no-underline hover:no-underline"
      >
        <HistoricalTeamMark brand={brand} size="lg" priority />
      </TeamIdentity>
      <div className={cn("flex min-w-0 flex-col", end ? "sm:items-end" : "sm:items-start")}>
        {city ? (
          <span className={cn(type.caption, "hidden truncate text-muted-foreground sm:block")}>
            {city}
          </span>
        ) : null}
        <TeamIdentity
          teamKey={teamKey}
          label={sideShortName(brand)}
          season={game.season}
          className="max-w-full"
          nameClassName="max-w-full no-underline hover:no-underline"
        >
          <span
            className={cn(
              "block truncate text-[15px] font-bold tracking-tight sm:text-[22px]",
              muted && "text-muted-foreground"
            )}
          >
            <span className="sm:hidden">{brand.abbreviation}</span>
            <span className="hidden sm:inline">{sideShortName(brand)}</span>
          </span>
        </TeamIdentity>
        {record ? (
          <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
            {record}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function BigScore({ value, muted, winner, side }: { value: number; muted: boolean; winner: boolean; side: "away" | "home" }) {
  return (
    <span
      className={cn(
        "relative text-[36px] font-bold leading-none tracking-tight tabular-nums sm:text-[60px]",
        muted && "text-muted-foreground/70"
      )}
    >
      {value}
      {winner ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-0 -translate-y-1/2 border-y-[6px] border-y-transparent",
            side === "away"
              ? "-right-3 border-r-[6px] border-r-foreground sm:-right-5 sm:border-r-[7px]"
              : "-left-3 border-l-[6px] border-l-foreground sm:-left-5 sm:border-l-[7px]"
          )}
        />
      ) : null}
    </span>
  );
}

function PreTipCenter({ game }: { game: GameSummary }) {
  const [now] = useState(() => Date.now());
  const tipMs = parseTipOffMs(game.tipOffAt);
  const soon = tipMs != null && tipMs > now && tipMs - now <= DAY_MS;
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-[24px] font-bold leading-none tabular-nums sm:text-[32px]">
        {formatTipClock(game.tipOffAt) ?? "Time TBD"}
      </span>
      {soon ? (
        <GameCountdown
          tipOffAt={game.tipOffAt}
          variant="line"
          className={cn(type.caption, "text-muted-foreground")}
        />
      ) : null}
    </div>
  );
}

function StatusCenter({ game }: { game: GameSummary }) {
  if (isLiveLikeStatus(game.status)) {
    const clock = periodClockLabel({
      status: game.status,
      period: game.period,
      displayClock: game.displayClock,
      statusDetail: game.statusDetail,
    });
    return (
      <span className="flex flex-col items-center gap-1">
        <LiveIndicator />
        {clock ? (
          <span className={cn(type.caption, "font-semibold tabular-nums")}>{clock}</span>
        ) : null}
      </span>
    );
  }
  return (
    <span
      className={cn(
        type.caption,
        "font-bold uppercase tracking-[0.12em] text-muted-foreground"
      )}
    >
      {isFinalStatus(game.status) ? finalLabel(game) : statusHeadline(game.status)}
    </span>
  );
}

function LineScore({
  game,
  brandPresentation,
}: {
  game: GameSummary;
  brandPresentation: HistoricalBrandPresentation;
}) {
  const away = game.awayPeriodScores ?? [];
  const home = game.homePeriodScores ?? [];
  const n = Math.min(away.length, home.length);
  if (n === 0) return null;
  const rows = [
    { side: "away" as const, scores: away, total: game.awayScore },
    { side: "home" as const, scores: home, total: game.homeScore },
  ];
  const cell = "px-2 py-1 text-center tabular-nums sm:px-3";
  return (
    <div className="board-scroll-host w-full overflow-x-auto">
      <table className={cn(type.bodySm, "w-full")}>
        <caption className="sr-only">Points by period</caption>
        <thead>
          <tr className={cn(type.micro, "font-bold uppercase tracking-[0.1em] text-muted-foreground")}>
            <th scope="col" className="py-1 pr-2 text-left font-bold">
              <span className="sr-only">Team</span>
            </th>
            {Array.from({ length: n }, (_, i) => (
              <th key={i} scope="col" className={cn(cell, "font-bold")}>
                {periodLabel(i, n)}
              </th>
            ))}
            <th scope="col" className={cn(cell, "font-bold")}>
              T
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const other = row.side === "away" ? home : away;
            const brand = resolveSideBrand(game, row.side, brandPresentation);
            return (
              <tr key={row.side} className="border-t border-border/50">
                <th scope="row" className="py-1.5 pr-2 text-left">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <HistoricalTeamMark brand={brand} size="2xs" />
                    {brand.abbreviation}
                  </span>
                </th>
                {row.scores.slice(0, n).map((pts, i) => (
                  <td
                    key={i}
                    className={cn(
                      cell,
                      pts > (other[i] ?? 0) ? "font-semibold" : "text-muted-foreground"
                    )}
                  >
                    {pts}
                  </td>
                ))}
                <td className={cn(cell, "font-bold")}>{row.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const LIVE_BOX_SCORE_REFRESH_MS = 20_000;

/**
 * The header polls scores on its own; box score and team tables are server
 * rendered, so re-render the route while the game is live, at tip and at final.
 */
function useLiveBoxScoreRefresh(status: GameSummary["status"]) {
  const router = useRouter();
  const liveNow = isLiveLikeStatus(status);
  const final = isFinalStatus(status);
  const wasLive = useRef(liveNow);
  const wasPreTip = useRef(isPreTipStatus(status));

  useEffect(() => {
    if ((wasLive.current && final) || (wasPreTip.current && (liveNow || final))) {
      router.refresh();
    }
    wasLive.current = liveNow;
    wasPreTip.current = isPreTipStatus(status);
  }, [liveNow, final, status, router]);

  useEffect(() => {
    if (!liveNow) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, LIVE_BOX_SCORE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [liveNow, router]);
}

/**
 * Game hero: teams, score, status and the line score.
 * Refuses malformed empty FINAL shells (? 0-0 ?).
 */
export function GameIdentityShell({
  game,
  brandPresentation = "era",
  arrivalLabel,
}: {
  game: Game;
  brandPresentation?: HistoricalBrandPresentation;
  arrivalLabel?: string | null;
  pendingAnalysis?: boolean;
}) {
  const validation = validateGamePresentation(game);
  const summary = toSummary(game);
  const { game: live } = useLiveGameRefresh(summary, {
    season: game.season,
    enabled: needsLivePolling(game.status),
  });
  const shown = live ?? summary;
  useLiveBoxScoreRefresh(shown.status);
  if (!validation.canRenderScoreHeader) {
    return (
      <header className="sports-card flex flex-col gap-2 p-4 sm:p-5">
        <p
          className={cn(
            type.caption,
            "font-bold uppercase tracking-[0.12em] text-muted-foreground"
          )}
        >
          {game.season || "Game"}
        </p>
        <p className={cn(type.title, "font-semibold")}>
          Game details incomplete
        </p>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Team identity or final score could not be verified for this link.
          Deep features are hidden until the game resolves.
        </p>
      </header>
    );
  }

  const showScores = shouldDisplayScores({
    status: shown.status,
    homeScore: shown.homeScore,
    awayScore: shown.awayScore,
  });
  const final = isFinalStatus(shown.status);
  const awayAhead = showScores && shown.awayScore > shown.homeScore;
  const homeAhead = showScores && shown.homeScore > shown.awayScore;
  const badge = gameTypeBadge(shown) ?? "Regular season";
  const dateLabel = formatGameDate(shown);
  const watch = isPreTipStatus(shown.status) || isLiveLikeStatus(shown.status)
    ? broadcastHint(shown)
    : null;

  return (
    <MatchupWashCard
      as="header"
      awayTeamKey={gameSideBrandKey(shown, "away")}
      homeTeamKey={gameSideBrandKey(shown, "home")}
      intensity="hero"
      className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn(type.caption, "font-semibold text-muted-foreground")}>
          {dateLabel ? (
            <>
              {dateLabel}
              <span className="mx-1.5 text-muted-foreground/50">·</span>
            </>
          ) : null}
          {shown.season}
          {arrivalLabel ? (
            <>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              {arrivalLabel}
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {watch ? (
            <span className={cn(type.caption, "text-muted-foreground")}>{watch}</span>
          ) : null}
          <span
            className={cn(
              type.caption,
              "glass-pill rounded-md px-2.5 py-1 font-semibold text-foreground"
            )}
          >
            {badge}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-6">
        <HeroTeam
          game={shown}
          side="away"
          brandPresentation={brandPresentation}
          muted={final && homeAhead}
        />
        {showScores ? (
          <div className="grid grid-cols-2 items-center justify-items-center gap-x-6 gap-y-1.5 sm:grid-cols-[auto_auto_auto] sm:gap-x-8">
            <BigScore value={shown.awayScore} side="away" muted={final && homeAhead} winner={final && awayAhead} />
            <div className="order-last col-span-2 sm:order-none sm:col-span-1">
              <StatusCenter game={shown} />
            </div>
            <BigScore value={shown.homeScore} side="home" muted={final && awayAhead} winner={final && homeAhead} />
          </div>
        ) : isPreTipStatus(shown.status) && shown.status !== "delayed" ? (
          <PreTipCenter game={shown} />
        ) : (
          <StatusCenter game={shown} />
        )}
        <HeroTeam
          game={shown}
          side="home"
          brandPresentation={brandPresentation}
          muted={final && awayAhead}
        />
      </div>

      <GameLineupsPanel
        game={shown}
        awayLabel={sideShortName(resolveSideBrand(shown, "away", brandPresentation))}
        homeLabel={sideShortName(resolveSideBrand(shown, "home", brandPresentation))}
        awayTeamKey={gameSideBrandKey(shown, "away") ?? null}
        homeTeamKey={gameSideBrandKey(shown, "home") ?? null}
      />

      {showScores ? <LineScore game={shown} brandPresentation={brandPresentation} /> : null}
    </MatchupWashCard>
  );
}
