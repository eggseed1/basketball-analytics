"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";
import { GmSeasonCalendar } from "@/gm/ui/gm-season-calendar";
import {
  isLineupReady,
  nextUserGame,
  userGamesPlayed,
  userGamesRemaining,
} from "@/gm/lib/selectors";
import { formatTipDateLong } from "@/gm/seed/real-schedule";
import { cn } from "@/lib/utils";
import type { GmLeagueState, GmScheduleGame } from "@/gm/types";

type StepStatus = "done" | "current" | "upcoming";

function opponentOf(game: GmScheduleGame, userTeamId: string) {
  return game.homeTeamId === userTeamId ? game.awayTeamId : game.homeTeamId;
}

function isHome(game: GmScheduleGame, userTeamId: string) {
  return game.homeTeamId === userTeamId;
}

function StepRow({
  n,
  title,
  detail,
  status,
  action,
}: {
  n: number;
  title: ReactNode;
  detail: string;
  status: StepStatus;
  action?: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-md px-3 py-3",
        status === "current" && "bg-secondary/80",
        status === "done" && "opacity-70"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
          status === "done" && "bg-foreground text-background",
          status === "current" && "bg-foreground text-background",
          status === "upcoming" && "bg-secondary text-muted-foreground"
        )}
      >
        {status === "done" ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="text-[13px] text-muted-foreground">{detail}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </li>
  );
}

function MatchupLine({
  game,
  userTeamId,
}: {
  game: GmScheduleGame;
  userTeamId: string;
}) {
  const opp = opponentOf(game, userTeamId);
  const home = isHome(game, userTeamId);
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
      {home ? "vs" : "@"}
      <TeamLogo teamKey={opp} size="xs" />
      {opp.toUpperCase()}
    </span>
  );
}

