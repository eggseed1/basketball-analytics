import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import type { GameSummary } from "@/data/types";
import { resolveTeamBrand, teamLogoUrl } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

function statusLabel(game: GameSummary): string {
  if (game.status === "final") return "Final";
  if (game.status === "in_progress") return "Live";
  if (
    game.status !== "scheduled" &&
    game.homeScore != null &&
    game.awayScore != null &&
    (game.homeScore > 0 || game.awayScore > 0)
  ) {
    return "Final";
  }
  if (game.statusDetail) {
    const tip = game.statusDetail.split(" - ").slice(1).join(" - ").trim();
    if (tip) return tip;
    return game.statusDetail;
  }
  if (game.tipOffAt) {
    try {
      return new Date(game.tipOffAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      // fall through
    }
  }
  return game.gameDate.slice(5).replace("-", "/");
}

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
  return (
    <span
      className="group/starter relative inline-flex"
      title={starter.name}
      tabIndex={0}
      aria-label={starter.name}
    >
      <PlayerHeadshot
        playerId={starter.id}
        name={starter.name}
        teamKey={teamKey != null ? String(teamKey) : undefined}
        size="xs"
        className="ring-1 ring-black/10"
      />
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-30 -translate-x-1/2",
          "whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background shadow-md",
          "opacity-0 transition-opacity group-hover/starter:opacity-100 group-focus-within/starter:opacity-100"
        )}
      >
        {starter.name}
      </span>
    </span>
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

/**
 * Lightweight matchup row for the gamefeed list - no client islands.
 * Prefer this over GameScoreCard when rendering dozens of games.
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
  const awayAbbr = teamAbbr(awayKey, away?.abbr);
  const homeAbbr = teamAbbr(homeKey, home?.abbr);
  const status = statusLabel(game);
  const isLive = game.status === "in_progress";
  const showScores =
    game.status === "final" ||
    game.status === "in_progress" ||
    (game.status !== "scheduled" &&
      game.awayScore != null &&
      game.homeScore != null &&
      (game.awayScore > 0 || game.homeScore > 0));

  return (
    <Link
      href={`/games/${game.id}`}
      className={cn(
        "sports-card flex items-center gap-3 px-3 py-2.5 transition hover:bg-secondary/60",
        className
      )}
    >
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
      <span
        className={cn(
          "shrink-0 text-right text-[12px] font-medium tabular-nums text-muted-foreground",
          isLive && "font-semibold text-foreground"
        )}
      >
        {status}
      </span>
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
  const awayScore = game.awayScore;
  const homeScore = game.homeScore;
  const showScores =
    game.status === "final" ||
    game.status === "in_progress" ||
    (game.status !== "scheduled" &&
      awayScore != null &&
      homeScore != null &&
      (awayScore > 0 || homeScore > 0));

  const awayAbbr = teamAbbr(awayKey, away?.abbr);
  const homeAbbr = teamAbbr(homeKey, home?.abbr);
  const status = statusLabel(game);
  const isLive = game.status === "in_progress";
  const hasStarters = awayStarters.length > 0 || homeStarters.length > 0;

  return (
    <Link
      href={`/games/${game.id}`}
      className={cn(
        "sports-card flex flex-col gap-2.5 px-3 py-2.5 transition hover:bg-secondary/60",
        className
      )}
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

        <span
          className={cn(
            "shrink-0 text-right text-[12px] font-medium tabular-nums text-muted-foreground",
            isLive && "font-semibold text-foreground"
          )}
        >
          {status}
        </span>
      </div>

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
    </Link>
  );
}
