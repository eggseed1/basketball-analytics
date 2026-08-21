import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import type { Game } from "@/data/types";
import { buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import {
  gameSideBrandKey,
  gameSideCanonicalTeamId,
} from "@/lib/game-team-identity";
import {
  resolveHistoricalTeamBrand,
  type HistoricalBrandPresentation,
  type HistoricalTeamBrand,
} from "@/lib/historical-team-brand";
import {
  shouldDisplayScores,
  statusHeadline,
} from "@/lib/game-status";
import { validateGamePresentation } from "@/lib/game-presentation";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

function resolveSideBrand(
  game: Game,
  side: "home" | "away",
  presentation: HistoricalBrandPresentation
): HistoricalTeamBrand | null {
  const canonicalId = gameSideCanonicalTeamId(game, side);
  if (!canonicalId) return null;
  const brand = resolveHistoricalTeamBrand(
    canonicalId,
    game.season,
    presentation
  );
  if (brand) return brand;
  const key = String(gameSideBrandKey(game, side) || "").trim();
  if (!key) return null;
  return {
    displayName: key,
    abbreviation: key.slice(0, 3).toUpperCase(),
    logoUrl: null,
    source: "text_fallback",
    isHistorical: false,
    canonicalTeamId: canonicalId,
    city: "",
    nickname: "",
    palette: null,
  };
}

/**
 * Stable game identity frame — teams, score, date.
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

  const awayKey = gameSideBrandKey(game, "away");
  const homeKey = gameSideBrandKey(game, "home");
  const awayBrand = resolveSideBrand(game, "away", brandPresentation);
  const homeBrand = resolveSideBrand(game, "home", brandPresentation);
  if (!awayBrand || !homeBrand) {
    return (
      <header className="sports-card flex flex-col gap-2 p-4 sm:p-5">
        <p className="text-[15px] font-semibold tracking-tight">
          Game details incomplete
        </p>
        <p className="text-[13px] text-muted-foreground">
          Team branding could not be resolved.
        </p>
      </header>
    );
  }

  const matchup = buildGameMatchupTheme(awayKey, homeKey);
  const showScores =
    validation.canRenderScoreHeader &&
    shouldDisplayScores({
      status: game.status,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
    }) &&
    !(
      game.status === "final" &&
      game.homeScore === 0 &&
      game.awayScore === 0 &&
      !game.gameDate
    );

  return (
    <header
      className="sports-card matchup-wash matchup-wash--subtle flex flex-col gap-3 p-4 sm:p-5"
      style={matchup.cssVars as CSSProperties}
    >
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {game.gameDate} · {game.season}
        {arrivalLabel ? ` · ${arrivalLabel}` : ""}
      </p>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
          <div className="flex items-center gap-2">
            <HistoricalTeamMark brand={awayBrand} size="md" />
            <span className="text-[18px] font-bold tracking-tight sm:text-[22px]">
              {awayBrand.abbreviation}
            </span>
            {showScores ? (
              <span className="text-[28px] font-bold tabular-nums tracking-tight sm:text-[36px]">
                {game.awayScore}
              </span>
            ) : null}
          </div>
          <span className="text-[14px] font-bold text-muted-foreground">
            {showScores ? "—" : "vs"}
          </span>
          <div className="flex items-center gap-2">
            {showScores ? (
              <span className="text-[28px] font-bold tabular-nums tracking-tight sm:text-[36px]">
                {game.homeScore}
              </span>
            ) : null}
            <span className="text-[18px] font-bold tracking-tight sm:text-[22px]">
              {homeBrand.abbreviation}
            </span>
            <HistoricalTeamMark brand={homeBrand} size="md" />
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {awayBrand.displayName} at {homeBrand.displayName}
        </p>
      </div>
      <p
        className={cn(
          "text-center text-[12px] font-bold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {statusHeadline(game.status)}
        {pendingAnalysis ? " · loading analysis…" : null}
      </p>
    </header>
  );
}
