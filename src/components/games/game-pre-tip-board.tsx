import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { GameRosterBoard } from "@/components/games/game-roster-board";
import { GamePlayByPlayPanel } from "@/components/game/game-play-by-play";
import type { Game } from "@/data/types";
import { type } from "@/lib/design-system";
import { gameSideBrandKey } from "@/lib/game-team-identity";
import { cn } from "@/lib/utils";

/** Empty box score and play-by-play frames so the page keeps its shape before tip. */
export function GamePreTipBoard({ game }: { game: Game }) {
  const awayKey = gameSideBrandKey(game, "away");
  const homeKey = gameSideBrandKey(game, "home");
  const awayLabel = game.awayTeamAbbr ?? "Away";
  const homeLabel = game.homeTeamAbbr ?? "Home";
  return (
    <>
      <MatchupWashCard
        awayTeamKey={awayKey}
        homeTeamKey={homeKey}
        intensity="subtle"
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div>
          <h2 className={type.heading}>Box score</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Player lines fill in once the game tips off.
          </p>
        </div>
        <GameRosterBoard
          awayLabel={awayLabel}
          homeLabel={homeLabel}
          awayPlayers={[]}
          homePlayers={[]}
          emptyText="No stats yet."
        />
      </MatchupWashCard>
      <MatchupWashCard
        awayTeamKey={awayKey}
        homeTeamKey={homeKey}
        intensity="subtle"
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <GamePlayByPlayPanel
          events={[]}
          awayTricode={awayLabel}
          homeTricode={homeLabel}
          gameId={game.id}
          status={game.status}
          emptyText="No plays yet. They show up here once the game starts."
        />
      </MatchupWashCard>
    </>
  );
}
