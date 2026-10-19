"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { LogOut, Maximize2, Minimize2 } from "lucide-react";

import { TeamLogo } from "@/components/brand/team-logo";
import { useGmStore } from "@/gm/state/gm-store";
import { useMyLeagueStore } from "@/gm/myleague/store";
import { GmNav } from "@/gm/ui/gm-nav";
import { FRANCHISES } from "@/gm/seed/franchises";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { leagueHasRealPlayers } from "@/gm/lib/counting";
import { userRecord, userTeam } from "@/gm/lib/selectors";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { ESPN_PLAYER_SEASON_HORIZON_START } from "@/gm/myleague/constants";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import "./gm-stage.css";

const PHASE_LABEL: Record<string, string> = {
  preseason: "Preseason",
  regular: "Regular season",
  play_in: "Play-in",
  playoffs: "Playoffs",
  draft: "Draft night",
  free_agency: "Free agency",
  offseason: "Offseason",
};

const GM_FICTION_NOTE =
  "Rosters start from real players, but ratings, injuries, trades and signings here are simulated and say nothing about the real players.";

type FullscreenNode = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

async function enterFullscreen(el: HTMLElement) {
  const node = el as FullscreenNode;
  if (typeof node.requestFullscreen === "function") {
    await node.requestFullscreen({ navigationUI: "hide" });
    return;
  }
  node.webkitRequestFullscreen?.();
}

async function exitFullscreen() {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await doc.webkitExitFullscreen?.();
}

async function toggleFullscreen(
  el: HTMLElement | null,
  full: boolean,
  setFull: (next: boolean) => void
) {
  if (full) {
    window.sessionStorage.removeItem("gm-full");
    delete document.documentElement.dataset.gmFull;
    setFull(false);
    await exitFullscreen().catch(() => undefined);
    return;
  }
  window.sessionStorage.setItem("gm-full", "1");
  document.documentElement.dataset.gmFull = "1";
  setFull(true);
  if (!el) return;
  try {
    await enterFullscreen(el);
  } catch {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      /* The desk still covers the site header if the window stays. */
    }
  }
}

export function GmShell({
  children,
  accentTeamId,
}: {
  children: ReactNode;
  /** When the screen is about another club, the desk uses their colors. */
  accentTeamId?: string | null;
}) {
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
  const [full, setFull] = useState(false);
  const deskRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("gm-full") === "1";
    if (stored) {
      document.documentElement.dataset.gmFull = "1";
      setFull(true);
    }
    const onChange = () => {
      if (document.fullscreenElement) return;
      if (window.sessionStorage.getItem("gm-full") !== "1") return;
      window.sessionStorage.removeItem("gm-full");
      delete document.documentElement.dataset.gmFull;
      setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

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
      <main data-gm data-motion-page className="site-shell flex flex-1 flex-col gap-4 py-8">
        <MotionReveal />
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
      <main
        data-gm
        data-motion-page
        className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8"
      >
        <MotionReveal />
        <p className="gm-disclaimer">
          Franchise Lab is a simulated front office. {GM_FICTION_NOTE}
        </p>
        <div>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
            My Teams
          </h1>
          <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">
            Real NBA rosters (with DARKO/RAPTOR) from{" "}
            {ESPN_PLAYER_SEASON_HORIZON_START} onward, with era CBA caps. RAPTOR
            only exists through 2021-22.
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

        <div data-motion-list className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {FRANCHISES.map((f) => {
            const brand = resolveTeamBrand(f.id);
            return (
              <button
                key={f.id}
                type="button"
                disabled={seeding}
                onClick={() => void newLeague(f.id, season)}
                className="group flex flex-col items-center gap-2 disabled:opacity-50"
              >
                <span
                  className="gm-pick flex size-[4.5rem] items-center justify-center group-disabled:transform-none"
                  style={
                    brand
                      ? ({ ["--pick" as string]: brand.primary } as CSSProperties)
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
  const record = userRecord(league);
  const phaseLabel = PHASE_LABEL[league.phase] ?? league.phase;

  return (
    <main
      ref={deskRef}
      data-gm
      data-motion-page
      className="site-shell flex flex-1 flex-col gap-4 py-4 sm:py-6"
      style={teamColorStyle(accentTeamId || team.id)}
    >
      <MotionReveal />
      <header className="gm-mast">
        <TeamLogo teamKey={team.id} size="md" priority />
        <div className="gm-mast__id">
          <h1>
            {team.city} {team.name}
          </h1>
          <p className="gm-mast__meta">
            <span className="gm-phase" data-phase={league.phase}>
              {phaseLabel}
            </span>
            <span>
              {league.season - 1}-{String(league.season).slice(-2)}
            </span>
            <span>Day {league.day}</span>
          </p>
        </div>
        <p className="gm-mast__record score-num">
          {record?.wins ?? 0}-{record?.losses ?? 0}
        </p>
        <div className="gm-mast__tools">
          <button
            type="button"
            className="gm-mast__tool"
            aria-label={full ? "Exit fullscreen" : "Fullscreen"}
            title={full ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => {
              void toggleFullscreen(deskRef.current, full, setFull);
            }}
          >
            {full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          </button>
          <button
            type="button"
            className="gm-mast__tool"
            aria-label="Leave league"
            title="Leave league"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                window.confirm("Leave this league and pick a new team?")
              ) {
                resetLeague();
              }
            }}
          >
            <LogOut aria-hidden />
          </button>
        </div>
      </header>
      <p className="gm-disclaimer">{GM_FICTION_NOTE}</p>
      {league.season >= currentNbaStartYear() + 1 ? null : (
        <div className="sports-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            This save still has {league.season - 1}-
            {String(league.season).slice(-2)} teams. Load{" "}
            {canonicalSeasonFromStartYear(currentNbaStartYear())} rosters so
            players are on this year's clubs.
          </p>
          <button
            type="button"
            className="gm-nav__link is-active"
            disabled={seeding}
            onClick={() =>
              void newLeague(
                league.userTeamId,
                canonicalSeasonFromStartYear(currentNbaStartYear())
              )
            }
          >
            {seeding
              ? "Loading rosters…"
              : `Load ${canonicalSeasonFromStartYear(currentNbaStartYear())} rosters`}
          </button>
        </div>
      )}
      {leagueHasRealPlayers(league) ? null : (
        <div className="sports-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            This save uses generated players. Load real NBA rosters for real
            names, season averages, and career logs.
          </p>
          <button
            type="button"
            className="gm-nav__link is-active"
            disabled={seeding}
            onClick={() =>
              void newLeague(
                league.userTeamId,
                canonicalSeasonFromStartYear(currentNbaStartYear())
              )
            }
          >
            {seeding ? "Loading rosters…" : "Load real NBA rosters"}
          </button>
        </div>
      )}
      {seedError ? <p className="text-sm text-red-300">{seedError}</p> : null}
      <GmNav />
      {league.incomingOffer ? (
        <Link
          href="/gm/trade"
          className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <span className="font-semibold">
            {league.teams.find((team) => team.id === league.incomingOffer?.fromTeamId)?.city ?? "A team"} sent a trade offer.
          </span>{" "}
          The sim is paused until you review it. You can change the pieces before you answer.
        </Link>
      ) : null}
      <div data-motion-stack className="pb-8">
        {children}
      </div>
    </main>
  );
}
