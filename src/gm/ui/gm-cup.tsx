"use client";

import type { GmLeagueState } from "@/gm/types";
import { cupTables, tagGroupGames } from "@/gm/engine/cup";

function label(league: GmLeagueState, id: string): string {
  const team = league.teams.find((entry) => entry.id === id);
  return team ? team.abbr : id.toUpperCase();
}

function score(game: { played: boolean; homeScore?: number; awayScore?: number }): string {
  if (!game.played || game.homeScore == null || game.awayScore == null) return "";
  return `${game.awayScore}-${game.homeScore}`;
}

export function GmCupBoard({ league }: { league: GmLeagueState }) {
  const schedule = tagGroupGames(league.schedule, league.season, league.cupGroups);
  const groups = schedule.filter((game) => game.cup === "group");
  if (!groups.length) return null;
  const tables = cupTables(schedule, league.season, league.cupGroups, league.priorWins);
  const knockout = schedule.filter(
    (game) => game.cup === "quarterfinal" || game.cup === "semifinal" || game.cup === "championship"
  );
  const played = groups.filter((game) => game.played).length;

  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="text-lg font-semibold">NBA Cup</h2>
        <p className="text-sm text-muted-foreground">
          {played < groups.length
            ? `Group play is ${played} of ${groups.length} games. Cup nights run through Nov. 27. The winner of each group and one wild card from each conference go to the quarterfinals.`
            : knockout.length
              ? "Quarterfinals and semifinals count in the standings. The championship does not."
              : "Group play is finished. The knockout goes on the calendar from here."}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((table) => (
          <div key={table.rows.map((row) => row.id).join("-")} className="rounded-xl border border-border">
            <p className="border-b border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              {table.conference}
            </p>
            <ul className="divide-y divide-border text-sm">
              {table.rows.map((row, index) => (
                <li key={row.id} className="flex items-center justify-between px-3 py-1.5">
                  <span>
                    {index + 1}. {label(league, row.id)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.wins}-{row.losses}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {knockout.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {knockout.map((game) => (
            <li key={game.id} className="flex flex-wrap gap-x-2">
              <span className="w-28 text-muted-foreground">
                {game.cup === "championship" ? "Final" : game.cup === "semifinal" ? "Semifinal" : "Quarterfinal"}
              </span>
              <span className="tabular-nums">{game.gameDate}</span>
              <span>
                {label(league, game.awayTeamId)} at {label(league, game.homeTeamId)}
                {game.neutral ? ", neutral site" : ""}
                {score(game) ? `, ${score(game)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
