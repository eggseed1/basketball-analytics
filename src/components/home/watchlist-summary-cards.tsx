"use client";

import { useLocale } from "next-intl";

import { TeamLogo } from "@/components/brand/team-logo";
import { LocalTipTime } from "@/components/sports/local-tip-time";
import { AppLink } from "@/components/ui/app-link";
import { formatGameCalendarDate } from "@/i18n/format-date";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  opponentText,
  playerLineText,
  resultText,
  standingText,
  trendText,
  type WatchGame,
  type WatchPlayerStatus,
  type WatchStatus,
  type WatchTeamStatus,
} from "@/lib/watchlist-status";
import { cn } from "@/lib/utils";

const WEEK_MS = 6 * 24 * 60 * 60 * 1000;

const TONE = {
  neutral: "text-muted-foreground",
  alert: "text-[#b42828] dark:text-[#ff8a8a]",
  positive: "text-[color:var(--accent-positive)]",
  caution: "text-[#8a5a00] dark:text-[#f5c451]",
} as const;

function shortDate(iso: string, locale: string): string {
  return formatGameCalendarDate(iso, locale, "monthDay") ?? iso;
}

/** Live first, then the next tip, then the latest final as a fallback. */
export function featuredWatchGame(status: WatchStatus): WatchGame | null {
  return status.live ?? status.next ?? status.last;
}

function gameLabel(game: WatchGame): string {
  if (game.state === "live") return "Live";
  if (game.state === "final") return "Last";
  return game.gameType === "preseason" ? "Next · Preseason" : "Next";
}

/** Compact matchup card that opens the game page. */
export function WatchlistGameCard({
  game,
  focusTeamId,
  fetchedAt,
  className,
}: {
  game: WatchGame;
  focusTeamId: string | null;
  fetchedAt: number;
  className?: string;
}) {
  const locale = useLocale();
  const ourId = focusTeamId;
  const ourBrand = ourId ? resolveTeamBrand(ourId) : null;
  const ourAbbr = ourBrand?.abbr ?? null;
  const oppAbbr = game.opponentAbbr || "TBD";

  const tipStyle =
    game.tipOffAt &&
    Number.isFinite(Date.parse(game.tipOffAt)) &&
    Date.parse(game.tipOffAt) - fetchedAt < WEEK_MS
      ? "dayClockZone"
      : "date";

  const scoreTone =
    game.teamScore != null && game.opponentScore != null
      ? game.teamScore > game.opponentScore
        ? "positive"
        : game.teamScore < game.opponentScore
          ? "caution"
          : "neutral"
      : "neutral";

  return (
    <AppLink
      href={`/games/${game.gameId}`}
      data-motion="card"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md border border-border/50 bg-background/70 px-2.5 py-2 transition-colors hover:bg-background",
        className
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="type-caption font-semibold tracking-tight text-muted-foreground">
          {gameLabel(game)}
        </span>
        {game.state === "upcoming" || game.state === "live" ? (
          <span className="type-caption min-w-0 truncate font-medium text-muted-foreground">
            <LocalTipTime
              tipOffAt={game.tipOffAt}
              style={tipStyle}
              nbaDate={game.date}
              fallback={shortDate(game.date, locale)}
            />
          </span>
        ) : null}
      </div>

      {ourId && ourAbbr ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <TeamLogo
              teamKey={game.home ? game.opponentId : ourId}
              size="xs"
              textAbbr={game.home ? oppAbbr : ourAbbr}
            />
            <span className="type-body-sm font-semibold tabular-nums">
              {game.home ? oppAbbr : ourAbbr}
            </span>
          </span>
          <span className="type-caption text-muted-foreground">{game.home ? "vs" : "@"}</span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <TeamLogo
              teamKey={game.home ? ourId : game.opponentId}
              size="xs"
              textAbbr={game.home ? ourAbbr : oppAbbr}
            />
            <span className="type-body-sm font-semibold tabular-nums">
              {game.home ? ourAbbr : oppAbbr}
            </span>
          </span>
          {game.state === "final" && game.teamScore != null && game.opponentScore != null ? (
            <span className={cn("ml-auto shrink-0 type-caption font-semibold", TONE[scoreTone])}>
              {game.teamScore}-{game.opponentScore}
            </span>
          ) : game.state === "live" ? (
            <span className={cn("ml-auto shrink-0 type-caption font-semibold", TONE.alert)}>Live</span>
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <TeamLogo teamKey={game.opponentId} size="xs" textAbbr={oppAbbr} />
          <span className="type-body-sm min-w-0 truncate font-semibold">
            {opponentText(game)}
          </span>
          {game.state === "final" && resultText(game) ? (
            <span className={cn("ml-auto shrink-0 type-caption font-semibold", TONE[scoreTone])}>
              {resultText(game)}
            </span>
          ) : null}
        </div>
      )}
    </AppLink>
  );
}

function StatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="min-w-0 rounded-md bg-secondary/60 px-2 py-1.5">
      <p className="type-caption text-muted-foreground">{label}</p>
      <p className={cn("truncate text-[12px] font-semibold leading-snug", TONE[tone])}>{value}</p>
    </div>
  );
}

