"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import { useGmStore } from "@/gm/state/gm-store";
import { useMyLeagueStore } from "@/gm/myleague/store";
import { GmNav } from "@/gm/ui/gm-nav";
import { FRANCHISES } from "@/gm/seed/franchises";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { userTeam } from "@/gm/lib/selectors";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { ESPN_PLAYER_SEASON_HORIZON_START } from "@/gm/myleague/constants";

export function GmShell({ children }: { children: ReactNode }) {
  const league = useGmStore((s) => s.league);
  const hydrated = useGmStore((s) => s.hydrated);
  const seeding = useGmStore((s) => s.seeding);
  const seedError = useGmStore((s) => s.seedError);
  const setHydrated = useGmStore((s) => s.setHydrated);
  const newLeague = useGmStore((s) => s.newLeague);
  const newGeneratedLeague = useGmStore((s) => s.newGeneratedLeague);
  const resetLeague = useGmStore((s) => s.resetLeague);
  const mlHydrated = useMyLeagueStore((s) => s.hydrated);
  const ensureBootstrapped = useMyLeagueStore((s) => s.ensureBootstrapped);
  const [season, setSeason] = useState(
    canonicalSeasonFromStartYear(currentNbaStartYear())
  );

  useEffect(() => {
    if (!hydrated) {
      const t = setTimeout(() => setHydrated(true), 50);
      return () => clearTimeout(t);
    }
  }, [hydrated, setHydrated]);

  useEffect(() => {
    if (!hydrated || !mlHydrated || !league) return;
    ensureBootstrapped(league);
  }, [
    hydrated,
    mlHydrated,
    league?.season,
    league?.phase,
    league?.day,
    league?.userTeamId,
    ensureBootstrapped,
    league,
  ]);

  if (!hydrated) {
    return (
      <main className="site-shell flex flex-1 flex-col gap-4 py-8">
        <p className="text-muted-foreground">Loading front office…</p>
      </main>
    );
  }

  if (!league) {
    const currentStart = currentNbaStartYear();
    const seasonOptions: string[] = [];
    for (let y = currentStart; y >= ESPN_PLAYER_SEASON_HORIZON_START; y -= 1) {
      seasonOptions.push(canonicalSeasonFromStartYear(y));
    }
    // Decade anchors first in the select via optgroup-like ordering: keep full list.

    return (
      <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
            My Teams
          </h1>
          <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">
            Real NBA rosters (ESPN + DARKO/LEBRON) from{" "}
            {ESPN_PLAYER_SEASON_HORIZON_START} onward, with era CBA caps.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[13px] font-semibold text-muted-foreground">
            Season
          </label>
          <select
            value={season}
            disabled={seeding}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-full border-0 bg-secondary px-3 py-1.5 text-[13px] font-semibold outline-none"
          >
            {seasonOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {seeding ? (
          <div className="sports-card px-4 py-6 text-center text-[15px] text-muted-foreground">
            Loading real players for {season}…
          </div>
        ) : null}

        {seedError ? (
          <div className="sports-card px-4 py-3 text-[13px] text-muted-foreground">
            Live seed issue: {seedError}. Falling back to a generated league if
            a team was selected.
          </div>
        ) : null}

        <div className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {FRANCHISES.map((f) => {
            const brand = resolveTeamBrand(f.id);
            return (
              <button
                key={f.id}
                type="button"
                disabled={seeding}
                onClick={() => void newLeague(f.id, season)}
                className="flex flex-col items-center gap-2 disabled:opacity-50"
              >
                <span
                  className="flex size-[4.5rem] items-center justify-center rounded-full bg-secondary"
                  style={
                    brand
                      ? {
                          background: `color-mix(in oklab, ${brand.primary} 12%, #e8e8ed)`,
                        }
                      : undefined
                  }
                >
                  <TeamLogo teamKey={f.id} size="lg" />
                </span>
                <span className="text-center text-[13px] font-medium">
                  {f.abbr}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={seeding}
          onClick={() => newGeneratedLeague("bos")}
          className="self-start text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          Use generated demo league instead
        </button>
      </main>
    );
  }

  const team = userTeam(league);
  const brand = resolveTeamBrand(team.id);

  return (
    <main
      className="site-shell flex flex-1 flex-col gap-4 py-4 sm:py-6"
      style={
        {
          "--team-primary": brand?.primary ?? "#1d1d1f",
          "--team-secondary": brand?.secondary ?? "#e8e8ed",
        } as CSSProperties
      }
    >
      <header
        className="sports-card score-card-wash overflow-hidden px-4 py-4"
        style={
          {
            "--away-color": brand?.primary ?? "#0071e3",
            "--home-color": brand?.secondary ?? "#af52de",
          } as CSSProperties
        }
      >
        <div className="flex items-center gap-3">
          <TeamLogo teamKey={team.id} size="xl" priority />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-muted-foreground">
              Franchise Lab · Real NBA
            </p>
            <h1 className="truncate text-[22px] font-bold tracking-tight">
              {team.city} {team.name}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {league.season - 1}-{String(league.season).slice(-2)} ·{" "}
              {league.phase}
            </p>
          </div>
          <Link
            href="/"
            className="ml-auto rounded-full bg-foreground/90 px-3 py-1.5 text-[13px] font-semibold text-background"
          >
            Home
          </Link>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                window.confirm("Leave this league and pick a new team?")
              ) {
                resetLeague();
              }
            }}
            className="text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Leave league
          </button>
        </div>
      </header>
      <GmNav />
      <div className="pb-8">{children}</div>
    </main>
  );
}
