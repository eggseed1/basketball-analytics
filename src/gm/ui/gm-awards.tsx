"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { awardRaces, awardSeasonProgress } from "@/gm/engine/awards";
import type { GmAwardRace, GmLeagueState } from "@/gm/types";
import { cn } from "@/lib/utils";

function teamAbbr(league: GmLeagueState, teamId: string): string {
  return league.teams.find((team) => team.id === teamId)?.abbr ?? teamId.toUpperCase();
}

const MAJOR_IDS = new Set(["mvp", "dpoy", "roy", "smoy", "mip", "coty"]);

export function GmAwardBoard({ league }: { league: GmLeagueState }) {
  const t = useTranslations("GmUi");
  const final = league.awards?.season === league.season && league.phase !== "regular";
  const races = final ? league.awards!.races : awardRaces(league);
  const progress = awardSeasonProgress(league);
  const majors = races.filter((race) => MAJOR_IDS.has(race.id));
  const honor = races.filter((race) => !MAJOR_IDS.has(race.id));
  const any = races.some((race) => race.candidates.length > 0);
  const previous =
    !final && league.awards && league.awards.season !== league.season
      ? league.awards
      : null;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {final ? t("awardsSeason") : t("awardsRaces")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {final
              ? "Regular-season ballot is locked. Playoff games do not rewrite it."
              : "Production, games played, and team record. Leaders update as the season goes."}
          </p>
        </div>
        <p className="rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
          {final
            ? `${league.season - 1}–${String(league.season).slice(-2)} final`
            : progress.played < 1
              ? "Waiting on tip-off"
              : `Through ${progress.played} team games`}
        </p>
      </header>

      {!any ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {progress.played < 1
            ? t("awardsEmpty")
            : "Not enough games for a clean ballot. Keep simulating."}
        </p>
      ) : (
        <>
          <RaceGroup
            title="Majors"
            races={majors}
            league={league}
            decided={final}
            showVotes
          />
          {honor.some((race) => race.candidates.length > 0) ? (
            <RaceGroup
              title="Honor teams"
              races={honor}
              league={league}
              decided={final}
              showVotes={false}
            />
          ) : null}
        </>
      )}

      {previous ? (
        <p className="text-sm text-muted-foreground">
          Last sealed ballot ({previous.season - 1}–
          {String(previous.season).slice(-2)}):{" "}
          {previous.races
            .filter((race) => MAJOR_IDS.has(race.id) && race.candidates[0])
            .map((race) => `${race.title} ${race.candidates[0]!.name}`)
            .join(" · ")}
          .
        </p>
      ) : null}
    </section>
  );
}

function RaceGroup({
  title,
  races,
  league,
  decided,
  showVotes,
}: {
  title: string;
  races: GmAwardRace[];
  league: GmLeagueState;
  decided: boolean;
  showVotes: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {races.map((race) => (
          <Race
            key={race.id}
            race={race}
            league={league}
            decided={decided}
            showVotes={showVotes}
          />
        ))}
      </div>
    </div>
  );
}

function Race({
  race,
  league,
  decided,
  showVotes,
}: {
  race: GmAwardRace;
  league: GmLeagueState;
  decided: boolean;
  showVotes: boolean;
}) {
  const isTeam = race.id.startsWith("all-");
  const limit = isTeam ? 5 : 5;
  return (
    <article
      data-motion="card"
      className="sports-card overflow-hidden rounded-xl border border-border"
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {race.title}
        </p>
        {race.note ? (
          <p className="text-[11px] font-medium text-foreground">{race.note}</p>
        ) : null}
      </div>
      {race.candidates.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">No one has a case yet.</p>
      ) : (
        <ol className="divide-y divide-border text-sm" data-motion-list>
          {race.candidates.slice(0, limit).map((candidate, index) => {
            const yours = candidate.teamId === league.userTeamId;
            const share = candidate.share ?? (index === 0 ? 1 : 0);
            const body = (
              <span className="flex flex-col gap-1.5">
                <span className="flex items-start justify-between gap-2">
                  <span>
                    <span className="font-semibold tracking-tight">
                      {decided && index === 0 && !isTeam
                        ? "Winner · "
                        : `${index + 1}. `}
                      {candidate.name}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      {teamAbbr(league, candidate.teamId)}
                      {yours ? " · you" : ""}
                    </span>
                  </span>
                  {showVotes && candidate.votes != null ? (
                    <span className="shrink-0 tabular-nums text-[11px] font-semibold text-muted-foreground">
                      {candidate.votes} pts
                    </span>
                  ) : null}
                </span>
                <span className="text-[12px] leading-snug text-muted-foreground">
                  {candidate.detail}
                </span>
                {!isTeam ? (
                  <span
                    className="mt-0.5 block h-1 overflow-hidden rounded-full bg-secondary"
                    aria-hidden
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full transition-[width] duration-300",
                        index === 0 ? "bg-foreground/70" : "bg-foreground/35"
                      )}
                      style={{ width: `${Math.round(share * 100)}%` }}
                    />
                  </span>
                ) : null}
              </span>
            );
            return (
              <li
                key={candidate.id}
                data-motion="row"
                className={cn(
                  "px-3 py-2",
                  yours && "bg-secondary/40",
                  decided && index === 0 && !isTeam && "bg-emerald-500/10"
                )}
              >
                {candidate.id.startsWith("coach:") ? (
                  body
                ) : (
                  <Link
                    href={`/gm/player/${encodeURIComponent(candidate.id)}`}
                    className="block hover:underline"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}
