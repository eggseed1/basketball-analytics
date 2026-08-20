"use client";

import { TransitionLink } from "@/components/continuity/query-nav";

import { GlassSurface } from "@/components/brand/glass-surface";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TeamIdentity } from "@/components/teams/team-identity";
import type { GameSummary } from "@/data/types";
import { textLinkClassName, type } from "@/lib/design-system";
import { buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import { cn } from "@/lib/utils";
import {
  gameSideBrandKey,
  gameSideCanonicalTeamId,
} from "@/lib/game-team-identity";
import { parseTipOffMs } from "@/lib/game-countdown";
import {
  isLiveLikeStatus,
  isPreTipStatus,
  periodClockLabel,
  shouldDisplayScores,
  statusHeadline,
} from "@/lib/game-status";
import {
  resolveHistoricalTeamBrand,
  type HistoricalBrandPresentation,
} from "@/lib/historical-team-brand";

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

function formatStripWhen(tipOffAt?: string | null): string | null {
  const ms = parseTipOffMs(tipOffAt);
  if (ms == null) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

function TeamRow({
  brand,
  score,
}: {
  brand: ReturnType<typeof resolveSideBrand>;
  score?: number | null;
}) {
  const teamKey = brand.canonicalTeamId || brand.abbreviation;
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <TeamIdentity
        teamKey={teamKey}
        label={brand.abbreviation}
        className="pointer-events-auto min-w-0"
        nameClassName="flex min-w-0 items-center gap-2 no-underline hover:no-underline"
      >
        <HistoricalTeamMark brand={brand} size="sm" />
        <span className={cn(type.body, textLinkClassName, "tracking-tight")}>
          {brand.abbreviation}
        </span>
      </TeamIdentity>
      {score != null ? (
        <span className={cn(type.body, "font-semibold tabular-nums tracking-tight")}>
          {score}
        </span>
      ) : null}
    </div>
  );
}

/** Compact homepage scoreboard tile - does not replace GameScoreCard elsewhere. */
export function HomeGameStripCard({ game }: { game: GameSummary }) {
  const awayBrand = resolveSideBrand(game, "away", "era");
  const homeBrand = resolveSideBrand(game, "home", "era");
  const matchup = buildGameMatchupTheme(
    gameSideBrandKey(game, "away"),
    gameSideBrandKey(game, "home")
  );
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
  const when = preTip
    ? formatStripWhen(game.tipOffAt) ?? statusHeadline(game.status)
    : statusHeadline(game.status);

  return (
    <GlassSurface
      as="article"
      accentColor={matchup.awayWash}
      accentColorB={matchup.homeWash}
      className="relative flex w-max min-w-[162px] shrink-0 flex-col gap-2.5 px-4 py-3"
    >
      <TransitionLink
        href={`/games/${game.id}`}
        className="absolute inset-0 z-0 rounded-md"
        aria-label={`${awayBrand.abbreviation} at ${homeBrand.abbreviation}`}
      />
      <div className="relative z-[1] flex flex-col gap-2.5 pointer-events-none">
        {live ? (
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-[#22703d] px-1.5 py-1 text-[12px] font-medium leading-none text-white">
              Live
            </span>
            {clock ? (
              <span
                className={cn(
                  type.caption,
                  "whitespace-nowrap font-medium tracking-tight text-muted-foreground"
                )}
              >
                {clock}
              </span>
            ) : null}
          </div>
        ) : (
          <p
            className={cn(
              type.caption,
              "whitespace-nowrap font-medium tracking-tight text-muted-foreground"
            )}
          >
            {when}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <TeamRow
            brand={awayBrand}
            score={showScores ? game.awayScore : undefined}
          />
          <TeamRow
            brand={homeBrand}
            score={showScores ? game.homeScore : undefined}
          />
        </div>
      </div>
    </GlassSurface>
  );
}
