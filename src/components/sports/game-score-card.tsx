import Link from "next/link";
import type { CSSProperties } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamLogo } from "@/components/brand/team-logo";
import { GameCountdown } from "@/components/sports/game-countdown";
import { LiveFreshness } from "@/components/sports/live-freshness";
import { LiveIndicator } from "@/components/sports/live-indicator";
import type { GameSummary } from "@/data/types";
import { buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import {
  isLiveLikeStatus,
  isPreTipStatus,
  periodClockLabel,
  shouldDisplayScores,
  statusHeadline,
} from "@/lib/game-status";
import { resolveTeamBrand, teamLogoUrl } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

function teamAbbr(key: string | number, brandAbbr?: string) {
  return brandAbbr ?? String(key).toUpperCase();
}

export type GameCardStarter = {
  id: string;
  name: string;
};

function StarterChip({
  starter,
  teamKey,
}: {
  starter: GameCardStarter;
  teamKey?: string | number;
}) {
  const team = teamKey != null ? String(teamKey) : undefined;
  const brand = team ? resolveTeamBrand(team) : undefined;
  return (
    <PlayerIdentity
      playerId={starter.id}
      name={starter.name}
      teamKey={team}
      teamLabel={brand?.abbr ?? team}
      variant="chip"
      className="relative z-[1] inline-flex"
      nameClassName="rounded-full ring-1 ring-black/10"
    >
      <PlayerHeadshot
        playerId={starter.id}
        name={starter.name}
        teamKey={team}
        size="xs"
      />
    </PlayerIdentity>
  );
}

function StarterRow({
  label,
  starters,
  teamKey,
}: {
  label: string;
  starters: GameCardStarter[];
  teamKey?: string | number;
}) {
  if (!starters.length) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center -space-x-1.5">
        {starters.slice(0, 5).map((s) => (
          <StarterChip key={s.id} starter={s} teamKey={teamKey} />
        ))}
      </div>
    </div>
  );
}