/** Player form card: last line, trend, DRBL, injury, plus next game when known. */
export function WatchlistPlayerSummaryCard({
  status,
  fetchedAt,
}: {
  status: WatchPlayerStatus;
  fetchedAt: number;
}) {
  const injury = status.injury;
  const lastLine =
    status.last && status.line?.gameId === status.last.gameId
      ? playerLineText(status.line)
      : null;
  const lastResult = status.last ? resultText(status.last) : null;
  const next = status.live ?? status.next;

  const chips: Array<{ id: string; label: string; value: string; tone: keyof typeof TONE }> = [];
  if (injury) {
    chips.push({
      id: "injury",
      label: injury.statusLabel,
      value: injury.injury ?? injury.statusLabel,
      tone: injury.status === "out" ? "alert" : "caution",
    });
  }
  if (lastLine || lastResult) {
    chips.push({
      id: "last",
      label: "Last game",
      value: [lastLine, lastResult].filter(Boolean).join(" · "),
      tone:
        status.last && status.last.teamScore != null && status.last.opponentScore != null
          ? status.last.teamScore > status.last.opponentScore
            ? "positive"
            : status.last.teamScore < status.last.opponentScore
              ? "caution"
              : "neutral"
          : "neutral",
    });
  }
  if (status.trend) {
    const delta = status.trend.recentPpg - status.trend.seasonPpg;
    chips.push({
      id: "trend",
      label: `Last ${status.trend.recentGames}`,
      value: trendText(status.trend).replace(/^Last \d+:\s*/, ""),
      tone: delta >= 2 ? "positive" : delta <= -2 ? "caution" : "neutral",
    });
  }
  if (status.drbl) {
    chips.push({
      id: "drbl",
      label: `DRBL/100 · ${status.drbl.season}`,
      value: `${status.drbl.value > 0 ? "+" : ""}${status.drbl.value.toFixed(1)}`,
      tone: status.drbl.value >= 1 ? "positive" : status.drbl.value <= -1 ? "caution" : "neutral",
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" data-motion="card">
      {chips.length > 0 ? (
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          {chips.map((chip) => (
            <StatChip key={chip.id} label={chip.label} value={chip.value} tone={chip.tone} />
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-border/50 bg-background/70 px-2.5 py-2 text-[12px] text-muted-foreground">
          No recent games yet.
        </p>
      )}
      {next ? (
        <WatchlistGameCard game={next} focusTeamId={status.teamId} fetchedAt={fetchedAt} />
      ) : null}
    </div>
  );
}

/** Team card: next (or live/last) game plus a standing chip when we have one. */
export function WatchlistTeamSummaryCard({
  status,
  fetchedAt,
}: {
  status: WatchTeamStatus;
  fetchedAt: number;
}) {
  const game = featuredWatchGame(status);
  const standing = status.standing;

  return (
    <div className="flex min-w-0 flex-col gap-2" data-motion="card">
      {game ? (
        <WatchlistGameCard game={game} focusTeamId={status.id} fetchedAt={fetchedAt} />
      ) : (
        <p className="rounded-md border border-border/50 bg-background/70 px-2.5 py-2 text-[12px] text-muted-foreground">
          No upcoming games on the board yet.
        </p>
      )}
      {standing ? (
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          <StatChip label="Standing" value={standingText(standing)} tone={standing.rank <= 6 ? "positive" : standing.rank >= 11 ? "caution" : "neutral"} />
          {standing.lastTen ? (
            <StatChip label="Last 10" value={standing.lastTen} />
          ) : standing.streak ? (
            <StatChip label="Streak" value={standing.streak} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Body under the pin header: cards, not only a link into the entity page. */
export function WatchlistPinSummary({
  status,
  fetchedAt,
}: {
  status: WatchStatus | undefined;
  fetchedAt: number;
}) {
  if (!status) {
    return (
      <p className="rounded-md border border-dashed border-border/60 px-2.5 py-3 text-center text-[12px] text-muted-foreground">
        Checking the board…
      </p>
    );
  }
  if (status.kind === "player") {
    return <WatchlistPlayerSummaryCard status={status} fetchedAt={fetchedAt} />;
  }
  return <WatchlistTeamSummaryCard status={status} fetchedAt={fetchedAt} />;
}
