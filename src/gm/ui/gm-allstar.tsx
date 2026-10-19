"use client";

import type { GmLeagueState } from "@/gm/types";
import { allStarBreak, allStarForm, allStarWatch, squadLabel } from "@/gm/engine/allstar";

function nameOf(league: GmLeagueState, id: string): string {
  return league.players.find((player) => player.id === id)?.name ?? id;
}

function lineOf(league: GmLeagueState, id: string): string {
  const player = league.players.find((entry) => entry.id === id);
  if (!player) return "";
  const line = player.seasonLine;
  if (!line || line.gp < 1) return "";
  const ppg = (line.pts / line.gp).toFixed(1);
  return `${ppg} PPG`;
}

function Squad({
  title,
  ids,
  league,
}: {
  title: string;
  ids: string[];
  league: GmLeagueState;
}) {
  const ranked = [...ids].sort((a, b) => {
    const pa = league.players.find((player) => player.id === a);
    const pb = league.players.find((player) => player.id === b);
    return (pb ? allStarForm(pb) : 0) - (pa ? allStarForm(pa) : 0);
  });
  return (
    <div className="rounded-xl border border-border">
      <p className="border-b border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">{title}</p>
      <ul className="divide-y divide-border text-sm">
        {ranked.map((id) => (
          <li key={id} className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span>{nameOf(league, id)}</span>
            <span className="tabular-nums text-muted-foreground">{lineOf(league, id)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GmAllStarBoard({ league }: { league: GmLeagueState }) {
  const brk = allStarBreak(league.schedule);
  if (!brk) return null;
  const order = (id: string) => (id.endsWith("_final") ? 4 : id.endsWith("_g1") ? 1 : id.endsWith("_g2") ? 2 : 3);
  const games = league.schedule
    .filter((game) => game.exhibition === "allstar")
    .sort((a, b) => order(a.id) - order(b.id));
  const sunday = new Date(`${brk.sunday}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const today =
    league.schedule.find((game) => !game.played && game.gameDate && game.exhibition !== "allstar")?.gameDate ??
    brk.start;
  const watch = !league.allStar && today >= `${league.season}-01-01` ? allStarWatch(league) : null;

  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="text-lg font-semibold">All-Star</h2>
        <p className="text-sm text-muted-foreground">
          {league.allStar
            ? `Sunday, ${sunday}. USA Stars, USA Stripes, and the World team, picked from this season. Rising Stars is Saturday. The games stay off the standings.`
            : watch
              ? `The race through ${today}. The three teams lock once the schedule reaches the break. Sunday, ${sunday}.`
              : `Sunday, ${sunday}. The race opens in January, and the three teams lock at the break.`}
        </p>
      </header>
      {watch ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Squad title="East watch" ids={watch.east} league={league} />
          <Squad title="West watch" ids={watch.west} league={league} />
        </div>
      ) : null}
      {league.allStar ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <Squad title="USA Stars" ids={league.allStar.stars} league={league} />
          <Squad title="USA Stripes" ids={league.allStar.stripes} league={league} />
          <Squad title="World" ids={league.allStar.world} league={league} />
        </div>
      ) : null}
      {games.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {games.map((game) => {
            const score =
              game.played && game.homeScore != null && game.awayScore != null
                ? `${game.awayScore}-${game.homeScore}`
                : "";
            const label = game.id.endsWith("_final")
              ? "Championship"
              : game.id.endsWith("_rising")
                ? "Rising Stars"
                : game.id.endsWith("_g1")
                  ? "Game 1"
                  : game.id.endsWith("_g2")
                    ? "Game 2"
                    : "Game 3";
            return (
              <li key={game.id}>
                {label}
                {": "}
                {squadLabel(game.awayTeamId)} at {squadLabel(game.homeTeamId)}
                {score ? `, ${score}` : ""}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
