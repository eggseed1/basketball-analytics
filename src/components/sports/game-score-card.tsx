import { memo, type ReactNode } from "react";
import { TransitionLink } from "@/components/continuity/query-nav";

import { GlassSurface } from "@/components/brand/glass-surface";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamIdentity } from "@/components/teams/team-identity";
import { GameCountdown } from "@/components/sports/game-countdown";
import { LiveIndicator } from "@/components/sports/live-indicator";
import type { GameSummary } from "@/data/types";
import { textLinkClassName, type } from "@/lib/design-system";
import { parseTipOffMs } from "@/lib/game-countdown";
import { buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import {
  gameSideBrandKey,
  gameSideCanonicalTeamId,
} from "@/lib/game-team-identity";
import {
  resolveHistoricalTeamBrand,
  type HistoricalBrandPresentation,
} from "@/lib/historical-team-brand";
import {
  isLiveLikeStatus,
  isPreTipStatus,
  periodClockLabel,
  shouldDisplayScores,
  statusHeadline,
} from "@/lib/game-status";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

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
  brand,
  priority = false,
  size = "md",
}: {
  brand: NonNullable<ReturnType<typeof resolveHistoricalTeamBrand>>;
  priority?: boolean;
  size?: "sm" | "md";
}) {
  return <HistoricalTeamMark brand={brand} size={size} priority={priority} />;
}

function sideShortName(
  brand: ReturnType<typeof resolveSideBrand>
): string {
  const nick = brand.nickname?.trim();
  if (nick) return nick;
  const display = brand.displayName?.trim() || "";
  if (/trail blazers/i.test(display)) return "Trail Blazers";
  if (/76ers/i.test(display)) return "76ers";
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1]!;
  return display || brand.abbreviation;
}

function formatTipClock(tipOffAt?: string | null): string | null {
  const ms = parseTipOffMs(tipOffAt);
  if (ms == null) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

function formatTipDate(tipOffAt?: string | null): string | null {
  const ms = parseTipOffMs(tipOffAt);
  if (ms == null) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

function MatchupSide({
  brand,
  teamKey,
  season,
  align,
  record,
}: {
  brand: ReturnType<typeof resolveSideBrand>;
  teamKey: string;
  season: string;
  align: "start" | "end";
  record?: string | null;
}) {
  const end = align === "end";
  const abbr = brand.abbreviation;
  const name = sideShortName(brand);
  const meta = record || abbr;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        end ? "items-end text-right" : "items-start text-left"
      )}
    >
      <div className={cn("flex items-center gap-2", end && "flex-row-reverse")}>
        <TeamIdentity
          teamKey={brand.canonicalTeamId || teamKey}
          label={abbr}
          season={season}
          className="pointer-events-auto"
          nameClassName="flex items-center no-underline hover:no-underline"
        >
          <StaticTeamMark brand={brand} priority />
        </TeamIdentity>
        <span
          className={cn(
            type.caption,
            "tabular-nums text-muted-foreground"
          )}
        >
          {meta}
        </span>
      </div>
      <TeamIdentity
        teamKey={brand.canonicalTeamId || teamKey}
        label={name}
        season={season}
        className="pointer-events-auto max-w-full"
        nameClassName="max-w-full no-underline hover:no-underline"
      >
        <span
          className={cn(
            type.bodySm,
            textLinkClassName,
            "truncate text-muted-foreground decoration-foreground/30"
          )}
        >
          {name}
        </span>
      </TeamIdentity>
    </div>
  );
}

