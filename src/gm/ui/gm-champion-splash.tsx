"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/brand/team-logo";
import type { GmLeagueState } from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";

export function GmChampionSplash({
  league,
  onContinue,
}: {
  league: GmLeagueState;
  onContinue: () => void;
}) {
  const t = useTranslations("GmUi");
  const result = league.champion;
  if (!result) {
    return (
      <section className="sports-card flex flex-col gap-4 p-6">
        <h1 className="text-[28px] font-bold tracking-tight">{t("homeChampionTitle")}</h1>
        <p className="text-muted-foreground">{t("homeChampionMissing")}</p>
        <Button onClick={onContinue}>{t("homeChampionContinue")}</Button>
      </section>
    );
  }

  const team = league.teams.find((row) => row.id === result.teamId);
  const mvp = league.players.find((row) => row.id === result.finalsMvpId);
  const yours = result.teamId === league.userTeamId;
  const seasonLabel = `${league.season - 1}–${String(league.season).slice(-2)}`;
  const roster = league.players
    .filter((player) => player.teamId === result.teamId)
    .sort((a, b) => overallOf(b) - overallOf(a))
    .slice(0, 5);

  return (
    <section className="flex flex-col gap-4">
      <article className="sports-card relative overflow-hidden p-6 sm:p-10">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(1000px 420px at 50% -20%, color-mix(in oklab, var(--team-primary, #c9a227) 45%, transparent), transparent 72%),
              linear-gradient(180deg, color-mix(in oklab, var(--gm-shade, #111) 20%, transparent), transparent 55%)
            `,
          }}
        />
        <div className="relative flex flex-col items-center gap-5 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("homeChampionEyebrow", { season: seasonLabel })}
          </p>
          <TeamLogo teamKey={result.teamId} size="lg" />
          <div>
            <h1 className="text-[36px] font-bold tracking-tight sm:text-[48px]">
              {team ? `${team.city} ${team.name}` : result.teamId.toUpperCase()}
            </h1>
            <p className="mt-2 text-[18px] font-semibold">
              {t("homeChampionSubtitle", {
                score: `${result.wins}–${result.losses}`,
              })}
            </p>
            {yours ? (
              <p className="mt-2 text-[14px] font-semibold text-emerald-600 dark:text-emerald-400">
                {t("homeChampionYours")}
              </p>
            ) : null}
          </div>

          {mvp ? (
            <div className="mt-2 w-full max-w-md rounded-xl border border-border bg-background/70 px-5 py-4 text-left backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("homeChampionFmvp")}
              </p>
              <Link
                href={`/gm/player/${encodeURIComponent(mvp.id)}`}
                className="mt-1 block text-[24px] font-bold tracking-tight hover:underline"
              >
                {mvp.name}
              </Link>
              <p className="mt-1 text-[14px] text-muted-foreground">
                {mvp.position} · OVR {overallOf(mvp)}
              </p>
            </div>
          ) : null}

          {roster.length ? (
            <div className="w-full max-w-lg text-left">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("homeChampionCore")}
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {roster.map((player) => (
                  <li key={player.id} className="text-[14px]">
                    <Link
                      href={`/gm/player/${encodeURIComponent(player.id)}`}
                      className="font-semibold hover:underline"
                    >
                      {player.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      · {player.position} · {overallOf(player)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </article>

      <div className="flex justify-end">
        <Button onClick={onContinue}>{t("homeChampionContinue")}</Button>
      </div>
    </section>
  );
}