/** Tiny server-safe logo (no client hydration) for dense lists. */
function StaticTeamMark({
  teamKey,
  abbr,
}: {
  teamKey: string | number;
  abbr: string;
}) {
  const src = teamLogoUrl(String(teamKey));
  if (!src) {
    return (
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">
        {abbr.slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      className="size-7 shrink-0 object-contain"
      loading="lazy"
    />
  );
}

function GameStatusAside({ game }: { game: GameSummary }) {
  const live = isLiveLikeStatus(game.status);
  const preTip = isPreTipStatus(game.status);
  const clock = periodClockLabel({
    status: game.status,
    period: game.period,
    displayClock: game.displayClock,
    statusDetail: game.statusDetail,
  });

  if (live) {
    return (
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <LiveIndicator />
        {clock ? (
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {clock}
          </span>
        ) : null}
        <LiveFreshness retrievedAt={game.retrievedAt} />
      </span>
    );
  }

  if (preTip) {
    return <GameCountdown tipOffAt={game.tipOffAt} />;
  }

  return (
    <span className="shrink-0 text-right text-[12px] font-medium text-muted-foreground">
      {statusHeadline(game.status)}
    </span>
  );
}

function broadcastHint(game: GameSummary): string | null {
  const names = (game.broadcasts ?? [])
    .filter((b) => b.medium !== "radio")
    .map((b) => b.label)
    .slice(0, 2);
  if (!names.length) return null;
  return names.join(" · ");
}

/**
 * Lightweight matchup row for the gamefeed list - no client islands except
 * countdown/live when needed (GameCountdown / LiveIndicator are client).
 */
export function GameMatchupRow({
  game,
  className,
}: {
  game: GameSummary;
  className?: string;
}) {
  const awayKey = game.awayTeamAbbr ?? game.awayTeamId;
  const homeKey = game.homeTeamAbbr ?? game.homeTeamId;
  const away = resolveTeamBrand(awayKey);
  const home = resolveTeamBrand(homeKey);
  const matchup = buildGameMatchupTheme(awayKey, homeKey);
  const awayAbbr = teamAbbr(awayKey, away?.abbr);
  const homeAbbr = teamAbbr(homeKey, home?.abbr);
  const showScores = shouldDisplayScores({
    status: game.status,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
  });
  const watch = broadcastHint(game);

  return (
    <Link
      href={`/games/${game.id}`}
      className={cn(
        "sports-card matchup-wash matchup-wash--subtle flex flex-col gap-1 px-3 py-2.5 transition hover:brightness-[0.98]",
        className
      )}
      style={matchup.cssVars as CSSProperties}
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StaticTeamMark teamKey={awayKey} abbr={awayAbbr} />
          <span className="w-9 shrink-0 text-[13px] font-semibold tracking-tight">
            {awayAbbr}
          </span>
          {showScores ? (
            <span className="w-8 text-right text-[15px] font-bold tabular-nums">
              {game.awayScore}
            </span>
          ) : null}
          <span className="shrink-0 px-0.5 text-[11px] font-medium text-muted-foreground">
            @
          </span>
          {showScores ? (
            <span className="w-8 text-[15px] font-bold tabular-nums">
              {game.homeScore}
            </span>
          ) : null}
          <span className="w-9 shrink-0 text-[13px] font-semibold tracking-tight">
            {homeAbbr}
          </span>
          <StaticTeamMark teamKey={homeKey} abbr={homeAbbr} />
        </div>
        <GameStatusAside game={game} />
      </div>
      {watch ? (
        <p className="pl-9 text-[11px] text-muted-foreground">
          Where to watch · {watch}
        </p>
      ) : null}
    </Link>
  );
}

/** Compact matchup card with optional starter fives. */
export function GameScoreCard({
  game,
  awayStarters = [],
  homeStarters = [],
  className,
}: {
  game: GameSummary;
  awayStarters?: GameCardStarter[];
  homeStarters?: GameCardStarter[];
  className?: string;
}) {
  const awayKey = game.awayTeamAbbr ?? game.awayTeamId;
  const homeKey = game.homeTeamAbbr ?? game.homeTeamId;
  const away = resolveTeamBrand(awayKey);
  const home = resolveTeamBrand(homeKey);
  const matchup = buildGameMatchupTheme(awayKey, homeKey);
  const awayScore = game.awayScore;
  const homeScore = game.homeScore;
  const showScores = shouldDisplayScores({
    status: game.status,
    homeScore,
    awayScore,
  });

  const awayAbbr = teamAbbr(awayKey, away?.abbr);
  const homeAbbr = teamAbbr(homeKey, home?.abbr);
  const hasStarters = awayStarters.length > 0 || homeStarters.length > 0;
  const watch = broadcastHint(game);

  return (
    <article
      className={cn(
        "sports-card matchup-wash matchup-wash--subtle flex flex-col gap-2.5 px-3 py-2.5 transition hover:brightness-[0.98]",
        className
      )}
      style={matchup.cssVars as CSSProperties}
    >
      <Link
        href={`/games/${game.id}`}
        className="flex flex-col gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TeamLogo teamKey={awayKey} size="sm" />
            <span className="w-9 shrink-0 text-[13px] font-semibold tracking-tight">
              {awayAbbr}
            </span>
            {showScores ? (
              <span
                className={cn(
                  "w-8 text-right text-[15px] font-bold tabular-nums",
                  homeScore != null &&
                    awayScore != null &&
                    awayScore < homeScore &&
                    "text-muted-foreground"
                )}
              >
                {awayScore}
              </span>
            ) : null}

            <span className="shrink-0 px-0.5 text-[11px] font-medium text-muted-foreground">
              @
            </span>

            {showScores ? (
              <span
                className={cn(
                  "w-8 text-[15px] font-bold tabular-nums",
                  homeScore != null &&
                    awayScore != null &&
                    homeScore < awayScore &&
                    "text-muted-foreground"
                )}
              >
                {homeScore}
              </span>
            ) : null}
            <span className="w-9 shrink-0 text-[13px] font-semibold tracking-tight">
              {homeAbbr}
            </span>
            <TeamLogo teamKey={homeKey} size="sm" />
          </div>

          <GameStatusAside game={game} />
        </div>

        {watch ? (
          <p className="text-[11px] text-muted-foreground">
            Where to watch · {watch}
          </p>
        ) : null}
      </Link>

      {hasStarters ? (
        <div className="flex flex-col gap-1.5 border-t border-border/70 pt-2">
          <StarterRow
            label={awayAbbr}
            starters={awayStarters}
            teamKey={awayKey}
          />
          <StarterRow
            label={homeAbbr}
            starters={homeStarters}
            teamKey={homeKey}
          />
        </div>
      ) : null}
    </article>
  );
}
