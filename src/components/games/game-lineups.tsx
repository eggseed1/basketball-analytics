"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { GameSummary } from "@/data/types";
import type {
  GameLineups,
  LineupPlayer,
  TeamFloorState,
} from "@/data/providers/nba/espn-lineups";
import { type } from "@/lib/design-system";
import { parseTipOffMs } from "@/lib/game-countdown";
import { isLiveLikeStatus, isPreTipStatus } from "@/lib/game-status";
import { cn } from "@/lib/utils";

const LIVE_POLL_MS = 20_000;
const PREGAME_POLL_MS = 60_000;
/** Teams name starters roughly 30 minutes out; start asking well before. */
const PREGAME_WINDOW_MS = 2 * 60 * 60 * 1000;

type Mode = "live" | "break" | "pregame" | null;

function lineupMode(game: GameSummary, now: number): Mode {
  if (game.status === "halftime" || game.status === "period_break") return "break";
  if (isLiveLikeStatus(game.status)) return "live";
  if (isPreTipStatus(game.status)) {
    const tip = parseTipOffMs(game.tipOffAt);
    if (tip != null && tip - now <= PREGAME_WINDOW_MS) return "pregame";
  }
  return null;
}

function useGameLineups(gameId: string, mode: Mode) {
  const [data, setData] = useState<GameLineups | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!mode) return;
    let stopped = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/lineups`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data?: GameLineups | null };
        if (!stopped) setData(body.data ?? null);
      } catch {
        // Keep the last lineup; the next poll retries.
      } finally {
        if (!stopped) setLoaded(true);
      }
    };
    void load();
    const id = window.setInterval(load, mode === "pregame" ? PREGAME_POLL_MS : LIVE_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [gameId, mode]);

  return { data, loaded };
}

function PlayerList({ players }: { players: LineupPlayer[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {players.map((p) => (
        <li key={p.playerId} className={cn(type.bodySm, "flex items-baseline gap-2")}>
          <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
            {p.jersey ?? ""}
          </span>
          <Link
            href={`/players/${encodeURIComponent(p.playerId)}`}
            className="min-w-0 truncate font-medium text-foreground hover:underline"
          >
            {p.name}
          </Link>
          {p.position ? (
            <span className={cn(type.caption, "shrink-0 text-muted-foreground")}>
              {p.position}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function FloorState({ state, showFouls }: { state: TeamFloorState; showFouls: boolean }) {
  const parts: string[] = [];
  if (showFouls && state.teamFouls != null) {
    parts.push(`${state.teamFouls} team foul${state.teamFouls === 1 ? "" : "s"} this quarter`);
  }
  if (state.timeoutsRemaining != null) {
    parts.push(`${state.timeoutsRemaining} timeout${state.timeoutsRemaining === 1 ? "" : "s"} left`);
  }
  if (!parts.length && !(showFouls && state.inBonus)) return null;
  return (
    <p className={cn(type.caption, "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground")}>
      <span className="tabular-nums">{parts.join(" · ")}</span>
      {showFouls && state.inBonus ? (
        <span className="rounded-md bg-foreground/[0.07] px-1.5 py-0.5 font-semibold text-foreground">
          In the bonus
        </span>
      ) : null}
    </p>
  );
}

export function GameLineupsPanel({
  game,
  awayLabel,
  homeLabel,
}: {
  game: GameSummary;
  awayLabel: string;
  homeLabel: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const mode = lineupMode(game, now);
  const { data, loaded } = useGameLineups(game.id, mode);
  if (!mode || !loaded) return null;

  const pick = (side: "away" | "home") => {
    const lineup = data?.[side];
    return mode === "pregame" ? lineup?.starters ?? null : lineup?.onCourt ?? null;
  };
  const away = pick("away");
  const home = pick("home");

  const heading =
    mode === "pregame" ? "Starting lineups" : mode === "break" ? "Last on the floor" : "On the floor";
  const missing =
    mode === "pregame"
      ? "Not announced yet. Teams usually name starters about 30 minutes before tip."
      : "ESPN is not listing this lineup right now.";

  if (mode === "pregame" && !away && !home) {
    return (
      <section aria-label={heading} className="flex flex-col gap-1 border-t border-border/50 pt-4">
        <h2 className={cn(type.micro, "font-bold uppercase tracking-[0.1em] text-muted-foreground")}>
          {heading}
        </h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>{missing}</p>
      </section>
    );
  }

  return (
    <section aria-label={heading} className="flex flex-col gap-3 border-t border-border/50 pt-4">
      <h2 className={cn(type.micro, "font-bold uppercase tracking-[0.1em] text-muted-foreground")}>
        {heading}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-8">
        {(
          [
            ["away", awayLabel, away],
            ["home", homeLabel, home],
          ] as const
        ).map(([side, label, players]) => (
          <div key={side} className="flex min-w-0 flex-col gap-1.5">
            <p className={cn(type.caption, "font-semibold text-foreground")}>{label}</p>
            {players ? (
              <PlayerList players={players} />
            ) : (
              <p className={cn(type.caption, "text-muted-foreground")}>{missing}</p>
            )}
            {mode !== "pregame" && data?.state ? (
              <FloorState state={data.state[side]} showFouls={mode === "live"} />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
