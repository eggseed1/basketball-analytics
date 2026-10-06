"use client";

import type { CSSProperties } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";

import { GlassSurface } from "@/components/brand/glass-surface";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TeamIdentity } from "@/components/teams/team-identity";
import type { GameSummary } from "@/data/types";
import { type } from "@/lib/design-system";
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
  if (brand?.logoUrl) return brand;
  // Modern CDN mark when era resolver only returned a text fallback.
  const key = gameSideBrandKey(game, side);
  const modern = resolveHistoricalTeamBrand(key, game.season, "modern_surface");
  if (modern?.logoUrl) return modern;
  if (brand) return brand;
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

/** League time (US Eastern), so the server and browser render the same label. */
function formatStripWhen(tipOffAt: string | null | undefined, withDate: boolean): string | null {
  const ms = parseTipOffMs(tipOffAt);
  if (ms == null) return null;
  try {
    const at = new Date(ms);
    const timeZone = "America/New_York";
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      ...(withDate ? { month: "short", day: "numeric" } : {}),
    }).format(at);
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
    return withDate ? `${day}, ${time}` : `${day} ${time}`;
  } catch {
    return null;
  }
}

function TeamRow({
  brand,
  score,
  lost = false,
}: {
  brand: ReturnType<typeof resolveSideBrand>;
  score?: number | null;
  lost?: boolean;
}) {
  const teamKey = brand.canonicalTeamId || brand.abbreviation;
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <TeamIdentity
        teamKey={teamKey}
        label={brand.abbreviation}
        className="pointer-events-auto min-w-0"
        nameClassName="flex min-w-0 items-center gap-2 no-underline hover:no-underline"
      >
        <HistoricalTeamMark brand={brand} size="sm" />
        <span
          className={cn(
            type.body,
            "font-semibold tracking-tight",
            lost && "text-muted-foreground"
          )}
        >
          {brand.abbreviation}
        </span>
      </TeamIdentity>
      {score != null ? (
        <span
          className={cn(
            "text-[24px] leading-none font-bold tabular-nums tracking-tight",
            lost && "font-semibold text-muted-foreground"
          )}
        >
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
  const finalAt = game.status === "final" ? formatStripWhen(game.tipOffAt, false) : null;
  const when = preTip
    ? formatStripWhen(game.tipOffAt, true) ?? statusHeadline(game.status)
    : statusHeadline(game.status);
  const winner =
    game.status === "final" && game.homeScore !== game.awayScore
      ? game.homeScore > game.awayScore
        ? "home"
        : "away"
      : null;
  const orbStrength = (side: "home" | "away") =>
    winner == null ? 0.8 : winner === side ? 1 : 0.45;

  return (
    <GlassSurface
      as="article"
      className="relative flex w-max min-w-[168px] shrink-0 flex-col gap-2.5 rounded-[var(--card-radius)] px-4 py-3.5"
      style={{ background: "var(--strip-card-bg)" }}
    >
      <span
        aria-hidden
        className="strip-orb"
        style={
          {
            left: -60,
            top: 2,
            background: matchup.awayWash,
            "--orb-strength": orbStrength("away"),
          } as CSSProperties
        }
      />
      <span
        aria-hidden
        className="strip-orb strip-orb--b"
        style={
          {
            right: -60,
            bottom: -16,
            background: matchup.homeWash,
            "--orb-strength": orbStrength("home"),
          } as CSSProperties
        }
      />
      <TransitionLink
        href={`/games/${game.id}`}
        className="absolute inset-0 z-0 rounded-[inherit]"
        aria-label={`${awayBrand.abbreviation} at ${homeBrand.abbreviation}`}
      />
      <div className="relative z-[1] flex flex-col gap-2.5 pointer-events-none">
        {live ? (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#22703d] px-2 py-1 text-[12px] font-semibold leading-none text-white">
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
        ) : game.status === "final" ? (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-foreground/[0.08] px-2 py-1 text-[12px] font-semibold leading-none text-foreground/80">
              {statusHeadline(game.status)}
            </span>
            {finalAt ? (
              <span
                className={cn(
                  type.caption,
                  "whitespace-nowrap font-medium tracking-tight text-muted-foreground"
                )}
              >
                {finalAt}
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
            lost={winner === "home"}
          />
          <TeamRow
            brand={homeBrand}
            score={showScores ? game.homeScore : undefined}
            lost={winner === "away"}
          />
        </div>
      </div>
    </GlassSurface>
  );
}
