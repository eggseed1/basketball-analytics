"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/brand/team-logo";
import type { GmAwardRace, GmLeagueState } from "@/gm/types";
import { cn } from "@/lib/utils";

const SHOW_ORDER = [
  "mvp",
  "dpoy",
  "roy",
  "smoy",
  "mip",
  "coty",
  "all-nba-1",
  "all-def-1",
  "all-rook-1",
] as const;

function teamAbbr(league: GmLeagueState, teamId: string): string {
  return league.teams.find((team) => team.id === teamId)?.abbr ?? teamId.toUpperCase();
}

function slidesFor(league: GmLeagueState): GmAwardRace[] {
  const races = league.awards?.races ?? [];
  const byId = new Map(races.map((race) => [race.id, race]));
  const ordered: GmAwardRace[] = [];
  for (const id of SHOW_ORDER) {
    const race = byId.get(id);
    if (race && race.candidates.length) ordered.push(race);
  }
  for (const race of races) {
    if (ordered.some((row) => row.id === race.id)) continue;
    if (race.candidates.length) ordered.push(race);
  }
  return ordered;
}

/**
 * 2K-style award night: one race per card, flip with Next until Continue.
 */
export function GmAwardsShow({
  league,
  onContinue,
}: {
  league: GmLeagueState;
  onContinue: () => void;
}) {
  const t = useTranslations("GmUi");
  const slides = useMemo(() => slidesFor(league), [league]);
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const last = index >= slides.length - 1;
  const isTeam = Boolean(slide?.id.startsWith("all-"));
  const winner = slide?.candidates[0];
  const rest = slide?.candidates.slice(1, isTeam ? 5 : 4) ?? [];

  if (!slides.length) {
    return (
      <section className="sports-card flex flex-col gap-4 p-6">
        <h1 className="text-[28px] font-bold tracking-tight">{t("homeAwardsTitle")}</h1>
        <p className="text-muted-foreground">{t("awardsEmpty")}</p>
        <Button onClick={onContinue}>{t("homeAwardsContinue")}</Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("homeAwardsEyebrow")}
          </p>
          <h1 className="text-[28px] font-bold tracking-tight">{t("homeAwardsTitle")}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {t("homeAwardsBlurb", {
              season: `${league.season - 1}–${String(league.season).slice(-2)}`,
            })}
          </p>
        </div>
        <p className="text-[13px] font-semibold tabular-nums text-muted-foreground">
          {index + 1} / {slides.length}
        </p>
      </header>

      <article
        key={slide!.id}
        className="sports-card relative overflow-hidden p-6 sm:p-8"
        data-motion="card"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(900px 280px at 10% -10%, color-mix(in oklab, var(--team-primary, #3a7) 35%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col gap-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {slide!.title}
          </p>
          {winner ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-muted-foreground">
                  {isTeam ? t("homeAwardsTeam") : t("homeAwardsWinner")}
                </p>
                {winner.id.startsWith("coach:") ? (
                  <p className="mt-1 text-[32px] font-bold tracking-tight sm:text-[40px]">
                    {winner.name}
                  </p>
                ) : (
                  <Link
                    href={`/gm/player/${encodeURIComponent(winner.id)}`}
                    className="mt-1 block text-[32px] font-bold tracking-tight hover:underline sm:text-[40px]"
                  >
                    {winner.name}
                  </Link>
                )}
                <p className="mt-2 flex items-center gap-2 text-[15px] text-muted-foreground">
                  <TeamLogo teamKey={winner.teamId} size="sm" />
                  {teamAbbr(league, winner.teamId)}
                  {winner.teamId === league.userTeamId ? ` · ${t("homeAwardsYours")}` : ""}
                </p>
                <p className="mt-3 max-w-xl text-[15px] leading-snug text-muted-foreground">
                  {winner.detail}
                </p>
              </div>
              {winner.votes != null ? (
                <p className="shrink-0 text-[28px] font-bold tabular-nums">
                  {winner.votes}
                  <span className="ml-1 text-[13px] font-semibold text-muted-foreground">
                    pts
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          {rest.length ? (
            <ol className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
              {rest.map((candidate, i) => (
                <li
                  key={candidate.id}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    candidate.teamId === league.userTeamId && "bg-secondary/50"
                  )}
                >
                  <span className="font-semibold">
                    {i + 2}. {candidate.name}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {teamAbbr(league, candidate.teamId)}
                  </span>
                  <p className="text-[12px] text-muted-foreground">{candidate.detail}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </article>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          disabled={index <= 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
        >
          {t("homeAwardsPrev")}
        </Button>
        {last ? (
          <Button onClick={onContinue}>{t("homeAwardsContinue")}</Button>
        ) : (
          <Button onClick={() => setIndex((value) => Math.min(slides.length - 1, value + 1))}>
            {t("homeAwardsNext")}
          </Button>
        )}
      </div>
    </section>
  );
}
