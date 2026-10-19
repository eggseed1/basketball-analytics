"use client";

import Link from "next/link";

import { awardRaces } from "@/gm/engine/awards";
import type { GmAwardRace, GmLeagueState } from "@/gm/types";

function teamAbbr(league: GmLeagueState, teamId: string): string {
  return league.teams.find((team) => team.id === teamId)?.abbr ?? teamId.toUpperCase();
}

export function GmAwardBoard({ league }: { league: GmLeagueState }) {
  const final = league.awards?.season === league.season && league.phase !== "regular";
  const races = final ? league.awards!.races : awardRaces(league);
  const any = races.some((race) => race.candidates.length > 0);
  const previous =
    !final && league.awards && league.awards.season !== league.season ? league.awards : null;
  if (!any && !previous) return null;

  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="text-lg font-semibold">Awards</h2>
        <p className="text-sm text-muted-foreground">
          {final
            ? "Regular-season awards. The ballot was closed before the playoffs."
            : "The race uses this season's production, games played, and team record."}
        </p>
      </header>
      {any ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {races.map((race) => (
            <Race key={race.id} race={race} league={league} decided={final} />
          ))}
        </div>
      ) : null}
      {previous ? (
        <p className="text-sm text-muted-foreground">
          {previous.season - 1}-{String(previous.season).slice(-2)} winners:{" "}
          {previous.races
            .filter((race) => race.candidates[0])
            .map((race) => `${race.title} ${race.candidates[0]!.name}`)
            .join(". ")}
          .
        </p>
      ) : null}
    </section>
  );
}

function Race({
  race,
  league,
  decided,
}: {
  race: GmAwardRace;
  league: GmLeagueState;
  decided: boolean;
}) {
  return (
    <div className="rounded-xl border border-border">
      <p className="border-b border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        {race.title}
      </p>
      {race.candidates.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">No one has a case yet.</p>
      ) : (
        <ol className="divide-y divide-border text-sm">
          {race.candidates.slice(0, race.id.startsWith("all-") ? 5 : 3).map((candidate, index) => {
            const body = (
              <>
                <span className="font-medium">
                  {decided && index === 0 && !race.id.startsWith("all-") ? "Won. " : `${index + 1}. `}
                  {candidate.name}
                </span>
                <span className="text-muted-foreground"> {teamAbbr(league, candidate.teamId)}</span>
                <span className="mt-0.5 block text-muted-foreground">{candidate.detail}</span>
              </>
            );
            return (
              <li key={candidate.id} className="px-3 py-1.5">
                {candidate.id.startsWith("coach:") ? (
                  body
                ) : (
                  <Link href={`/gm/player/${encodeURIComponent(candidate.id)}`} className="hover:underline">
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
