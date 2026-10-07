import type { CSSProperties } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import type { GameSummary } from "@/data/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

import { LOSS, signed, VizCard, WIN } from "./viz-kit";

const ROUNDS = ["First round", "Conference semifinals", "Conference finals", "NBA Finals"];

type PlayedGame = {
  g: GameSummary;
  home: boolean;
  opp: string;
  pf: number;
  pa: number;
};

type Series = {
  opp: string;
  label: string;
  games: PlayedGame[];
};

function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Playoffs tab hero: the team's postseason as a path of series. Each game is
 * a bar that rises for a win and drops for a loss by the final margin, with
 * the series score after it.
 */
export function PlayoffsSeriesPath({
  games,
  teamId,
  season,
  teamKey,
}: {
  games: GameSummary[];
  teamId: string;
  season: string;
  teamKey: string;
}) {
  const played: PlayedGame[] = games
    .filter((g) => g.status === "final")
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    .map((g) => {
      const home = g.homeTeamId === teamId;
      return {
        g,
        home,
        opp: (home ? g.awayTeamAbbr : g.homeTeamAbbr) ?? (home ? g.awayTeamId : g.homeTeamId),
        pf: home ? g.homeScore : g.awayScore,
        pa: home ? g.awayScore : g.homeScore,
      };
    });
  if (!played.length) return null;

  const series: Series[] = [];
  let round = 0;
  for (const p of played) {
    const last = series[series.length - 1];
    const playIn = p.g.gameType === "play-in";
    if (last && last.opp === p.opp && (last.label === "Play-In") === playIn) {
      last.games.push(p);
      continue;
    }
    const label = playIn ? "Play-In" : (ROUNDS[round++] ?? "Playoffs");
    series.push({ opp: p.opp, label, games: [p] });
  }
  const maxMargin = Math.max(...played.map((p) => Math.abs(p.pf - p.pa)), 10);

  return (
    <VizCard
      title="The road through the bracket"
      accentKey={teamKey}
      subtitle={`Every ${season} postseason game in order. Bars rise for wins and drop for losses by the final margin. The score under each bar is the series after that game.`}
    >
      <div className="flex flex-col gap-4">
        {series.map((s, si) => {
          let w = 0;
          let l = 0;
          const won = s.games.filter((p) => p.pf > p.pa).length;
          const lost = s.games.length - won;
          return (
            <div key={`${s.label}-${s.opp}`} className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
              <div className="flex items-center gap-2.5">
                <TeamLogo teamKey={s.opp} size="sm" />
                <div className="min-w-0">
                  <p className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>{s.label}</p>
                  <p className={cn(type.bodySm, "font-bold")}>
                    vs {s.opp}{" "}
                    <span className="tabular-nums" style={{ color: won > lost ? WIN : won < lost ? LOSS : undefined }}>
                      {won}-{lost}
                    </span>
                  </p>
                </div>
              </div>
              <div className="relative flex h-28 items-stretch gap-1.5 sm:gap-2">
                <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-foreground/25" />
                {s.games.map((p, gi) => {
                  const win = p.pf > p.pa;
                  if (win) w += 1;
                  else l += 1;
                  const h = (Math.abs(p.pf - p.pa) / maxMargin) * 36;
                  return (
                    <TransitionLink
                      key={p.g.id}
                      href={`/games/${encodeURIComponent(p.g.id)}?season=${encodeURIComponent(p.g.season)}`}
                      data-viz-row
                      data-tip={`Game ${gi + 1} · ${win ? "W" : "L"} ${p.pf}-${p.pa} ${p.home ? "vs" : "at"} ${p.opp}`}
                      data-tip-sub={`${shortDate(p.g.gameDate)} · margin ${signed(p.pf - p.pa, 0)} · series ${w}-${l}`}
                      aria-label={`Game ${gi + 1}, ${win ? "won" : "lost"} ${p.pf} to ${p.pa}`}
                      className="relative flex min-w-9 max-w-20 flex-1 flex-col rounded-md"
                    >
                      <span className={cn(type.micro, "absolute inset-x-0 top-0 text-center font-semibold text-muted-foreground")}>
                        G{gi + 1}
                      </span>
                      <span
                        data-viz-bar
                        data-motion-bar="y"
                        className="absolute inset-x-1.5 rounded-[3px]"
                        style={
                          {
                            height: `max(3px, ${h}%)`,
                            bottom: win ? "50%" : undefined,
                            top: win ? undefined : "50%",
                            background: win ? WIN : LOSS,
                            transformOrigin: win ? "bottom" : "top",
                            "--i": si * 4 + gi,
                          } as CSSProperties
                        }
                      />
                      <span className={cn(type.micro, "absolute inset-x-0 bottom-0 text-center font-bold tabular-nums")}>
                        {w}-{l}
                      </span>
                    </TransitionLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </VizCard>
  );
}
