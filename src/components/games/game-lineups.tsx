"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import type { GameSummary } from "@/data/types";
import type {
  GameLineups,
  LineupPlayer,
  TeamFloorState,
} from "@/data/providers/nba/espn-lineups";
import { type } from "@/lib/design-system";
import { parseTipOffMs } from "@/lib/game-countdown";
import { isLiveLikeStatus, isPreTipStatus } from "@/lib/game-status";
import { foulTroubleThreshold } from "@/lib/games/live-insights";
import { cn } from "@/lib/utils";

const LIVE_POLL_MS = 20_000;
const PREGAME_POLL_MS = 60_000;
/** Teams name starters roughly 30 minutes out; start asking well before. */
const PREGAME_WINDOW_MS = 2 * 60 * 60 * 1000;

type Mode = "live" | "break" | "pregame" | null;

function lineupMode(game: GameSummary): Mode {
  if (game.status === "halftime" || game.status === "period_break") return "break";
  if (isLiveLikeStatus(game.status)) return "live";
  if (isPreTipStatus(game.status)) return "pregame";
  return null;
}

function inPregameWindow(game: GameSummary, now: number): boolean {
  const tip = parseTipOffMs(game.tipOffAt);
  return tip != null && tip - now <= PREGAME_WINDOW_MS;
}

function useGameLineups(gameId: string, mode: Mode, poll: boolean) {
  const [data, setData] = useState<GameLineups | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!mode || !poll) return;
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
  }, [gameId, mode, poll]);

  return { data, loaded };
}

const LINEUP_SIZE = 5;

function EmptySlots() {
  return (
    <ul aria-hidden className="flex gap-1">
      {Array.from({ length: LINEUP_SIZE }, (_, i) => (
        <li key={i} className="flex w-[3.75rem] min-w-0 shrink flex-col items-center gap-0.5">
          <span className="h-7 w-7 rounded-full border border-dashed border-border sm:h-8 sm:w-8" />
          <span className="text-[11px] leading-tight text-muted-foreground/60">—</span>
        </li>
      ))}
    </ul>
  );
}

const POSITION_ORDER: Record<string, number> = {
  PG: 0,
  G: 1,
  SG: 1,
  "G-F": 2,
  SF: 3,
  F: 3.5,
  PF: 4,
  "F-C": 4.5,
  C: 5,
};

function positionRank(position?: string): number {
  return POSITION_ORDER[(position ?? "").toUpperCase()] ?? 6;
}

/** Guards first, center last; ties keep ESPN's order. */
function byPosition(players: LineupPlayer[]): LineupPlayer[] {
  return players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => positionRank(a.p.position) - positionRank(b.p.position) || a.i - b.i)
    .map(({ p }) => p);
}

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1]!;
  return SUFFIX.test(last) && parts.length > 2 ? `${parts[parts.length - 2]} ${last}` : last;
}

function PlayerRow({
  players,
  teamKey,
  troubleAt,
}: {
  players: LineupPlayer[];
  teamKey: string | null;
  /** Foul count that means trouble this period; null hides box lines (pregame). */
  troubleAt: number | null;
}) {
  return (
    <ul className="flex gap-1">
      {byPosition(players).map((p) => {
        const meta = [p.position, p.jersey ? `#${p.jersey}` : null].filter(Boolean).join(" · ");
        const trouble = troubleAt != null && p.fouls != null && p.fouls >= troubleAt;
        return (
          <li key={p.playerId} className="w-[3.75rem] min-w-0 shrink">
            <Link
              href={`/players/${encodeURIComponent(p.playerId)}`}
              title={meta ? `${p.name} · ${meta}` : p.name}
              className="group flex flex-col items-center gap-0.5 text-center"
            >
              <PlayerHeadshot
                playerId={p.playerId}
                name={p.name}
                teamKey={teamKey}
                size="sm"
                className="h-7 w-7 opacity-90 transition-opacity group-hover:opacity-100 sm:h-8 sm:w-8"
              />
              <span className="w-full truncate text-[11px] leading-tight text-muted-foreground group-hover:text-foreground">
                {shortName(p.name)}
              </span>
              {troubleAt != null && p.points != null && p.fouls != null ? (
                <span className="w-full truncate text-[10px] leading-none tabular-nums text-muted-foreground/80">
                  {p.points} pts ·{" "}
                  <span
                    className={cn(trouble && "font-semibold text-destructive")}
                    title={trouble ? "Foul trouble" : undefined}
                  >
                    {p.fouls} pf
                  </span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
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
    <p className={cn(type.micro, "flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground")}>
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
  awayTeamKey,
  homeTeamKey,
}: {
  game: GameSummary;
  awayLabel: string;
  homeLabel: string;
  awayTeamKey: string | null;
  homeTeamKey: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const mode = lineupMode(game);
  const { data, loaded } = useGameLineups(
    game.id,
    mode,
    mode !== "pregame" || inPregameWindow(game, now)
  );
  if (!mode || (!loaded && mode !== "pregame")) return null;

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
      : "This lineup is not listed right now.";

  if (mode === "pregame" && !away && !home) {
    return (
      <section aria-label={heading} className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <h2 className={cn(type.micro, "font-bold uppercase tracking-[0.1em] text-muted-foreground")}>
          {heading}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-8">
          {[awayLabel, homeLabel].map((label) => (
            <div key={label} className="flex min-w-0 flex-col gap-1.5">
              <p className={cn(type.micro, "font-semibold text-muted-foreground")}>{label}</p>
              <EmptySlots />
            </div>
          ))}
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>{missing}</p>
      </section>
    );
  }

  return (
    <section aria-label={heading} className="flex flex-col gap-2 border-t border-border/50 pt-3">
      <h2 className={cn(type.micro, "font-bold uppercase tracking-[0.1em] text-muted-foreground")}>
        {heading}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-8">
        {(
          [
            ["away", awayLabel, away, awayTeamKey],
            ["home", homeLabel, home, homeTeamKey],
          ] as const
        ).map(([side, label, players, teamKey]) => (
          <div key={side} className="flex min-w-0 flex-col gap-1.5">
            <p className={cn(type.micro, "font-semibold text-muted-foreground")}>{label}</p>
            {players ? (
              <PlayerRow
                players={players}
                teamKey={teamKey}
                troubleAt={mode === "pregame" ? null : foulTroubleThreshold(game.period ?? 1)}
              />
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