export function GmGamePlan({ league }: { league: GmLeagueState }) {
  const router = useRouter();
  const simulateNextGame = useGmStore((s) => s.simulateNextGame);
  const simPlayoffDay = useGmStore((s) => s.simPlayoffDay);
  const runOffseason = useGmStore((s) => s.runOffseason);

  const lineupReady = isLineupReady(league);
  const next = nextUserGame(league);
  const played = userGamesPlayed(league);
  const remaining = userGamesRemaining(league);
  const lastBox = league.boxScores.find(
    (b) =>
      b.homeTeamId === league.userTeamId || b.awayTeamId === league.userTeamId
  );

  if (league.phase === "playoffs") {
    return (
      <section className="sports-card flex flex-col gap-4 p-4">
        <header>
          <h2 className="text-[17px] font-bold tracking-tight">Your plan</h2>
          <p className="text-[13px] text-muted-foreground">
            Playoffs - advance one day of series games at a time.
          </p>
        </header>
        <ol className="flex flex-col gap-1">
          <StepRow
            n={1}
            title="Play the next playoff games"
            detail="Simulates today’s series tips, then come back for the next day."
            status="current"
            action={
              <Button onClick={() => simPlayoffDay()}>
                Play next playoff day
              </Button>
            }
          />
        </ol>
      </section>
    );
  }

  if (league.phase === "draft") {
    return (
      <section className="sports-card flex flex-col gap-4 p-4">
        <header>
          <h2 className="text-[17px] font-bold tracking-tight">Your plan</h2>
          <p className="text-[13px] text-muted-foreground">
            Draft is open - scout the codenames, take your swing, then start the
            next season.
          </p>
        </header>
        <ol className="flex flex-col gap-1">
          <StepRow
            n={1}
            title="Scout & make your pick"
            detail="Codenames only until the selection - then the identity drops."
            status="current"
            action={
              <Button onClick={() => router.push("/gm/draft")}>
                Open war room
              </Button>
            }
          />
          <StepRow
            n={2}
            title="Start next season"
            detail="Finishes remaining AI picks and tips off the new year."
            status="upcoming"
            action={
              <Button variant="outline" onClick={() => runOffseason()}>
                Start next season
              </Button>
            }
          />
        </ol>
      </section>
    );
  }

  if (league.phase === "offseason") {
    return (
      <section className="sports-card flex flex-col gap-4 p-4">
        <header>
          <h2 className="text-[17px] font-bold tracking-tight">Your plan</h2>
          <p className="text-[13px] text-muted-foreground">Offseason break.</p>
        </header>
        <StepRow
          n={1}
          title="Open Offseason Hub"
          detail="Roster, cap, and free agency desks."
          status="current"
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => router.push("/gm/offseason")}>
                Offseason Hub
              </Button>
              <Button variant="outline" onClick={() => runOffseason()}>
                Start next season
              </Button>
            </div>
          }
        />
      </section>
    );
  }

  // Regular season - guided click-through of every user game
  const step1: StepStatus = lineupReady ? "done" : "current";
  const step2: StepStatus = !lineupReady
    ? "upcoming"
    : next
      ? "current"
      : "done";
  const step3: StepStatus =
    lastBox && lineupReady ? (next ? "upcoming" : "done") : "upcoming";

  return (
    <div className="flex flex-col gap-4">
      <section className="sports-card flex flex-col gap-4 p-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-[17px] font-bold tracking-tight">Your plan</h2>
          <p className="text-[13px] text-muted-foreground">
            Follow these steps for each game. You’ve played{" "}
            <span className="font-semibold text-foreground">{played}</span> ·{" "}
            <span className="font-semibold text-foreground">{remaining}</span>{" "}
            left.
          </p>
        </header>

        <ol className="flex flex-col gap-1">
          <StepRow
            n={1}
            title="Set your lineup"
            detail={
              lineupReady
                ? "Five starters are locked in."
                : "Choose starters before tip-off."
            }
            status={step1}
            action={
              step1 === "current" ? (
                <Button onClick={() => router.push("/gm/lineup")}>
                  Set lineup
                </Button>
              ) : (
                <Link
                  href="/gm/lineup"
                  className="text-[13px] font-semibold underline-offset-4 hover:underline"
                >
                  Edit lineup
                </Link>
              )
            }
          />

          <StepRow
            n={2}
            title={
              next ? (
                <>
                  Play next game · <MatchupLine game={next} userTeamId={league.userTeamId} />
                </>
              ) : (
                "No games left"
              )
            }
            detail={
              next
                ? `${next.gameDate ? formatTipDateLong(next.gameDate) : `Day ${next.day}`} · play this tip, then open the box score.`
                : "Regular season complete for your team."
            }
            status={step2}
            action={
              next && step2 === "current" ? (
                <Button
                  onClick={() => {
                    const boxId = simulateNextGame();
                    if (boxId) router.push(`/gm/game/${boxId}`);
                  }}
                >
                  Play game & see results
                </Button>
              ) : null
            }
          />

          <StepRow
            n={3}
            title="Review the box score"
            detail={
              lastBox
                ? `Last result: ${lastBox.awayTeamId.toUpperCase()} ${lastBox.awayScore} @ ${lastBox.homeTeamId.toUpperCase()} ${lastBox.homeScore}`
                : "After you play, results open automatically."
            }
            status={lastBox ? (step2 === "current" ? "done" : step3) : "upcoming"}
            action={
              lastBox ? (
                <Link
                  href={`/gm/game/${lastBox.id}`}
                  className="text-[13px] font-semibold underline-offset-4 hover:underline"
                >
                  Open last box score
                </Link>
              ) : null
            }
          />

          <StepRow
            n={4}
            title="Repeat for the next tip"
            detail="Come back here after each game - work through the calendar one by one."
            status={remaining > 0 ? "upcoming" : "done"}
          />
        </ol>
      </section>

      <GmSeasonCalendar league={league} compact />
    </div>
  );
}
