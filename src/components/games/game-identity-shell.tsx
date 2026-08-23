import { GameMatchupBoard } from "@/components/sports/game-score-card";
import type { Game, GameSummary } from "@/data/types";
import { type } from "@/lib/design-system";
import { statusHeadline } from "@/lib/game-status";
import { validateGamePresentation } from "@/lib/game-presentation";
import {
  resolveHistoricalTeamBrand,
  type HistoricalBrandPresentation,
} from "@/lib/historical-team-brand";
import { cn } from "@/lib/utils";

function gameTypeLabel(gameType: Game["gameType"]): string {
  switch (gameType) {
    case "playoff":
      return "Playoffs";
    case "play-in":
      return "Play-In";
    case "preseason":
      return "Preseason";
    default:
      return "Regular season";
  }
}

function toSummary(game: Game): GameSummary {
  return {
    ...game,
    totalPoints: game.homeScore + game.awayScore,
    margin: game.homeScore - game.awayScore,
    absMargin: Math.abs(game.homeScore - game.awayScore),
  };
}

/**
 * Stable game identity frame — same matchup-row format as the scores list.
 * Refuses malformed empty FINAL shells (? 0-0 ?).
 */
export function GameIdentityShell({
  game,
  brandPresentation = "era",
  arrivalLabel,
  pendingAnalysis = false,
}: {
  game: Game;
  brandPresentation?: HistoricalBrandPresentation;
  arrivalLabel?: string | null;
  pendingAnalysis?: boolean;
}) {
  const validation = validateGamePresentation(game);
  if (!validation.canRenderScoreHeader) {
    return (
      <header className="sports-card flex flex-col gap-2 p-4 sm:p-5">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {game.season || "Game"}
        </p>
        <p className="text-[15px] font-semibold tracking-tight">
          Game details incomplete
        </p>
        <p className="text-[13px] text-muted-foreground">
          Team identity or final score could not be verified for this link.
          Deep features are hidden until the game resolves.
        </p>
      </header>
    );
  }

  // Resolve era-correct brands before the stable header paints (no modern flash).
  resolveHistoricalTeamBrand(game.homeTeamId, game.season, brandPresentation);
  resolveHistoricalTeamBrand(game.awayTeamId, game.season, brandPresentation);

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          )}
        >
          {game.gameDate}
          <span className="mx-1.5 text-muted-foreground/50">·</span>
          {game.season}
          {arrivalLabel ? (
            <>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              {arrivalLabel}
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              type.caption,
              "glass-pill rounded-md px-2.5 py-1 font-semibold text-foreground"
            )}
          >
            {gameTypeLabel(game.gameType)}
          </span>
          <span
            className={cn(
              type.caption,
              "glass-pill glass-pill-active rounded-md px-2.5 py-1 font-semibold uppercase tracking-wide"
            )}
          >
            {statusHeadline(game.status)}
            {pendingAnalysis ? " · …" : null}
          </span>
        </div>
      </div>

      <GameMatchupBoard
        game={toSummary(game)}
        brandPresentation={brandPresentation}
        href={false}
        className="px-4 py-4 sm:px-5 sm:py-5"
      />
    </header>
  );
}