function MatchupCenter({
  game,
  watch,
}: {
  game: GameSummary;
  watch: string | null;
}) {
  const live = isLiveLikeStatus(game.status);
  const preTip = isPreTipStatus(game.status);
  const showScores = shouldDisplayScores({
    status: game.status,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
  });
  const clock = periodClockLabel({
    status: game.status,
    period: game.period,
    displayClock: game.displayClock,
    statusDetail: game.statusDetail,
  });
  const awayScore = game.awayScore;
  const homeScore = game.homeScore;
  const awayLosing =
    awayScore != null && homeScore != null && awayScore < homeScore;
  const homeLosing =
    awayScore != null && homeScore != null && homeScore < awayScore;

  let primary: ReactNode;
  let secondary: ReactNode = null;

  if (showScores) {
    primary = (
      <span className="tabular-nums">
        <span className={awayLosing ? "text-muted-foreground" : undefined}>
          {awayScore}
        </span>
        <span className="px-1 font-medium text-muted-foreground">-</span>
        <span className={homeLosing ? "text-muted-foreground" : undefined}>
          {homeScore}
        </span>
      </span>
    );
    secondary = live ? (
      <span className="inline-flex items-center justify-center gap-1.5">
        <LiveIndicator />
        {clock}
      </span>
    ) : (
      statusHeadline(game.status)
    );
  } else if (live) {
    primary = <LiveIndicator />;
    secondary = clock;
  } else if (preTip) {
    primary = formatTipClock(game.tipOffAt) ?? "TBD";
    if (watch) {
      secondary = watch;
    } else {
      const tipMs = parseTipOffMs(game.tipOffAt);
      const soon =
        tipMs != null &&
        tipMs > Date.now() &&
        tipMs - Date.now() <= 24 * 60 * 60 * 1000;
      secondary = soon ? (
        <GameCountdown tipOffAt={game.tipOffAt} variant="line" />
      ) : (
        formatTipDate(game.tipOffAt)
      );
    }
  } else {
    primary = statusHeadline(game.status);
    secondary = watch;
  }

  return (
    <div className="flex min-w-[7.5rem] flex-col items-center justify-center gap-0.5 px-2 text-center">
      <div className={cn(type.heading, "tabular-nums")}>{primary}</div>
      {secondary ? (
        <div className={cn(type.caption, "text-muted-foreground")}>
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

function MatchupBoard({
  game,
  brandPresentation,
  href,
}: {
  game: GameSummary;
  brandPresentation: HistoricalBrandPresentation;
  href?: string;
}) {
  const awayBrand = resolveSideBrand(game, "away", brandPresentation);
  const homeBrand = resolveSideBrand(game, "home", brandPresentation);
  const awayKey = gameSideBrandKey(game, "away");
  const homeKey = gameSideBrandKey(game, "home");
  const awayAbbr = awayBrand.abbreviation;
  const homeAbbr = homeBrand.abbreviation;
  const watch = broadcastHint(game);
  const gameHref = href ?? `/games/${game.id}`;
  const awayRecord = game.awayRecord?.trim() || null;
  const homeRecord = game.homeRecord?.trim() || null;
  const ariaAway = awayRecord ? `${awayAbbr} ${awayRecord}` : awayAbbr;
  const ariaHome = homeRecord ? `${homeAbbr} ${homeRecord}` : homeAbbr;

  return (
    <>
      <TransitionLink
        href={gameHref}
        className="absolute inset-0 z-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${ariaAway} at ${ariaHome}`}
      />
      <div className="relative z-[1] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pointer-events-none">
        <MatchupSide
          brand={awayBrand}
          teamKey={awayKey}
          season={game.season}
          align="start"
          record={awayRecord}
        />
        <MatchupCenter game={game} watch={watch} />
        <MatchupSide
          brand={homeBrand}
          teamKey={homeKey}
          season={game.season}
          align="end"
          record={homeRecord}
        />
      </div>
    </>
  );
}

function resolveSideBrand(
  game: GameSummary,
  side: "home" | "away",
  presentation: HistoricalBrandPresentation
) {
  const canonicalId = gameSideCanonicalTeamId(game, side);
  const brand = resolveHistoricalTeamBrand(
    canonicalId,
    game.season,
    presentation
  );
  if (brand) return brand;
  const key = gameSideBrandKey(game, side);
  return {
    displayName: key,
    abbreviation: key.slice(0, 3).toUpperCase(),
    logoUrl: null as string | null,
    source: "text_fallback" as const,
    isHistorical: false,
    canonicalTeamId: canonicalId,
    city: "",
    nickname: "",
    palette: null,
  };
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
 * Lightweight matchup row for the gamefeed list - CSS frost (not SVG liquid)
 * so long scoreboards stay scrollable.
 */
export const GameMatchupRow = memo(function GameMatchupRow({
  game,
  className,
  brandPresentation = "era",
}: {
  game: GameSummary;
  className?: string;
  brandPresentation?: HistoricalBrandPresentation;
}) {
  const matchup = buildGameMatchupTheme(
    gameSideBrandKey(game, "away"),
    gameSideBrandKey(game, "home")
  );

  return (
    <GlassSurface
      as="article"
      effect="css"
      accentColor={matchup.awayWash}
      accentColorB={matchup.homeWash}
      className={cn("score-row relative px-3 py-3", className)}
    >
      <MatchupBoard game={game} brandPresentation={brandPresentation} />
    </GlassSurface>
  );
});

/** Compact matchup card with optional starter fives. */
export const GameScoreCard = memo(function GameScoreCard({
  game,
  awayStarters = [],
  homeStarters = [],
  className,
  href,
  brandPresentation = "era",
}: {
  game: GameSummary;
  awayStarters?: GameCardStarter[];
  homeStarters?: GameCardStarter[];
  className?: string;
  /** Override Game Lab link (e.g. Time Machine theme params). */
  href?: string;
  brandPresentation?: HistoricalBrandPresentation;
}) {
  const awayBrand = resolveSideBrand(game, "away", brandPresentation);
  const homeBrand = resolveSideBrand(game, "home", brandPresentation);
  const awayKey = gameSideBrandKey(game, "away");
  const homeKey = gameSideBrandKey(game, "home");
  const matchup = buildGameMatchupTheme(awayKey, homeKey);
  const hasStarters = awayStarters.length > 0 || homeStarters.length > 0;

  return (
    <GlassSurface
      as="article"
      effect="css"
      accentColor={matchup.awayWash}
      accentColorB={matchup.homeWash}
      className={cn(
        "score-row relative flex flex-col gap-2.5 px-3 py-3",
        className
      )}
    >
      <div className="relative">
        <MatchupBoard
          game={game}
          brandPresentation={brandPresentation}
          href={href}
        />
      </div>

      {hasStarters ? (
        <div className="flex flex-col gap-1.5 border-t border-border/70 pt-2">
          <StarterRow
            label={awayBrand.abbreviation}
            starters={awayStarters}
            teamKey={awayKey}
          />
          <StarterRow
            label={homeBrand.abbreviation}
            starters={homeStarters}
            teamKey={homeKey}
          />
        </div>
      ) : null}
    </GlassSurface>
  );
});
