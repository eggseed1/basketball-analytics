"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { ClubMark } from "@/gm/ui/club-mark";
import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";
import {
  isLineupReady,
  nextUserGame,
  userGamesPlayed,
  userGamesRemaining,
  userTeam,
} from "@/gm/lib/selectors";
import { schemeHeadline } from "@/gm/engine/coaching";
import { formatTipDate, formatTipDateLong } from "@/gm/seed/real-schedule";
import { gapBefore, tradeDeadlineDate } from "@/gm/engine/schedule";
import { cn } from "@/lib/utils";
import type { GmDigestItem, GmLeagueState, GmScheduleGame } from "@/gm/types";

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

function Digest({ digest }: { digest?: GmDigestItem[] }) {
  if (!digest?.length) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-[13px] font-semibold">Since you last skipped</p>
      <ul className="flex flex-col gap-2">
        {digest.map((item) => (
          <li key={item.headline} className="text-[13px]">
            <p className="font-semibold">{item.headline}</p>
            <p className="text-muted-foreground">
              {item.detail}
              {item.gameId ? (
                <>
                  {" "}
                  <Link
                    href={`/gm/game/${item.gameId}`}
                    className="font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    Box score
                  </Link>
                </>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </div>
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
      <ClubMark teamId={opp} label={opp.toUpperCase()} />
    </span>
  );
}

export function GmGamePlan({ league }: { league: GmLeagueState }) {
  const router = useRouter();
  const simPlayoffDay = useGmStore((s) => s.simPlayoffDay);
  const startAutoSim = useGmStore((s) => s.startAutoSim);
  const stopAutoSim = useGmStore((s) => s.stopAutoSim);
  const simRun = useGmStore((s) => s.simRun);
  const finishPlayoffRound = useGmStore((s) => s.finishPlayoffRound);
  const simRestOfPlayoffs = useGmStore((s) => s.simRestOfPlayoffs);
  const simPlayInNight = useGmStore((s) => s.simPlayInNight);
  const finishPlayIn = useGmStore((s) => s.finishPlayIn);
  const openFreeAgency = useGmStore((s) => s.openFreeAgency);
  const runOffseason = useGmStore((s) => s.runOffseason);
  const simulateNextGame = useGmStore((s) => s.simulateNextGame);

  const lineupReady = isLineupReady(league);
  const scheme = schemeHeadline(userTeam(league).coaching);
  const next = nextUserGame(league);
  const played = userGamesPlayed(league);
  const remaining = userGamesRemaining(league);
  const lastBox = league.boxScores.find(
    (b) =>
      b.homeTeamId === league.userTeamId || b.awayTeamId === league.userTeamId
  );

  if (league.phase === "play_in" && league.playIn) {
    const lines = league.playIn.conferences.flatMap((conf) => {
      const bits = [
        `${conf.conf}: ${conf.sevenId.toUpperCase()} vs ${conf.eightId.toUpperCase()}`,
        `${conf.nineId.toUpperCase()} vs ${conf.tenId.toUpperCase()}`,
      ];
      if (conf.sevenSeedId) bits[0] = `${conf.sevenSeedId.toUpperCase()} took the 7 seed`;
      if (conf.eightSeedId) bits.push(`${conf.eightSeedId.toUpperCase()} took the 8 seed`);
      return bits;
    });
    return (
      <section className="sports-card flex flex-col gap-4 p-4">
        <header>
          <h2 className="text-[17px] font-bold tracking-tight">Your plan</h2>
          <p className="text-[13px] text-muted-foreground">
            Play-in. The 7 seed hosts the 8. The 9 seed hosts the 10. The 7-8
            loser then hosts the 9-10 winner for the last spot.
          </p>
        </header>
        <ul className="text-[13px] text-muted-foreground">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => simPlayInNight()}>Tonight</Button>
          <Button variant="outline" onClick={() => finishPlayIn()}>
            Finish the play-in
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              finishPlayIn();
              simRestOfPlayoffs();
            }}
          >
            Sim to the draft
          </Button>
        </div>
        <Digest digest={league.digest} />
      </section>
    );
  }

  if (league.phase === "playoffs") {
    return (
      <section className="sports-card flex flex-col gap-4 p-4">
        <header>
          <h2 className="text-[17px] font-bold tracking-tight">Your plan</h2>
          <p className="text-[13px] text-muted-foreground">
            The bracket is the schedule. Sim a game, finish a round, or run the whole thing.
          </p>
        </header>
        <ol className="flex flex-col gap-1">
          <StepRow
            n={1}
            title="Advance the bracket"
            detail="Game by game, series by series, or straight through to the champion splash."
            status="current"
            action={
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => simPlayoffDay()}>Sim game</Button>
                <Button variant="outline" onClick={() => finishPlayoffRound()}>
                  Sim series / round
                </Button>
                <Button variant="outline" onClick={() => simRestOfPlayoffs()}>
                  Sim whole playoffs
                </Button>
              </div>
            }
          />
        </ol>
        <Digest digest={league.digest} />
      </section>
    );
  }

  if (league.phase === "draft") {
    const draftDone =
      !league.draftPool.length ||
      (league.draftPickIndex ?? 0) >= (league.draftOrder?.length ?? 60);
    return (
      <section className="sports-card flex flex-col gap-4 p-4">
        <header>
          <h2 className="text-[17px] font-bold tracking-tight">Your plan</h2>
          <p className="text-[13px] text-muted-foreground">
            {draftDone
              ? "The draft is in the books. Review your class, then open free agency."
              : "Draft night is live. Watch picks, catch sleepers, trade up, then take your swing."}
          </p>
        </header>
        <ol className="flex flex-col gap-1">
          <StepRow
            n={1}
            title={draftDone ? "Review the draft" : "Open the war room"}
            detail={
              draftDone
                ? "Your picks and the full board, in order."
                : "Names stay on the card. Molds and builds stay with them."
            }
            status="current"
            action={
              <Button onClick={() => router.push("/gm/draft")}>
                {draftDone ? "Draft results" : "Open war room"}
              </Button>
            }
          />
          <StepRow
            n={2}
            title="Open free agency"
            detail={
              draftDone
                ? "Expires deals and opens the market."
                : "Finishes the rest of the board with CPU picks, then expires deals."
            }
            status="upcoming"
            action={
              <Button variant="outline" onClick={() => openFreeAgency()}>
                Open free agency
              </Button>
            }
          />
        </ol>
        <Digest digest={league.digest} />
      </section>
    );
  }

  if (league.phase === "free_agency") {
    const stage = league.faMarket?.stage ?? "options";
    const stageDetail =
      stage === "options"
        ? "Resolve team options. Player options resolve when you advance."
        : stage === "qualifying_offers"
          ? "Tender or decline qualifying offers on your RFAs."
          : stage === "rights"
            ? "Review Bird holds and renounce only what you mean to clear."
            : stage === "moratorium"
              ? "Pitch and lock commitments. Signings finalize when the window opens."
              : `${league.freeAgents.length} players are unsigned. Room, Bird rights, and the mid-level are what let a deal through.`;
    return (
      <section className="sports-card flex flex-col gap-4 p-4">
        <header>
          <h2 className="text-[17px] font-bold tracking-tight">Your plan</h2>
          <p className="text-[13px] text-muted-foreground">
            Free agency desk. Options and QOs first, then the market, then tip
            the next year.
          </p>
        </header>
        <ol className="flex flex-col gap-1">
          <StepRow
            n={1}
            title="Work the market"
            detail={stageDetail}
            status="current"
            action={
              <Button onClick={() => router.push("/gm/free-agency")}>
                Free agency
              </Button>
            }
          />
          <StepRow
            n={2}
            title="Start next season"
            detail="Other clubs finish their signings. A new schedule and the next cap year load."
            status="upcoming"
            action={
              <Button variant="outline" onClick={() => runOffseason()}>
                Start next season
              </Button>
            }
          />
        </ol>
        <Digest digest={league.digest} />
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
              <Button variant="outline" onClick={() => openFreeAgency()}>
                Open free agency
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
  const deadlineDate = tradeDeadlineDate(league.schedule);
  const deadlineLabel = deadlineDate
    ? `Walk to ${formatTipDate(deadlineDate).replace(
        /^([A-Z]{3})/,
        (month) => month[0] + month.slice(1).toLowerCase()
      )}`
    : "Walk to the deadline";

  return (
    <div className="flex flex-col gap-4">
      <section className="sports-card flex flex-col gap-4 p-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-[17px] font-bold tracking-tight">Your plan</h2>
          <p className="text-[13px] text-muted-foreground">
            Play the game in front of you, or skip ahead. You’ve played{" "}
            <span className="font-semibold text-foreground">{played}</span> ·{" "}
            <span className="font-semibold text-foreground">{remaining}</span>{" "}
            left. Lineups, trades, and the cap stay put either way.
          </p>
        </header>

        <ol className="flex flex-col gap-1">
          <StepRow
            n={1}
            title="Set the plan"
            detail={
              lineupReady
                ? scheme ?? "Starters are in. Coaching sets minutes and the system."
                : "Choose starters before tip-off."
            }
            status={step1}
            action={
              step1 === "current" ? (
                <Button onClick={() => router.push("/gm/lineup")}>
                  Set coaching
                </Button>
              ) : (
                <Link
                  href="/gm/lineup"
                  className="text-[13px] font-semibold underline-offset-4 hover:underline"
                >
                  Edit coaching
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
                ? `${next.gameDate ? formatTipDateLong(next.gameDate) : `Day ${next.day}`}${
                    gapBefore(league.schedule, league.userTeamId, next.gameDate) === 1
                      ? ". Second night of a back-to-back"
                      : ""
                  }. Walk the shifts, make a sub, then tip off or watch it play out.`
                : "Regular season complete for your team."
            }
            status={step2}
            action={
              next && step2 === "current" ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => router.push("/gm/night")}>Set tonight&apos;s shifts</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const boxId = simulateNextGame();
                      if (boxId) router.push(`/gm/game/${boxId}?watch=1`);
                    }}
                  >
                    Watch
                  </Button>
                </div>
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
            title="Or skip ahead"
            detail="The calendar walks one day at a time. Stop when you want to make a move."
            status={remaining > 0 ? "current" : "done"}
            action={
              remaining > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {simRun && simRun.kind !== "day" ? (
                    <Button onClick={() => stopAutoSim()}>Stop</Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => startAutoSim("week")}>
                        Next four games
                      </Button>
                      {!league.tradeDeadlinePassed ? (
                        <Button variant="outline" onClick={() => startAutoSim("deadline")}>
                          {deadlineLabel}
                        </Button>
                      ) : null}
                      <Button variant="outline" onClick={() => startAutoSim("season")}>
                        Rest of the season
                      </Button>
                    </>
                  )}
                </div>
              ) : null
            }
          />
        </ol>
        <Digest digest={league.digest} />
      </section>
    </div>
  );
}
